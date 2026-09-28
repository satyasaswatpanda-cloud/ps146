import os

import networkx as nx

# Standard Bitcoin P2P ports never become graph nodes (they would only create
# a giant hub). Non-standard ports do: they are real network-layer evidence.
STANDARD_PORTS = {8333, 8332, 18333, 18332, 38333}
# Node kinds that act as broad "context hubs". They are drawn in the graph but
# excluded from the *backbone* used for clustering / graph statistics so they
# cannot glue unrelated activity into one giant blob.
HUB_KINDS = {"country", "asn", "port"}
MAX_EXPORT_NODES = int(os.environ.get("MAX_GRAPH_NODES", "1500"))
MAX_REL_PER_NODE = 40


def build_entity_graph(records):
    """
    Build the full network <-> blockchain entity graph.

    Node kinds:
      ip          observing/source IP           -> transaction  (observed)
      peer        destination IP of the link    <- ip           (connected_to)
      port        NON-standard P2P port         <- ip           (uses_port)
      country/asn geolocation / routing context <- ip           (geolocated_in / routed_via)
      transaction txid                          <- wallet (input), -> wallet (output)
      wallet      bitcoin address

    Network-layer nodes (IP, peer, port, country, ASN) and blockchain-layer
    nodes (transaction, wallet) live in ONE heterogeneous graph, which is the
    correlation the problem statement asks for.
    """
    g = nx.Graph()

    for r in records:
        ip = r.get("src_ip", "unknown")
        tx = r.get("txid", "unknown")
        country = r.get("geo_country", "UNKNOWN")
        asn = r.get("asn", "UNKNOWN")

        g.add_node(ip, kind="ip")
        g.add_node(tx, kind="transaction")
        g.add_edge(ip, tx, relation="observed")

        dst = r.get("dst_ip")
        if dst:
            peer = f"peer:{dst}"
            g.add_node(peer, kind="peer", address=dst)
            g.add_edge(ip, peer, relation="connected_to")

        for port in {int(r.get("src_port", 0) or 0), int(r.get("dst_port", 0) or 0)}:
            if port and port not in STANDARD_PORTS:
                pnode = f"port:{port}"
                g.add_node(pnode, kind="port", port=port)
                g.add_edge(ip, pnode, relation="uses_port")

        if country and country not in ("UNKNOWN",):
            g.add_node(country, kind="country")
            g.add_edge(ip, country, relation="geolocated_in")
        if asn and asn not in ("UNKNOWN",):
            g.add_node(asn, kind="asn")
            g.add_edge(ip, asn, relation="routed_via")

        for wallet in r.get("input_addresses", []):
            g.add_node(wallet, kind="wallet")
            g.add_edge(wallet, tx, relation="input")

        for wallet in r.get("output_addresses", []):
            g.add_node(wallet, kind="wallet")
            g.add_edge(tx, wallet, relation="output")

    return g


def backbone(g):
    """Graph without hub nodes: the structure clustering & graph stats use."""
    keep = [n for n, d in g.nodes(data=True) if d.get("kind") not in HUB_KINDS]
    return g.subgraph(keep)


def compute_graph_features(g, records):
    """
    Graph-derived detection features, aligned to `records`:
      [wallet_reuse_max, ip_wallet_span, component_size, pagerank_rel]
    """
    bb = backbone(g)
    comp_size = {}
    for comp in nx.connected_components(bb):
        size = len(comp)
        for node in comp:
            comp_size[node] = size

    n_nodes = max(bb.number_of_nodes(), 1)
    try:
        if n_nodes <= 100_000:
            pr = nx.pagerank(bb, alpha=0.85, max_iter=100, tol=1e-6)
        else:
            pr = nx.degree_centrality(bb)
    except Exception:  # pragma: no cover - never let a stat break detection
        pr = {}

    wallet_tx_deg = {
        n: sum(1 for nb in bb.neighbors(n) if bb.nodes[nb].get("kind") == "transaction")
        for n, d in bb.nodes(data=True) if d.get("kind") == "wallet"
    }
    ip_span = {}
    for n, d in bb.nodes(data=True):
        if d.get("kind") != "ip":
            continue
        wallets = set()
        for tx in bb.neighbors(n):
            if bb.nodes[tx].get("kind") == "transaction":
                wallets.update(w for w in bb.neighbors(tx) if bb.nodes[w].get("kind") == "wallet")
                if len(wallets) > 500:
                    break
        ip_span[n] = len(wallets)

    rows = []
    for r in records:
        wallets = list(r.get("input_addresses", [])) + list(r.get("output_addresses", []))
        rows.append([
            float(max((wallet_tx_deg.get(w, 0) for w in wallets), default=0)),
            float(ip_span.get(r.get("src_ip"), 0)),
            float(comp_size.get(r.get("txid"), 1)),
            float(pr.get(r.get("txid"), 0.0) * n_nodes),
        ])
    return rows


def _format_label(node_id, kind):
    if kind == "transaction":
        return f"TX: {node_id[:8]}..{node_id[-4:]}" if len(node_id) > 14 else f"TX: {node_id}"
    if kind == "wallet":
        return f"W: {node_id[:8]}..{node_id[-4:]}" if len(node_id) > 14 else f"W: {node_id}"
    if kind == "ip":
        return f"IP: {node_id}"
    if kind == "peer":
        return f"Peer: {str(node_id).split(':', 1)[-1]}"
    if kind == "port":
        return f"Port: {str(node_id).split(':', 1)[-1]}"
    if kind == "country":
        return f"Country: {node_id}"
    if kind == "asn":
        return f"ASN: {node_id}"
    return str(node_id)


def _select_export_nodes(g, alerts, extras, limit):
    """
    Keep the UI responsive on bulk data: export flagged entities, pattern
    members and their 1-hop context first, then top-degree nodes, up to `limit`.
    """
    priority = set()
    for a in alerts or []:
        if a.get("txid") in g:
            priority.add(a["txid"])
        if a.get("src_ip") in g:
            priority.add(a["src_ip"])
    priority.update(t for t in (extras or {}).get("tx_patterns", {}) if t in g)
    selected = set(priority)
    for n in list(priority):
        selected.update(g.neighbors(n))
        if len(selected) >= limit:
            break
    if len(selected) < limit:
        for n in sorted(g.nodes, key=lambda x: g.degree(x), reverse=True):
            selected.add(n)
            if len(selected) >= limit:
                break
    return selected


def export_cytoscape_elements(g, records=None, alerts=None, extras=None, limit=None):
    """
    Export nodes and edges in Cytoscape.js format.
    Exposes node IDs, labels, kind, metadata, degree, flagged alert status,
    pattern tags and resolved-entity membership.

    `extras` (optional): {"tx_patterns": {txid: [labels]},
                          "wallet_entity": {address: entity_id}}
    """
    records = records or []
    alerts = alerts or []
    extras = extras or {}
    tx_patterns = extras.get("tx_patterns", {})
    wallet_entity = extras.get("wallet_entity", {})
    limit = limit or MAX_EXPORT_NODES

    export_g = g
    if g.number_of_nodes() > limit:
        export_g = g.subgraph(_select_export_nodes(g, alerts, extras, limit))

    alert_by_tx = {a["txid"]: a for a in alerts if a.get("txid")}
    alert_by_ip = {}
    for a in alerts:
        ip = a.get("src_ip")
        if ip and (ip not in alert_by_ip or a.get("score", 0) > alert_by_ip[ip].get("score", 0)):
            alert_by_ip[ip] = a

    record_by_tx, record_by_ip = {}, {}
    for r in records:
        tx, ip = r.get("txid"), r.get("src_ip")
        if tx and tx not in record_by_tx:
            record_by_tx[tx] = r
        if ip and ip not in record_by_ip:
            record_by_ip[ip] = r

    def _count(node, kind):
        return len([nbr for nbr in g.neighbors(node) if g.nodes[nbr].get("kind") == kind])

    nodes = []
    for n in export_g.nodes:
        kind = g.nodes[n].get("kind", "unknown")
        degree = g.degree(n)

        relationships = []
        for nbr in list(g.neighbors(n))[:MAX_REL_PER_NODE]:
            edge_data = g.get_edge_data(n, nbr) or {}
            relationships.append({
                "neighbor_id": str(nbr),
                "neighbor_kind": g.nodes[nbr].get("kind", "unknown"),
                "relation": edge_data.get("relation", "connected"),
            })

        is_flagged = False
        alert_info = None
        if kind == "transaction" and n in alert_by_tx:
            is_flagged, alert_info = True, alert_by_tx[n]
        elif kind == "ip" and n in alert_by_ip:
            is_flagged, alert_info = True, alert_by_ip[n]

        metadata = {}
        if kind == "ip":
            r = record_by_ip.get(n, {})
            metadata = {
                "ip": n,
                "country": r.get("geo_country", "UNKNOWN"),
                "asn": r.get("asn", "UNKNOWN"),
                "geo_source": r.get("geo_source", "unknown"),
                "connected_transactions": _count(n, "transaction"),
            }
        elif kind == "transaction":
            r = record_by_tx.get(n, {})
            metadata = {
                "txid": n,
                "fee": r.get("fee", 0.0),
                "total_output": round(sum(r.get("output_amounts", []) or []), 6),
                "inputs_count": len(r.get("input_addresses", []) or []),
                "outputs_count": len(r.get("output_addresses", []) or []),
                "script_type": r.get("script_type", "unknown"),
                "timestamp": r.get("timestamp", ""),
            }
            if n in tx_patterns:
                metadata["patterns"] = tx_patterns[n]
        elif kind == "wallet":
            metadata = {"address": n, "connected_transactions": _count(n, "transaction")}
            if n in wallet_entity:
                metadata["entity_id"] = wallet_entity[n]
        elif kind == "peer":
            metadata = {"peer_ip": g.nodes[n].get("address", str(n)), "connected_ips": _count(n, "ip")}
        elif kind == "port":
            metadata = {"port": g.nodes[n].get("port"), "connected_ips": _count(n, "ip"),
                        "note": "non-standard Bitcoin P2P port"}
        elif kind == "country":
            metadata = {"country": n, "connected_ips": _count(n, "ip")}
        elif kind == "asn":
            metadata = {"asn": n, "connected_ips": _count(n, "ip")}

        node_data = {
            "id": str(n),
            "label": _format_label(n, kind),
            "kind": kind,
            "degree": degree,
            "connected_count": degree,
            "is_flagged": is_flagged,
            "relationships": relationships,
            "metadata": metadata,
        }
        if kind == "transaction" and n in tx_patterns:
            node_data["patterns"] = tx_patterns[n]
        if kind == "wallet" and n in wallet_entity:
            node_data["entity_id"] = wallet_entity[n]
        if is_flagged and alert_info:
            node_data["alert_id"] = alert_info.get("id")
            node_data["alert_score"] = alert_info.get("score")
            node_data["confidence"] = alert_info.get("confidence")
            node_data["flag_reasons"] = alert_info.get("reasons", [])

        nodes.append({"data": node_data})

    edges = []
    for idx, (u, v, d) in enumerate(export_g.edges(data=True)):
        rel = d.get("relation", "connected")
        u_kind = g.nodes[u].get("kind", "")
        v_kind = g.nodes[v].get("kind", "")

        # Orient edges meaningfully: Wallet->TX, TX->Wallet, IP->TX, IP->context
        source, target = u, v
        if rel == "input" and u_kind == "transaction" and v_kind == "wallet":
            source, target = v, u
        elif rel == "output" and u_kind == "wallet" and v_kind == "transaction":
            source, target = v, u
        elif rel == "observed" and u_kind == "transaction" and v_kind == "ip":
            source, target = v, u
        elif rel in ("geolocated_in", "routed_via", "connected_to", "uses_port") and v_kind == "ip":
            source, target = v, u

        edges.append({
            "data": {
                "id": f"e_{idx}_{source}_{target}",
                "source": str(source),
                "target": str(target),
                "relation": rel,
                "label": rel,
            }
        })

    return {"nodes": nodes, "edges": edges}


def summarize_graph(g, records=None, alerts=None, extras=None):
    bb = backbone(g)
    if bb.number_of_nodes() > 1:
        degree = nx.degree_centrality(g)
    else:
        degree = {n: 0 for n in g.nodes}
    top_nodes = sorted(
        [{"id": n, "kind": g.nodes[n].get("kind"), "centrality": round(degree.get(n, 0), 4)}
         for n in g.nodes],
        key=lambda x: x["centrality"],
        reverse=True,
    )[:12]

    kind_counts = {}
    for n in g.nodes:
        k = g.nodes[n].get("kind", "unknown")
        kind_counts[k] = kind_counts.get(k, 0) + 1

    elements = export_cytoscape_elements(g, records=records, alerts=alerts, extras=extras)
    return {
        "nodes": g.number_of_nodes(),
        "edges": g.number_of_edges(),
        "node_kinds": kind_counts,
        "top_nodes": top_nodes,
        "truncated": len(elements["nodes"]) < g.number_of_nodes(),
        "exported_nodes": len(elements["nodes"]),
        "elements": elements,
    }


def build_graph(records):
    """Back-compat convenience wrapper: build + summarize in one call."""
    g = build_entity_graph(records)
    return summarize_graph(g, records=records)
