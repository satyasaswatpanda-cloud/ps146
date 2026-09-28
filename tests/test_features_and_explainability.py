from pathlib import Path
from backend.services.parsers import parse_uploaded_bytes
from backend.services.geoip import enrich_records
from backend.services.features import build_features, FEATURE_NAMES, STANDARD_BITCOIN_PORTS
from backend.services.pipeline import analyze_records


def _sample_records():
    p = Path("data/sample/sample_transactions.csv")
    return enrich_records(parse_uploaded_bytes(p.name, p.read_bytes()))


def test_feature_vector_is_20_dimensional():
    records = _sample_records()
    features = build_features(records)
    assert len(FEATURE_NAMES) == 20
    assert all(len(row) == 20 for row in features)


def test_nonstandard_port_flag_fires_for_unusual_ports():
    records = [
        {"src_ip": "10.0.0.1", "dst_ip": "172.16.0.1", "src_port": 8333, "dst_port": 8333,
         "txid": "tx1", "input_addresses": ["a"], "output_addresses": ["b"],
         "input_amounts": [1.0], "output_amounts": [0.9], "fee": 0.001,
         "geo_country": "US", "asn": "AS1", "timestamp": "2026-01-01T00:00:00Z"},
        {"src_ip": "10.0.0.2", "dst_ip": "172.16.0.2", "src_port": 31337, "dst_port": 4444,
         "txid": "tx2", "input_addresses": ["c"], "output_addresses": ["d"],
         "input_amounts": [1.0], "output_amounts": [0.9], "fee": 0.001,
         "geo_country": "US", "asn": "AS1", "timestamp": "2026-01-01T00:01:00Z"},
    ]
    features = build_features(records)
    port_idx = FEATURE_NAMES.index("nonstandard_port")
    assert features[0][port_idx] == 0.0  # standard 8333 <-> 8333
    assert features[1][port_idx] == 1.0  # non-standard ports


def test_burst_timing_is_short_for_rapid_repeat_src_ip():
    records = [
        {"src_ip": "10.0.0.5", "dst_ip": "172.16.0.5", "src_port": 8333, "dst_port": 8333,
         "txid": "tx1", "input_addresses": ["a"], "output_addresses": ["b"],
         "input_amounts": [1.0], "output_amounts": [0.9], "fee": 0.001,
         "geo_country": "US", "asn": "AS1", "timestamp": "2026-01-01T00:00:00Z"},
        {"src_ip": "10.0.0.5", "dst_ip": "172.16.0.5", "src_port": 8333, "dst_port": 8333,
         "txid": "tx2", "input_addresses": ["c"], "output_addresses": ["d"],
         "input_amounts": [1.0], "output_amounts": [0.9], "fee": 0.001,
         "geo_country": "US", "asn": "AS1", "timestamp": "2026-01-01T00:00:01Z"},  # 1s later
    ]
    features = build_features(records)
    burst_idx = FEATURE_NAMES.index("src_ip_burst_timing")
    # First sighting of this src_ip -> large default gap (~1 day, log1p(86400)).
    assert features[0][burst_idx] > 10
    # Second sighting, 1 second later -> small gap (~log1p(1)).
    assert features[1][burst_idx] < 1


def test_pipeline_includes_shap_explanation_for_alerts():
    result = analyze_records(_sample_records())
    assert "TreeSHAP" in result["summary"]["model"]
    for alert in result["alerts"]:
        assert "shap_explanation" in alert
        explanation = alert["shap_explanation"]
        # Either populated (shap available) or None (graceful fallback) --
        # both are acceptable, but if present it must be well-formed and
        # every contribution must point toward "anomaly" (these are all
        # flagged/outlier records, so at least the top feature should).
        if explanation is not None:
            assert 1 <= len(explanation) <= 3
            for item in explanation:
                assert item["feature"] in FEATURE_NAMES
                assert item["direction"] in ("pushes toward anomaly", "pushes toward normal")
            assert explanation[0]["direction"] == "pushes toward anomaly"


def test_nonstandard_port_reason_appears_in_alerts_when_triggered():
    records = []
    for i in range(20):
        records.append({
            "timestamp": f"2026-01-01T{i:02d}:00:00Z", "src_ip": f"10.0.0.{i}",
            "dst_ip": f"172.16.0.{i}", "src_port": 8333, "dst_port": 8333,
            "txid": f"tx{i}", "input_addresses": [f"in{i}"], "output_addresses": [f"out{i}"],
            "input_amounts": [1.0], "output_amounts": [0.99], "fee": 0.001,
            "geo_country": "US", "asn": "AS1",
        })
    records.append({
        "timestamp": "2026-01-01T05:00:01Z", "src_ip": "10.0.0.5",
        "dst_ip": "172.16.0.5", "src_port": 31337, "dst_port": 4444,
        "txid": "txbad", "input_addresses": ["inbad"], "output_addresses": ["outbad"],
        "input_amounts": [1.0], "output_amounts": [0.99], "fee": 0.001,
        "geo_country": "US", "asn": "AS1",
    })
    records = enrich_records(records)
    result = analyze_records(records)
    bad_alert = next((a for a in result["alerts"] if a["txid"] == "txbad"), None)
    assert bad_alert is not None
    assert "non-standard Bitcoin P2P port observed on this link" in bad_alert["reasons"]
