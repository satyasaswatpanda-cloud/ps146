from pathlib import Path

from backend.services.parsers import parse_uploaded_bytes
from backend.services.geoip import classify_ip, resolve, enrich_records
from backend.services.graphing import build_entity_graph
from backend.services.clustering import build_clusters


def test_classify_ip_private_vs_public():
    assert classify_ip("10.0.0.5") == "private"
    assert classify_ip("172.16.4.1") == "private"
    assert classify_ip("8.8.8.8") == "public"
    assert classify_ip("not-an-ip") == "invalid"


def test_resolve_prefers_existing_feed_values():
    country, asn, source = resolve("8.8.8.8", existing_country="US", existing_asn="AS15169")
    assert (country, asn, source) == ("US", "AS15169", "source-feed")


def test_resolve_falls_back_to_private_range():
    country, asn, source = resolve("10.0.0.2", existing_country="", existing_asn="")
    assert source == "rfc1918"
    assert country == "PRIVATE-RANGE"


def test_enrich_records_fills_missing_geo():
    records = [{"src_ip": "10.0.0.9", "geo_country": "", "asn": ""}]
    enriched = enrich_records(records)
    assert enriched[0]["geo_country"] == "PRIVATE-RANGE"
    assert enriched[0]["geo_source"] == "rfc1918"


def test_clusters_group_shared_wallets_and_flag_alerts():
    p = Path("data/sample/sample_transactions.csv")
    records = parse_uploaded_bytes(p.name, p.read_bytes())
    records = enrich_records(records)
    graph = build_entity_graph(records)
    txids = {r["txid"] for r in records}
    # pretend the first txid was flagged, to check propagation into clusters
    flagged = {next(iter(txids))}
    clusters = build_clusters(graph, records, flagged)
    assert isinstance(clusters, list)
    for c in clusters:
        assert c["size"] >= 2
        assert "cluster_id" in c
    assert any(c["contains_flagged_alert"] for c in clusters)
