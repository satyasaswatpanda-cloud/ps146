"""
Entity clustering over the IP / wallet / transaction graph.

The PS asks for "cluster entities" as a distinct deliverable from anomaly
detection. This module groups related wallets, IPs and transactions into
explainable clusters using two lightweight, deterministic graph techniques
(no black-box model, so every cluster assignment is auditable):

  1. Connected components -- entities that are transitively linked by a
     shared transaction, wallet, or observing IP belong to the same
     "activity cluster" (a standard heuristic-clustering building block,
     analogous to common-input-ownership heuristics used in real chain
     analysis).
  2. Within any large/dense component, `greedy_modularity_communities`
     (built into networkx, no extra dependency) further splits it into
     tighter sub-communities so one giant connected blob doesn't hide
     structure.

Each cluster is summarized with size, member breakdown by entity kind,
total value observed, and whether it contains an already-flagged alert --
so an investigator gets "why this cluster matters" for free.
"""
from __future__ import annotations

import networkx as nx

LARGE_COMPONENT_THRESHOLD = 8  # split components bigger than this into sub-communities


def _component_clusters(graph, component_nodes):
    """Split one connected component into one or more clusters."""
    if len(component_nodes) <= LARGE_COMPONENT_THRESHOLD:
        return [component_nodes]

    sub = graph.subgraph(component_nodes)
    try:
        communities = list(nx.algorithms.community.greedy_modularity_communities(sub))
        if communities:
            return [set(c) for c in communities]
    except Exception:
        pass
    return [component_nodes]


def build_clusters(graph, records, alert_txids=None):
    """
    Returns a ranked list of entity clusters.

    graph: the networkx Graph produced by graphing.build_graph's internal
           graph (see pipeline.py, which now builds the graph once and
           passes it to both graphing summary and clustering).
    records: normalized transaction records (for value/amount lookups).
    alert_txids: set of txids already flagged by the anomaly model, so a
                 cluster can be marked as containing a flagged transaction.
    """
    alert_txids = alert_txids or set()
    amount_by_tx = {
        r.get("txid"): sum(r.get("output_amounts", []) or [])
        for r in records
    }

    clusters = []
    for idx, component in enumerate(nx.connected_components(graph)):
        if len(component) < 2:
            continue  # isolated node -- not an interesting cluster
        for sub_cluster in _component_clusters(graph, component):
            kinds = {"wallet": 0, "transaction": 0, "ip": 0, "country": 0, "asn": 0}
            tx_ids = []
            for node in sub_cluster:
                kind = graph.nodes[node].get("kind", "unknown")
                kinds[kind] = kinds.get(kind, 0) + 1
                if kind == "transaction":
                    tx_ids.append(node)

            total_value = round(sum(amount_by_tx.get(tx, 0.0) for tx in tx_ids), 6)
            flagged = [tx for tx in tx_ids if tx in alert_txids]

            clusters.append({
                "cluster_id": f"CLU-{idx+1:03d}-{len(clusters)+1}",
                "size": len(sub_cluster),
                "wallets": kinds.get("wallet", 0),
                "transactions": kinds.get("transaction", 0),
                "ips": kinds.get("ip", 0),
                "total_output_value": total_value,
                "contains_flagged_alert": bool(flagged),
                "flagged_txids": flagged[:5],
                "sample_members": sorted(sub_cluster)[:8],
                "reason": (
                    "Multiple transactions/wallets are transitively linked "
                    "(shared wallet reuse or shared observing IP)."
                    if kinds.get("transaction", 0) > 1
                    else "Single transaction with multiple counterpart wallets."
                ),
            })

    clusters.sort(key=lambda c: (c["contains_flagged_alert"], c["size"]), reverse=True)
    return clusters[:25]
