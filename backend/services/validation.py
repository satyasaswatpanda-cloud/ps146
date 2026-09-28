"""
Validation harness: benchmarks the full pipeline against synthetic ground
truth so the platform's own accuracy claims are measurable, not asserted.

Metrics
  * transaction-level detection: precision / recall / F1 / ROC-AUC against
    the synthetic "illicit" label (peeling / mixing / fanout / burst).
  * peeling-chain recovery: fraction of true peeling-chain transactions
    captured by `detect_peeling_chains`.
  * entity resolution: fraction of a chain's true wallet-address set that
    ends up in the same resolved entity (cluster purity).

Runs (params, metrics, feature importances) are logged to MLflow.
"""
from __future__ import annotations

import time
from typing import Any, Dict, List

import numpy as np
from sklearn.metrics import average_precision_score, precision_recall_fscore_support, roc_auc_score

from backend.services import tracking
from backend.services.entities import resolve_entities
from backend.services.patterns import detect_patterns
from backend.services.pipeline import analyze_records
from backend.services.synthetic import generate_dataset


def run_benchmark(seed: int = 7, log_to_mlflow: bool = True, **gen_kwargs) -> Dict[str, Any]:
    t0 = time.time()
    dataset = generate_dataset(seed=seed, **gen_kwargs)
    records, labels, illicit = dataset["records"], dataset["labels"], dataset["illicit"]

    result = analyze_records(records)
    alerts = result["alerts"]
    alert_txids = {a["txid"]: a["score"] for a in alerts}

    y_true = np.array([1 if labels.get(r["txid"]) != "normal" else 0 for r in records])
    y_score = np.array([alert_txids.get(r["txid"], 0.0) for r in records])
    y_pred = (y_score > 0).astype(int)

    precision, recall, f1, _ = precision_recall_fscore_support(y_true, y_pred, average="binary", zero_division=0)
    try:
        auc = float(roc_auc_score(y_true, y_score))
        ap = float(average_precision_score(y_true, y_score))
    except ValueError:
        auc = ap = float("nan")

    patterns = detect_patterns(records)
    true_peel_txids = {t for t, k in labels.items() if k == "peeling"}
    found_peel_txids = {t for c in patterns["peeling_chains"] for t in c["txids"]}
    peel_recall = len(true_peel_txids & found_peel_txids) / max(len(true_peel_txids), 1)
    peel_precision = len(true_peel_txids & found_peel_txids) / max(len(found_peel_txids), 1)

    true_mix_txids = {t for t, k in labels.items() if k == "mixing"}
    found_mix_txids = {m["txid"] for m in patterns["mixing_events"]}
    mix_recall = len(true_mix_txids & found_mix_txids) / max(len(true_mix_txids), 1)

    entities = resolve_entities(records, patterns["peeling_chains"])
    purities = []
    for truth_set in dataset["entity_truth"]:
        eids = [entities["wallet_entity"].get(a) for a in truth_set]
        counts: Dict[str, int] = {}
        for e in eids:
            if e:
                counts[e] = counts.get(e, 0) + 1
        purities.append((max(counts.values()) / len(truth_set)) if counts else 0.0)
    entity_purity = float(np.mean(purities)) if purities else None

    metrics = {
        "precision": round(float(precision), 4), "recall": round(float(recall), 4),
        "f1": round(float(f1), 4), "roc_auc": round(auc, 4) if auc == auc else None,
        "avg_precision": round(ap, 4) if ap == ap else None,
        "peeling_chain_recall": round(peel_recall, 4), "peeling_chain_precision": round(peel_precision, 4),
        "mixing_recall": round(mix_recall, 4),
        "entity_resolution_purity": round(entity_purity, 4) if entity_purity is not None else None,
        "n_records": len(records), "n_illicit": int(y_true.sum()), "runtime_seconds": round(time.time() - t0, 3),
    }
    run_id = None
    if log_to_mlflow:
        run_id = tracking.log_run(
            experiment="antardrishti-validation", run_name=f"benchmark-seed{seed}",
            params={"seed": seed, "model": result["summary"]["model"], **gen_kwargs},
            metrics={k: v for k, v in metrics.items() if isinstance(v, (int, float)) and v is not None},
        )
    return {"metrics": metrics, "mlflow_run_id": run_id, "dataset_composition": _composition(labels)}


def _composition(labels: Dict[str, str]) -> Dict[str, int]:
    out: Dict[str, int] = {}
    for k in labels.values():
        out[k] = out.get(k, 0) + 1
    return out
