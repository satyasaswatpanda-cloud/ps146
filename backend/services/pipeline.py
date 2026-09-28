"""
End-to-end analysis pipeline.

Stages (each degrades gracefully if its optional dependency is missing):

  1. GeoIP enrichment                    (geoip.py)
  2. Entity/network graph                (graphing.py)           NetworkX
  3. Graph-pattern detection             (patterns.py)           peeling / mixing
  4. Feature engineering                 (features.py)           DuckDB + graph + pattern features
  5. Detection: IsolationForest+CatBoost (models.py)              blended risk score
  6. Explainability: TreeSHAP            (explain.py)
  7. Entity resolution (Union-Find)      (entities.py)           wallet clustering + network origin
  8. Graph learning + DBSCAN             (graph_learning.py)     GraphSAGE (or fallback) + density clusters
  9. Alert-level clustering              (clustering.py)         unchanged, back-compat
 10. Local-LLM narrative + validator     (llm.py)                grounded, optional
 11. MLflow run logging                  (tracking.py)           best-effort

Backward compatible: `analyze_records(records)` still returns
{summary, alerts, graph, clusters}; new keys (`patterns`, `entities`,
`wallet_clusters`, `network_bridges`) are additive.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone

import numpy as np
from sklearn.ensemble import IsolationForest  # noqa: F401  (kept for import back-compat)

from backend.services import explain, models, neo4j_sync, tracking
from backend.services.clustering import build_clusters
from backend.services.entities import network_bridges, resolve_entities
from backend.services.features import FEATURE_NAMES, build_features
from backend.services.geoip import enrich_records
from backend.services.graph_learning import cluster_wallets
from backend.services.graphing import backbone, build_entity_graph, compute_graph_features, summarize_graph
from backend.services.llm import narrate
from backend.services.patterns import detect_patterns
from backend.services.flow_tracing import trace_mixing_flows

HIGH_RISK_COUNTRIES = {"KP", "IR", "SY"}
NARRATE_TOP_N = 8  # keep narrative generation flat-cost on bulk uploads

_SHAP_AVAILABLE = explain.SHAP_AVAILABLE
_CATBOOST_AVAILABLE = models.CATBOOST_AVAILABLE


def _is_nonstandard_port(record):
    from backend.services.features import STANDARD_BITCOIN_PORTS
    src_port = record.get("src_port", 0) or 0
    dst_port = record.get("dst_port", 0) or 0
    return src_port not in STANDARD_BITCOIN_PORTS or dst_port not in STANDARD_BITCOIN_PORTS


def analyze_records(records, run_llm: bool = False, log_run: bool = True, sync_neo4j: bool = False):
    t0 = time.time()
    records = enrich_records(records)

    graph = build_entity_graph(records)
    bb = backbone(graph)
    graph_features = compute_graph_features(graph, records)

    pat = detect_patterns(records)
    per_record = pat["per_record"]
    pattern_scores = [
        (per_record.get(i, {}).get("peeling", 0.0), per_record.get(i, {}).get("mixing", 0.0))
        for i in range(len(records))
    ]

    features = build_features(records, graph_features=graph_features, pattern_scores=pattern_scores)
    X = np.asarray(features, dtype=float)

    if_result = models.fit_isolation_forest(X)
    if_labels, if_norm = if_result["labels"], if_result["norm"]

    weak_positive = np.array([
        1 if (if_labels[i] == -1 or pattern_scores[i][0] > 0 or pattern_scores[i][1] > 0) else 0
        for i in range(len(records))
    ])
    true_labels = [models.parse_label(r.get("label")) for r in records]
    cb_result = models.fit_catboost(X, weak_positive, true_labels)
    cb_active = cb_result["status"] == "active"
    blended = models.blend(if_norm, cb_result["prob"] if cb_active else None,
                           supervised=(cb_result.get("mode") == "supervised"))

    lo, hi = (float(blended.min()), float(blended.max())) if len(blended) else (0.0, 1.0)
    span = (hi - lo) or 1.0

    flagged_idx = [i for i in range(len(records)) if if_labels[i] == -1]
    if cb_active:
        cb_threshold = 0.5
        flagged_idx = sorted(set(flagged_idx) | {i for i, p in enumerate(cb_result["prob"]) if p >= cb_threshold})
    pattern_idx = {i for i in per_record}
    flagged_idx = sorted(set(flagged_idx) | pattern_idx)

    if_shap_map = explain.if_shap(if_result["model"], X, flagged_idx)
    cb_shap_map = explain.catboost_shap(cb_result["model"], X, flagged_idx) if cb_active else {i: None for i in flagged_idx}

    entities = resolve_entities(records, pat["peeling_chains"])
    wallet_entity = entities["wallet_entity"]
    entity_by_id = {e["entity_id"]: e for e in entities["entities"]}
    bridges = network_bridges(records, wallet_entity)
    mixing_flows = trace_mixing_flows(records, pat["mixing_events"])

    alerts = []
    for idx in flagged_idx:
        record = records[idx]
        raw = float(blended[idx])
        score = round(((raw - lo) / span) * 100, 1)

        reasons = []
        if len(record.get("output_addresses", [])) >= 4:
            reasons.append("many output addresses")
        if sum(record.get("output_amounts", [])) > 25:
            reasons.append("large aggregate output amount")
        if float(record.get("fee", 0) or 0) > 0.02:
            reasons.append("unusually high fee in this synthetic dataset")
        if record.get("geo_country") in HIGH_RISK_COUNTRIES:
            reasons.append(f"source jurisdiction flagged as high-risk ({record.get('geo_country')})")
        if record.get("geo_source") == "rfc1918":
            reasons.append("source IP is a private/reserved range (no public geolocation)")
        if _is_nonstandard_port(record):
            reasons.append("non-standard Bitcoin P2P port observed on this link")
        pattern_labels = pat["tx_patterns"].get(record.get("txid"), [])
        for label in pattern_labels:
            reasons.append(f"graph pattern: {label}")
        if if_labels[idx] == -1 and cb_active and cb_result["prob"][idx] >= 0.5:
            reasons.append("flagged by both IsolationForest and CatBoost")
        elif cb_active and cb_result["prob"][idx] >= 0.5 and if_labels[idx] != -1:
            reasons.append(f"CatBoost ({cb_result['mode']}) flagged this record")
        if not reasons:
            reasons.append("anomalous feature combination")

        input_addrs = record.get("input_addresses", [])
        entity_id = wallet_entity.get(input_addrs[0]) if input_addrs else None
        network_origin = entity_by_id.get(entity_id, {}).get("network_origin") if entity_id else None

        alert = {
            "id": f"ALT-{idx + 1:03d}",
            "txid": record.get("txid"),
            "src_ip": record.get("src_ip"),
            "geo_country": record.get("geo_country"),
            "asn": record.get("asn"),
            "score": score,
            "confidence": round(0.50 + 0.49 * ((raw - lo) / span), 2),
            "reasons": reasons,
            "shap_explanation": if_shap_map.get(idx),
            "catboost_shap_explanation": cb_shap_map.get(idx),
            "patterns": pattern_labels,
            "entity_id": entity_id,
            "network_origin": network_origin,
            "detectors": {
                "isolation_forest": "outlier" if if_labels[idx] == -1 else "inlier",
                "catboost": (round(float(cb_result["prob"][idx]), 4) if cb_active else None),
                "graph_pattern": bool(pattern_labels),
            },
        }
        alerts.append(alert)

    alerts.sort(key=lambda x: x["score"], reverse=True)
    for i, a in enumerate(alerts[:NARRATE_TOP_N]):
        a["narrative"] = narrate(
            {**a, "entity_type": "transaction", "entity": a["txid"], "supporting_txids": [a["txid"]]},
            use_llm=run_llm,
        )

    alert_txids = {a["txid"] for a in alerts}
    clusters = build_clusters(graph, records, alert_txids)

    wc = cluster_wallets(records, bb, set(pat["tx_patterns"]))

    model_parts = ["IsolationForest"]
    if _CATBOOST_AVAILABLE:
        model_parts.append(f"CatBoost ({cb_result['status']}{'/' + cb_result['mode'] if cb_result.get('mode') else ''})")
    model_parts.append("graph-pattern detection (peeling/mixing)")
    model_parts.append("Union-Find entity resolution")
    if wc["status"] == "active":
        model_parts.append(f"{wc['method']} + DBSCAN wallet clustering")
    model_parts.append("graph-based clustering")
    if _SHAP_AVAILABLE:
        model_parts.append("TreeSHAP explainability")
    model_desc = " + ".join(model_parts)

    summary = {
        "records": len(records),
        "alerts": len(alerts),
        "clusters": len(clusters),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model": model_desc,
        "data_notice": "Prototype output from synthetic/demo metadata; alerts are investigative leads, not proof of wrongdoing.",
        "runtime_seconds": round(time.time() - t0, 3),
        "catboost": {k: v for k, v in cb_result.items() if k not in ("model", "prob")},
        "wallet_clustering": {k: v for k, v in wc.items() if k not in ("wallet_label",)},
    }

    if log_run:
        tracking.log_run(
            experiment="antardrishti-analysis", run_name=f"run-{summary['generated_at']}",
            params={"n_records": len(records), "model": model_desc,
                    "catboost_status": cb_result["status"], "wallet_clustering": wc["status"]},
            metrics={"alerts": len(alerts), "clusters": len(clusters),
                    "peeling_chains": len(pat["peeling_chains"]), "mixing_events": len(pat["mixing_events"]),
                    "runtime_seconds": summary["runtime_seconds"]},
            artifacts={"feature_importance": explain.global_importance(cb_result.get("model"))} if cb_active else None,
        )

    # Neo4j / GDS graph-analytics stage: an explicit pipeline step (not just a
    # post-hoc sync) when the optional service is configured and reachable.
    # A documented no-op ({"available": False, ...}) otherwise.
    neo4j_result = None
    graph_analytics = None
    if sync_neo4j:
        neo4j_result = neo4j_sync.sync_graph(graph, run_id=summary["generated_at"], alert_txids=alert_txids)
        if neo4j_result.get("synced"):
            graph_analytics = neo4j_sync.run_gds_analysis(run_id=summary["generated_at"])
        else:
            graph_analytics = {"stage": "neo4j_gds", "available": False,
                               "reason": neo4j_result.get("reason", "graph not synced")}

    return {
        "summary": summary,
        "alerts": alerts[:20],
        "graph": summarize_graph(graph, records=records, alerts=alerts, extras={"tx_patterns": pat["tx_patterns"],
                                                                                "wallet_entity": wallet_entity}),
        "clusters": clusters,
        "patterns": {"peeling_chains": pat["peeling_chains"][:20], "mixing_events": pat["mixing_events"][:20],
                    "summary": pat["summary"]},
        "entities": {"entities": entities["entities"], "summary": entities["summary"]},
        "network_bridges": bridges,
        "wallet_clusters": wc,
        "mixing_flows": mixing_flows,
        "neo4j_sync": neo4j_result,
        "graph_analytics": graph_analytics,
    }
