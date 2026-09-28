from pathlib import Path
from backend.services.parsers import parse_uploaded_bytes
from backend.services.pipeline import analyze_records

def test_pipeline_returns_graph_and_summary():
    p = Path("data/sample/sample_transactions.csv")
    result = analyze_records(parse_uploaded_bytes(p.name, p.read_bytes()))
    assert result["summary"]["records"] > 0
    assert result["graph"]["nodes"] > 0
    assert "alerts" in result


def test_pipeline_includes_clusters_and_geo_fields():
    p = Path("data/sample/sample_transactions.csv")
    result = analyze_records(parse_uploaded_bytes(p.name, p.read_bytes()))
    assert "clusters" in result
    assert result["summary"]["clusters"] == len(result["clusters"])
    for alert in result["alerts"]:
        assert "geo_country" in alert
        assert "asn" in alert


def test_pipeline_returns_cytoscape_elements():
    p = Path("data/sample/sample_transactions.csv")
    result = analyze_records(parse_uploaded_bytes(p.name, p.read_bytes()))
    graph = result["graph"]
    assert "elements" in graph
    elements = graph["elements"]
    assert "nodes" in elements
    assert "edges" in elements
    assert len(elements["nodes"]) == graph["nodes"]
    assert len(elements["edges"]) == graph["edges"]

    kinds = {n["data"]["kind"] for n in elements["nodes"]}
    assert "ip" in kinds
    assert "transaction" in kinds
    assert "wallet" in kinds
    assert "country" in kinds
    assert "asn" in kinds

    # Verify node structure
    sample_node = elements["nodes"][0]["data"]
    assert "id" in sample_node
    assert "label" in sample_node
    assert "kind" in sample_node
    assert "connected_count" in sample_node
    assert "relationships" in sample_node
    assert "metadata" in sample_node

    # Verify edge structure
    sample_edge = elements["edges"][0]["data"]
    assert "id" in sample_edge
    assert "source" in sample_edge
    assert "target" in sample_edge
    assert "relation" in sample_edge

    # Verify flagged nodes when alerts are present
    if result["alerts"]:
        flagged_nodes = [n for n in elements["nodes"] if n["data"].get("is_flagged")]
        assert len(flagged_nodes) > 0
        first_flagged = flagged_nodes[0]["data"]
        assert "alert_id" in first_flagged
        assert "alert_score" in first_flagged
        assert "flag_reasons" in first_flagged

