from backend.services.synthetic import generate_dataset
from backend.services.patterns import detect_patterns
from backend.services.entities import resolve_entities, network_bridges, wallet_behavior
from backend.services.graphing import build_entity_graph, backbone
from backend.services.graph_learning import cluster_wallets
from backend.services.models import parse_label, fit_isolation_forest, fit_catboost, blend
from backend.services.pipeline import analyze_records
import numpy as np


def _dataset(seed=11):
    return generate_dataset(seed=seed)


def test_peeling_chain_detection_matches_synthetic_ground_truth():
    d = _dataset()
    patterns = detect_patterns(d["records"])
    found = {tx for c in patterns["peeling_chains"] for tx in c["txids"]}
    truth = {t for t, k in d["labels"].items() if k == "peeling"}
    assert found == truth
    for c in patterns["peeling_chains"]:
        assert c["length"] >= 3
        assert 0.0 <= c["score"] <= 1.0
        assert "network" in c and c["network"]["dominant_ip"]


def test_mixing_detection_flags_equal_value_outputs():
    d = _dataset()
    patterns = detect_patterns(d["records"])
    found = {m["txid"] for m in patterns["mixing_events"]}
    truth = {t for t, k in d["labels"].items() if k == "mixing"}
    assert truth.issubset(found)
    for m in patterns["mixing_events"]:
        assert m["equal_output_count"] >= 3


def test_entity_resolution_groups_peeling_chain_wallets():
    d = _dataset()
    patterns = detect_patterns(d["records"])
    entities = resolve_entities(d["records"], patterns["peeling_chains"])
    for truth_wallets in d["entity_truth"]:
        eids = {entities["wallet_entity"].get(w) for w in truth_wallets}
        eids.discard(None)
        assert len(eids) == 1  # the whole chain resolves to a single entity


def test_network_bridges_link_shared_relay_ips():
    d = _dataset()
    entities = resolve_entities(d["records"], [])
    bridges = network_bridges(d["records"], entities["wallet_entity"])
    assert isinstance(bridges, list)
    for b in bridges:
        assert b["linked_actors"] >= 2


def test_wallet_behavior_vectors_have_consistent_dimension():
    d = _dataset()
    beh = wallet_behavior(d["records"])
    dims = {len(v) for v in beh.values()}
    assert dims == {14}


def test_wallet_clustering_runs_on_synthetic_data():
    d = _dataset()
    g = build_entity_graph(d["records"])
    bb = backbone(g)
    result = cluster_wallets(d["records"], bb)
    assert result["status"] == "active"
    assert result["algorithm"] == "DBSCAN"
    assert result["method"]  # either pyg-graphsage or the documented fallback


def test_parse_label_variants():
    assert parse_label("illicit") == 1
    assert parse_label("1") == 1
    assert parse_label("licit") == 0
    assert parse_label("0") == 0
    assert parse_label("maybe") is None
    assert parse_label(None) is None


def test_isolation_forest_and_catboost_blend_shapes():
    d = _dataset()
    from backend.services.features import build_features
    X = np.asarray(build_features(d["records"]), dtype=float)
    if_result = fit_isolation_forest(X)
    assert len(if_result["norm"]) == len(X)
    weak = (if_result["labels"] == -1).astype(int)
    cb_result = fit_catboost(X, weak, [None] * len(X))
    assert cb_result["status"] in ("active", "skipped")
    blended = blend(if_result["norm"], cb_result.get("prob"))
    assert len(blended) == len(X)


def test_pipeline_alerts_carry_new_evidence_fields():
    d = _dataset()
    result = analyze_records(d["records"], log_run=False)
    assert result["patterns"]["summary"]["peeling_chains"] >= 1
    assert result["entities"]["summary"]["multi_wallet_entities"] >= 1
    for alert in result["alerts"]:
        assert "patterns" in alert
        assert "entity_id" in alert
        assert "detectors" in alert
    assert any(a.get("narrative") for a in result["alerts"][:3])


def test_mixing_flow_tracing_links_pre_and_post_hops():
    from backend.services.flow_tracing import trace_mixing_flows
    d = _dataset()
    patterns = detect_patterns(d["records"])
    flows = trace_mixing_flows(d["records"], patterns["mixing_events"])
    assert len(flows) == len(patterns["mixing_events"])
    for f in flows:
        assert f["pre_mix_count"] >= 1
        assert f["post_mix_reach"] >= 1
        assert f["same_relay_before_and_after"], "synthetic generator reuses one relay IP pre/post mix"


def test_pipeline_includes_mixing_flows_and_graph_analytics_stage():
    d = _dataset()
    result = analyze_records(d["records"], log_run=False)
    assert "mixing_flows" in result
    assert len(result["mixing_flows"]) == result["patterns"]["summary"]["mixing_events"]
    # neo4j/GDS is off by default in this environment: must be a documented no-op, never absent/broken
    assert result["graph_analytics"] is None  # sync_neo4j defaults to False
    result2 = analyze_records(d["records"], log_run=False, sync_neo4j=True)
    assert result2["graph_analytics"]["stage"] == "neo4j_gds"
    assert result2["graph_analytics"]["available"] is False
