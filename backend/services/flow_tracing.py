"""
Mixer/tumbler flow tracing ("bypass tumbling" investigation flow).

`detect_mixing` (patterns.py) only flags the mixer-shaped transaction itself.
This module follows the money THROUGH it:

    pre-mix funding txs  -->  mixing-like tx  -->  post-mix output txs
                                                 -->  subsequent hops (BFS)

For every mixing event we walk backward from its inputs (who funded the
mixer) and forward from its outputs (where the mixed coins went next, and
the hop after that), producing one flow record per mixing event that an
investigator can read as a single story instead of an isolated alert.

Everything here is graph-structural (shared addresses / amounts), not
statistical, so it's exact given the observed data -- the usual caveat is
that a real tumbler can span data the platform never ingested.
"""
from __future__ import annotations

from typing import Any, Dict, List

MAX_FORWARD_HOPS = 2
MAX_BRANCH = 6


def _index(records: List[Dict[str, Any]]):
    by_txid: Dict[str, Dict[str, Any]] = {}
    spends: Dict[str, List[str]] = {}   # address -> [txid that spends it as an input]
    funds: Dict[str, List[str]] = {}    # address -> [txid that pays it as an output]
    for r in records:
        tx = r.get("txid")
        if tx not in by_txid:
            by_txid[tx] = r
        for a in r.get("input_addresses", []):
            spends.setdefault(a, []).append(tx)
        for a in r.get("output_addresses", []):
            funds.setdefault(a, []).append(tx)
    return by_txid, spends, funds


def _pre_mix_sources(record, funds, by_txid, limit=MAX_BRANCH):
    sources = []
    for addr in record.get("input_addresses", [])[:limit]:
        for tx in funds.get(addr, []):
            if tx != record.get("txid"):
                r = by_txid[tx]
                sources.append({"txid": tx, "address": addr, "src_ip": r.get("src_ip"),
                                "geo_country": r.get("geo_country"), "asn": r.get("asn"),
                                "timestamp": r.get("timestamp")})
    return sources[:limit]


def _post_mix_hops(record, spends, by_txid, hops=MAX_FORWARD_HOPS, limit=MAX_BRANCH):
    """BFS forward from each mixed-output address, `hops` transactions deep."""
    frontier = [{"address": a, "path": []} for a in record.get("output_addresses", [])[:limit]]
    levels: List[List[Dict[str, Any]]] = []
    seen_tx = {record.get("txid")}
    for _ in range(hops):
        level = []
        next_frontier = []
        for node in frontier:
            for tx in spends.get(node["address"], [])[:2]:
                if tx in seen_tx:
                    continue
                seen_tx.add(tx)
                r = by_txid[tx]
                hop = {"txid": tx, "from_address": node["address"], "src_ip": r.get("src_ip"),
                       "geo_country": r.get("geo_country"), "asn": r.get("asn"),
                       "timestamp": r.get("timestamp"),
                       "output_addresses": r.get("output_addresses", [])[:MAX_BRANCH]}
                level.append(hop)
                for out_addr in r.get("output_addresses", [])[:3]:
                    next_frontier.append({"address": out_addr, "path": node["path"] + [tx]})
            if len(level) >= limit:
                break
        if not level:
            break
        levels.append(level)
        frontier = next_frontier[:limit * 2]
    return levels


def trace_mixing_flows(records: List[Dict[str, Any]], mixing_events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    by_txid, spends, funds = _index(records)
    flows = []
    for event in mixing_events:
        record = by_txid.get(event["txid"])
        if not record:
            continue
        pre = _pre_mix_sources(record, funds, by_txid)
        post_levels = _post_mix_hops(record, spends, by_txid)
        distinct_pre_ips = {s["src_ip"] for s in pre if s.get("src_ip")}
        distinct_post_ips = {h["src_ip"] for lvl in post_levels for h in lvl if h.get("src_ip")}
        continuity_ip = sorted(distinct_pre_ips & distinct_post_ips)
        flows.append({
            "flow_id": event["mix_id"],
            "mixer_txid": event["txid"],
            "mixer_src_ip": record.get("src_ip"),
            "pre_mix_sources": pre,
            "pre_mix_count": len(pre),
            "post_mix_hops": post_levels,
            "post_mix_reach": sum(len(lvl) for lvl in post_levels),
            "same_relay_before_and_after": continuity_ip,
            "note": ("Same source IP relayed both a pre-mix funding transaction and a post-mix spend: "
                     "the on-chain link is broken by the mixer, but the network-layer relay is not."
                     if continuity_ip else
                     "No shared relay IP observed before and after the mixer in this dataset; "
                     "on-chain and network-layer trails both stop at the mixer."),
        })
    return flows
