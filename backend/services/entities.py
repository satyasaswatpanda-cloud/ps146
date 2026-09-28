"""
Entity intelligence: wallet -> entity resolution, network-origin attribution
and per-wallet behavioural profiles.

Entity resolution uses a Union-Find (disjoint-set) structure with two
documented, auditable heuristics:

  * common-input ownership: every input address of one transaction is
    controlled by the same actor (Meiklejohn et al., "A Fistful of Bitcoins");
  * peeling-change continuity: inside a detected peeling chain the change
    output that funds the next hop belongs to the sender.

These are heuristics, not proof; every entity lists the heuristics that
produced it. Each entity is then attributed a *candidate network origin*
(source IP / ASN / country that relayed most of its transactions) which is the
"identify physical network origin" deliverable: a lead for the investigator.
"""
from __future__ import annotations

import math
from collections import Counter, defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional


class UnionFind:
    def __init__(self):
        self.parent: Dict[str, str] = {}
        self.size: Dict[str, int] = {}

    def add(self, x: str) -> None:
        if x not in self.parent:
            self.parent[x] = x
            self.size[x] = 1

    def find(self, x: str) -> str:
        self.add(x)
        root = x
        while self.parent[root] != root:
            root = self.parent[root]
        while self.parent[x] != root:  # path compression
            self.parent[x], x = root, self.parent[x]
        return root

    def union(self, a: str, b: str) -> bool:
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return False
        if self.size[ra] < self.size[rb]:
            ra, rb = rb, ra
        self.parent[rb] = ra
        self.size[ra] += self.size[rb]
        return True


def _epoch(value: Any) -> Optional[float]:
    text = str(value or "").strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    return dt.timestamp() if dt.tzinfo else dt.replace(tzinfo=None).timestamp()


def resolve_entities(records: List[Dict[str, Any]], chains: Optional[List[Dict[str, Any]]] = None,
                     max_entities: int = 40) -> Dict[str, Any]:
    uf = UnionFind()
    heuristics: Dict[str, set] = defaultdict(set)

    for r in records:
        inputs = r.get("input_addresses", [])
        for a in inputs:
            uf.add(a)
        for a in r.get("output_addresses", []):
            uf.add(a)
        for a in inputs[1:]:
            if uf.union(inputs[0], a):
                pass
    # remember which roots were produced by common-input
    for r in records:
        inputs = r.get("input_addresses", [])
        if len(inputs) > 1:
            heuristics[uf.find(inputs[0])].add("common-input")

    for c in chains or []:
        by_tx = {r.get("txid"): r for r in records}
        for tx, change in zip(c["txids"], c["change_addresses"]):
            inputs = by_tx.get(tx, {}).get("input_addresses", [])
            if inputs and change:
                uf.union(inputs[0], change)
        # re-attach heuristic tags to the merged root
        for tx in c["txids"]:
            inputs = by_tx.get(tx, {}).get("input_addresses", [])
            if inputs:
                heuristics[uf.find(inputs[0])].add("peeling-change")

    members: Dict[str, List[str]] = defaultdict(list)
    for addr in list(uf.parent):
        members[uf.find(addr)].append(addr)

    # merge heuristic tags that landed on stale roots
    tags: Dict[str, set] = defaultdict(set)
    for old_root, hs in heuristics.items():
        tags[uf.find(old_root)].update(hs)

    multi = {root: sorted(addrs) for root, addrs in members.items() if len(addrs) >= 2}
    ordered = sorted(multi.items(), key=lambda kv: (-len(kv[1]), kv[1][0]))
    entity_id_of_root = {root: f"ENT-{k:03d}" for k, (root, _) in enumerate(ordered, 1)}
    wallet_entity = {a: entity_id_of_root[root] for root, addrs in multi.items() for a in addrs}

    wallet_set_by_entity = {entity_id_of_root[root]: set(addrs) for root, addrs in multi.items()}
    stats: Dict[str, Dict[str, Any]] = {
        eid: {"tx": set(), "recv": 0.0, "sent": 0.0, "ips": Counter(), "asns": Counter(),
              "countries": Counter(), "ts": []}
        for eid in wallet_set_by_entity
    }
    for r in records:
        touched = set()
        for a, v in zip(r.get("input_addresses", []), r.get("input_amounts", [])):
            eid = wallet_entity.get(a)
            if eid:
                stats[eid]["sent"] += v
                touched.add(eid)
        for a, v in zip(r.get("output_addresses", []), r.get("output_amounts", [])):
            eid = wallet_entity.get(a)
            if eid:
                stats[eid]["recv"] += v
                touched.add(eid)
        for eid in touched:
            st = stats[eid]
            st["tx"].add(r.get("txid"))
            st["ips"][r.get("src_ip")] += 1
            if r.get("asn"):
                st["asns"][r.get("asn")] += 1
            if r.get("geo_country"):
                st["countries"][r.get("geo_country")] += 1
            t = _epoch(r.get("timestamp"))
            if t is not None:
                st["ts"].append(t)

    entities = []
    for root, addrs in ordered:
        eid = entity_id_of_root[root]
        st = stats[eid]
        n_tx = len(st["tx"])
        top_ip, top_n = (st["ips"].most_common(1) or [(None, 0)])[0]
        share = top_n / max(sum(st["ips"].values()), 1)
        origin = None
        if top_ip:
            origin_asn = (st["asns"].most_common(1) or [(None, 0)])[0][0]
            origin_country = (st["countries"].most_common(1) or [(None, 0)])[0][0]
            origin = {
                "src_ip": top_ip,
                "asn": origin_asn,
                "country": origin_country,
                "relay_share": round(share, 2),
                "observations": top_n,
                "confidence": round(min(0.95, share * min(1.0, n_tx / 4)), 2),
                # Explicit origin -> geo -> routing chain, for the dashboard's origin panel
                # and for network_bridges() to reason about without re-deriving it.
                "chain": [
                    {"level": "ip", "value": top_ip},
                    {"level": "country", "value": origin_country},
                    {"level": "asn", "value": origin_asn},
                ],
                "note": "Candidate network origin (most frequent relaying IP). Investigative lead, not attribution.",
            }
        entities.append({
            "entity_id": eid,
            "wallet_count": len(addrs),
            "wallets": addrs[:10],
            "transactions": n_tx,
            "total_received": round(st["recv"], 6),
            "total_sent": round(st["sent"], 6),
            "heuristics": sorted(tags.get(root, {"common-input"})) or ["common-input"],
            "first_seen": min(st["ts"]) if st["ts"] else None,
            "last_seen": max(st["ts"]) if st["ts"] else None,
            "network_origin": origin,
        })

    return {
        "wallet_entity": wallet_entity,
        "entities": entities[:max_entities],
        "summary": {
            "wallets": len(uf.parent),
            "multi_wallet_entities": len(multi),
            "largest_entity": max((len(a) for a in multi.values()), default=1),
        },
    }


def network_bridges(records: List[Dict[str, Any]], wallet_entity: Dict[str, str],
                    limit: int = 15) -> List[Dict[str, Any]]:
    """
    Source IPs that relayed transactions belonging to >= 2 DIFFERENT wallet
    entities. On-chain the entities look unrelated (e.g. separated by a mixer);
    the shared relay is the network-layer link that bridges them.
    """
    by_ip: Dict[str, Dict[str, Any]] = {}
    for r in records:
        inputs = r.get("input_addresses", [])
        if not inputs:
            continue
        actor = wallet_entity.get(inputs[0], inputs[0])
        slot = by_ip.setdefault(r.get("src_ip"), {"actors": set(), "txids": [], "asn": r.get("asn"),
                                                   "country": r.get("geo_country")})
        slot["actors"].add(actor)
        if len(slot["txids"]) < 6:
            slot["txids"].append(r.get("txid"))
    bridges = [
        {"src_ip": ip, "asn": v["asn"], "geo_country": v["country"],
         "linked_actors": len(v["actors"]), "sample_txids": v["txids"],
         "note": "Same relaying IP observed for multiple otherwise-unlinked wallet actors."}
        for ip, v in by_ip.items() if len(v["actors"]) >= 2
    ]
    bridges.sort(key=lambda b: b["linked_actors"], reverse=True)
    return bridges[:limit]


BEHAVIOR_FEATURES = [
    "tx_as_input", "tx_as_output", "log_received", "log_sent", "log_mean_received", "log_max_received",
    "log_mean_fee", "distinct_ips", "distinct_countries", "distinct_asns", "log_active_span",
    "mean_output_fanout", "nonstandard_port_share", "pattern_share",
]


def wallet_behavior(records: List[Dict[str, Any]], tx_pattern_txids: Optional[set] = None,
                    standard_ports=frozenset({8333, 8332, 18333, 18332, 38333}),
                    max_wallets: int = 30000) -> Dict[str, List[float]]:
    """Per-wallet behavioural feature vectors (input to the embedding stage)."""
    tx_pattern_txids = tx_pattern_txids or set()
    agg: Dict[str, Dict[str, Any]] = {}

    def slot(addr):
        return agg.setdefault(addr, {"in": 0, "out": 0, "recv": [], "sent": 0.0, "fees": [], "ips": set(),
                                     "cc": set(), "asn": set(), "ts": [], "fan": [], "nonstd": 0, "pat": 0, "n": 0})

    for r in records:
        nonstd = any((p or 0) not in standard_ports for p in (r.get("src_port"), r.get("dst_port")))
        in_pattern = r.get("txid") in tx_pattern_txids
        t = _epoch(r.get("timestamp"))
        fan = len(r.get("output_addresses", []))
        fee = float(r.get("fee", 0.0) or 0.0)
        common = []
        for a, v in zip(r.get("input_addresses", []), r.get("input_amounts", [])):
            common.append(a)
            s = slot(a)
            s["in"] += 1
            s["sent"] += v
            s["fan"].append(fan)
        for a, v in zip(r.get("output_addresses", []), r.get("output_amounts", [])):
            common.append(a)
            s = slot(a)
            s["out"] += 1
            s["recv"].append(v)
        for a in set(common):
            s = slot(a)
            s["n"] += 1
            s["fees"].append(fee)
            s["ips"].add(r.get("src_ip"))
            if r.get("geo_country"):
                s["cc"].add(r.get("geo_country"))
            if r.get("asn"):
                s["asn"].add(r.get("asn"))
            s["nonstd"] += int(nonstd)
            s["pat"] += int(in_pattern)
            if t is not None:
                s["ts"].append(t)

    ranked = sorted(agg.items(), key=lambda kv: (-kv[1]["n"], kv[0]))[:max_wallets]
    out: Dict[str, List[float]] = {}
    for addr, s in ranked:
        recv = s["recv"] or [0.0]
        span = (max(s["ts"]) - min(s["ts"])) if len(s["ts"]) > 1 else 0.0
        out[addr] = [
            float(s["in"]), float(s["out"]),
            math.log1p(sum(recv)), math.log1p(s["sent"]),
            math.log1p(sum(recv) / len(recv)), math.log1p(max(recv)),
            math.log1p(sum(s["fees"]) / max(len(s["fees"]), 1)),
            float(len(s["ips"])), float(len(s["cc"])), float(len(s["asn"])),
            math.log1p(span),
            (sum(s["fan"]) / len(s["fan"])) if s["fan"] else 0.0,
            s["nonstd"] / max(s["n"], 1),
            s["pat"] / max(s["n"], 1),
        ]
    return out
