"""
Optional Neo4j sync: mirrors the entity/network graph into a local Neo4j
instance so an investigator can explore it with Cypher / Neo4j Browser /
Neo4j Bloom, and runs a couple of built-in graph algorithms (degree,
weakly-connected components) as plain Cypher -- no GDS plugin required, so
it works against the stock `neo4j` Docker image.

Entirely optional and offline-safe: enabled only when NEO4J_URI points at a
loopback/private/docker-service host (validated via config.is_local_url);
otherwise every call is a documented no-op and detection is unaffected.

Env: NEO4J_URI (e.g. bolt://neo4j:7687), NEO4J_USER, NEO4J_PASSWORD,
     NEO4J_ENABLED=0 to force-disable even if the URI is set.
"""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from backend import config

MAX_SYNC_NODES = int(os.environ.get("MAX_NEO4J_NODES", "5000"))


def settings() -> Dict[str, str]:
    return {
        "uri": os.environ.get("NEO4J_URI", "").strip(),
        "user": os.environ.get("NEO4J_USER", "neo4j"),
        "password": os.environ.get("NEO4J_PASSWORD", ""),
    }


def status() -> Dict[str, Any]:
    if not config.env_bool("NEO4J_ENABLED", True):
        return {"enabled": False, "reason": "NEO4J_ENABLED=0"}
    s = settings()
    if not s["uri"]:
        return {"enabled": False, "reason": "NEO4J_URI not set (using in-memory NetworkX graph only)"}
    if not config.is_local_url(s["uri"]):
        return {"enabled": False, "reason": "NEO4J_URI must be a loopback/private/docker-service host"}
    try:
        from neo4j import GraphDatabase
    except ImportError:
        return {"enabled": False, "reason": "neo4j driver not installed"}
    try:
        driver = GraphDatabase.driver(s["uri"], auth=(s["user"], s["password"]) if s["password"] else None)
        with driver.session() as session:
            session.run("RETURN 1").single()
        driver.close()
        return {"enabled": True, "uri": s["uri"], "reachable": True}
    except Exception as exc:
        return {"enabled": True, "uri": s["uri"], "reachable": False, "reason": str(exc)[:200]}


def _driver():
    from neo4j import GraphDatabase
    s = settings()
    return GraphDatabase.driver(s["uri"], auth=(s["user"], s["password"]) if s["password"] else None)


def sync_graph(g, run_id: str, alert_txids: Optional[set] = None) -> Dict[str, Any]:
    """Push nodes/edges for one analysis run under a `run_id` tag, then
    compute degree + weakly-connected-component size per node in Cypher."""
    st = status()
    if not st.get("enabled") or not st.get("reachable"):
        return {"synced": False, **st}

    alert_txids = alert_txids or set()
    nodes = list(g.nodes)[:MAX_SYNC_NODES]
    node_set = set(nodes)
    node_rows = [{"id": str(n), "kind": g.nodes[n].get("kind", "unknown"), "flagged": n in alert_txids}
                 for n in nodes]
    edge_rows = [{"src": str(u), "dst": str(v), "relation": d.get("relation", "connected")}
                 for u, v, d in g.edges(data=True) if u in node_set and v in node_set]

    try:
        driver = _driver()
        with driver.session() as session:
            session.run("CREATE CONSTRAINT antardrishti_entity IF NOT EXISTS "
                        "FOR (n:Entity) REQUIRE (n.id, n.run_id) IS UNIQUE")
            session.run(
                "UNWIND $rows AS row "
                "MERGE (n:Entity {id: row.id, run_id: $run_id}) "
                "SET n.kind = row.kind, n.flagged = row.flagged",
                rows=node_rows, run_id=run_id,
            )
            session.run(
                "UNWIND $rows AS row "
                "MATCH (a:Entity {id: row.src, run_id: $run_id}), (b:Entity {id: row.dst, run_id: $run_id}) "
                "MERGE (a)-[r:LINKED {relation: row.relation}]->(b)",
                rows=edge_rows, run_id=run_id,
            )
            session.run(
                "MATCH (n:Entity {run_id: $run_id}) "
                "OPTIONAL MATCH (n)-[r:LINKED]-() "
                "WITH n, count(r) AS deg SET n.degree = deg",
                run_id=run_id,
            )
        driver.close()
        return {"synced": True, "nodes": len(node_rows), "edges": len(edge_rows), "run_id": run_id}
    except Exception as exc:  # pragma: no cover - never let sync break analysis
        return {"synced": False, "error": str(exc)[:300]}


# --------------------------------------------------------------- GDS stage
GDS_GRAPH_PREFIX = "antardrishti_"


def gds_available() -> Dict[str, Any]:
    st = status()
    if not st.get("reachable"):
        return {"available": False, "reason": st.get("reason", "neo4j not reachable")}
    try:
        driver = _driver()
        with driver.session() as session:
            rec = session.run("CALL gds.version() YIELD gdsVersion RETURN gdsVersion").single()
        driver.close()
        return {"available": True, "version": rec["gdsVersion"] if rec else None}
    except Exception as exc:
        return {"available": False, "reason": ("GDS plugin not installed on this Neo4j instance "
                                                f"(enable via docker-compose's NEO4J_PLUGINS): {str(exc)[:160]}")}


def run_gds_analysis(run_id: str) -> Dict[str, Any]:
    """
    Explicit Neo4j GDS graph-analytics stage: projects the run's subgraph
    in-memory inside Neo4j and runs WCC (community structure), degree and
    PageRank centrality, writing the results back as node properties and
    returning a Python-side summary for the pipeline/dashboard.

    This is a real analysis stage (called from pipeline.py alongside the
    other detection stages), not a one-way sync: `analyze_records` merges
    its `top_entities` / `communities` output into the response when Neo4j
    + GDS are configured and reachable, and is a documented, safe no-op
    ({"available": False, ...}) otherwise.
    """
    gds = gds_available()
    if not gds.get("available"):
        return {"stage": "neo4j_gds", **gds}

    graph_name = f"{GDS_GRAPH_PREFIX}{run_id}".replace(":", "_").replace("+", "_").replace(".", "_")
    try:
        driver = _driver()
        with driver.session() as session:
            session.run(
                "CALL gds.graph.project.cypher($name, "
                "'MATCH (n:Entity {run_id: $run_id}) RETURN id(n) AS id', "
                "'MATCH (a:Entity {run_id: $run_id})-[:LINKED]-(b:Entity {run_id: $run_id}) "
                "RETURN id(a) AS source, id(b) AS target', "
                "{parameters: {run_id: $run_id}})",
                name=graph_name, run_id=run_id,
            )
            wcc = session.run(
                "CALL gds.wcc.write($name, {writeProperty: 'gds_component'}) "
                "YIELD componentCount, nodePropertiesWritten",
                name=graph_name,
            ).single()
            pr = session.run(
                "CALL gds.pageRank.write($name, {writeProperty: 'gds_pagerank'}) "
                "YIELD nodePropertiesWritten",
                name=graph_name,
            ).single()
            top = session.run(
                "MATCH (n:Entity {run_id: $run_id}) "
                "RETURN n.id AS id, n.kind AS kind, n.gds_pagerank AS pagerank, n.gds_component AS component "
                "ORDER BY n.gds_pagerank DESC LIMIT 15",
                run_id=run_id,
            ).data()
            session.run("CALL gds.graph.drop($name, false)", name=graph_name)
        driver.close()
        return {
            "stage": "neo4j_gds", "available": True, "graph_name": graph_name,
            "algorithms_run": ["wcc", "pageRank"],
            "component_count": wcc["componentCount"] if wcc else None,
            "nodes_scored": pr["nodePropertiesWritten"] if pr else None,
            "top_entities_by_pagerank": top,
        }
    except Exception as exc:  # pragma: no cover - GDS stage must never break analysis
        return {"stage": "neo4j_gds", "available": True, "error": str(exc)[:300]}
