"""
Graph-pattern detection for laundering-style behaviour.

Two structural patterns are detected directly on the transaction graph:

  1. Peeling chains -- a long run of 2-output transactions where a small
     "peel" leaves the chain and the larger "change" output is spent by the
     very next hop ("How to Peel a Million", Meiklejohn/Moore-style heuristic).
  2. Mixing-like transactions -- CoinJoin-shaped transactions: many inputs and
     many EQUAL-valued outputs, which break the input->output value link.

Every detection carries network-layer evidence (which source IPs / ASNs /
countries relayed the hops). That is how the platform points at "network
origin" even when on-chain obfuscation hides who owns the coins: the relaying
infrastructure is far harder to randomise than the wallet graph.

All results are investigative leads; thresholds are documented constants.
"""
from __future__ import annotations

import math
from collections import Counter
from datetime import datetime
from typing import Any, Dict, List, Optional

PEEL_RATIO_MAX = 0.6          # peel / change amount
MIN_CHAIN_LENGTH = 3          # hops required to call it a chain
VALUE_DECAY_TOLERANCE = 1.05  # each hop may not grow the carried value
MIX_MIN_EQUAL = 3
MIX_MIN_INPUTS = 3


def _epoch(value: Any) -> Optional[float]:
    text = str(value or "").strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    return dt.timestamp() if dt.tzinfo else dt.replace(tzinfo=None).timestamp()


def _peel_shape(record) -> Optional[Dict[str, Any]]:
    outs = list(zip(record.get("output_addresses", []), record.get("output_amounts", [])))
    if len(outs) != 2 or len(record.get("input_addresses", [])) > 3:
        return None
    (a1, v1), (a2, v2) = outs
    if v1 <= 0 or v2 <= 0:
        return None
    (change_addr, change), (peel_addr, peel) = ((a1, v1), (a2, v2)) if v1 >= v2 else ((a2, v2), (a1, v1))
    if peel / change > PEEL_RATIO_MAX:
        return None
    return {"change_addr": change_addr, "change": change, "peel_addr": peel_addr, "peel": peel}


def _network_summary(records) -> Dict[str, Any]:
    ips = Counter(r.get("src_ip") for r in records)
    asns = Counter(r.get("asn") for r in records if r.get("asn"))
    countries = Counter(r.get("geo_country") for r in records if r.get("geo_country"))
    top_ip, top_n = ips.most_common(1)[0]
    return {
        "src_ips": dict(ips.most_common(5)),
        "asns": dict(asns.most_common(3)),
        "countries": dict(countries.most_common(3)),
        "dominant_ip": top_ip,
        "dominant_ip_share": round(top_n / len(records), 2),
    }


def detect_peeling_chains(records: List[Dict[str, Any]], min_len: int = MIN_CHAIN_LENGTH) -> List[Dict[str, Any]]:
    shapes: Dict[int, Dict[str, Any]] = {}
    first_idx_of_tx: Dict[str, int] = {}
    for i, r in enumerate(records):
        tx = r.get("txid")
        if tx in first_idx_of_tx:
            continue
        first_idx_of_tx[tx] = i
        shape = _peel_shape(r)
        if shape:
            shapes[i] = shape
    if len(shapes) < min_len:
        return []

    spenders: Dict[str, List[int]] = {}
    for i in shapes:
        for addr in records[i].get("input_addresses", []):
            spenders.setdefault(addr, []).append(i)

    ts = {i: _epoch(records[i].get("timestamp")) for i in shapes}
    total_in = {i: sum(records[i].get("input_amounts", []) or []) for i in shapes}

    nxt: Dict[int, int] = {}
    for i, shape in shapes.items():
        candidates = []
        for j in spenders.get(shape["change_addr"], []):
            if j == i:
                continue
            if ts[i] is not None and ts[j] is not None and ts[j] < ts[i]:
                continue
            if total_in[j] > total_in[i] * VALUE_DECAY_TOLERANCE:
                continue
            candidates.append(j)
        if candidates:
            nxt[i] = min(candidates, key=lambda j: (ts[j] is None, ts[j] or 0.0, j))

    has_prev = set(nxt.values())
    chains: List[Dict[str, Any]] = []
    for start in sorted(shapes, key=lambda i: (ts[i] is None, ts[i] or 0.0, i)):
        if start in has_prev:
            continue
        path, seen = [start], {start}
        while path[-1] in nxt and nxt[path[-1]] not in seen:
            path.append(nxt[path[-1]])
            seen.add(path[-1])
        if len(path) < min_len:
            continue
        recs = [records[i] for i in path]
        gaps = [ts[b] - ts[a] for a, b in zip(path, path[1:]) if ts[a] is not None and ts[b] is not None]
        net = _network_summary(recs)
        score = min(1.0, 0.5 + 0.1 * (len(path) - min_len))
        if net["dominant_ip_share"] >= 0.6:
            score = min(1.0, score + 0.1)
        chains.append({
            "chain_id": f"CHN-{len(chains) + 1:03d}",
            "pattern": "peeling_chain",
            "length": len(path),
            "txids": [r["txid"] for r in recs],
            "indices": path,
            "change_addresses": [shapes[i]["change_addr"] for i in path],
            "start_value": round(total_in[path[0]], 6),
            "peeled_total": round(sum(shapes[i]["peel"] for i in path), 6),
            "final_change": round(shapes[path[-1]]["change"], 6),
            "median_gap_seconds": round(sorted(gaps)[len(gaps) // 2], 1) if gaps else None,
            "network": net,
            "single_relay_origin": net["dominant_ip_share"] >= 0.6,
            "score": round(score, 2),
            "reason": (f"{len(path)} consecutive 2-output transactions; the larger output is spent by the "
                       f"next hop while a smaller amount peels off (peeling-chain shape)."),
        })
    chains.sort(key=lambda c: (c["score"], c["length"]), reverse=True)
    for k, c in enumerate(chains, 1):
        c["chain_id"] = f"CHN-{k:03d}"
    return chains


def detect_mixing(records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    events: List[Dict[str, Any]] = []
    seen = set()
    for i, r in enumerate(records):
        tx = r.get("txid")
        if tx in seen:
            continue
        seen.add(tx)
        outs = r.get("output_amounts", []) or []
        n_in = len(r.get("input_addresses", []))
        n_out = len(outs)
        if n_out < MIX_MIN_EQUAL:
            continue
        counts = Counter(round(v, 6) for v in outs if v > 0)
        if not counts:
            continue
        value, k = counts.most_common(1)[0]
        if k < max(MIX_MIN_EQUAL, math.ceil(0.5 * n_out)):
            continue
        if not (n_in >= MIX_MIN_INPUTS or k >= 5):
            continue
        score = min(1.0, (k / n_out) * 0.6 + min(1.0, n_in / 8) * 0.4)
        events.append({
            "mix_id": "",
            "pattern": "mixing_like",
            "txid": tx,
            "index": i,
            "inputs": n_in,
            "outputs": n_out,
            "equal_output_value": value,
            "equal_output_count": k,
            "src_ip": r.get("src_ip"),
            "asn": r.get("asn"),
            "geo_country": r.get("geo_country"),
            "score": round(score, 2),
            "reason": (f"{k} of {n_out} outputs carry the identical value {value} BTC from {n_in} inputs "
                       f"(CoinJoin-like: breaks the input->output value link)."),
        })
    events.sort(key=lambda e: e["score"], reverse=True)
    for k, e in enumerate(events, 1):
        e["mix_id"] = f"MIX-{k:03d}"
    return events


def detect_patterns(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    chains = detect_peeling_chains(records)
    mixes = detect_mixing(records)

    per_record: Dict[int, Dict[str, Any]] = {}
    tx_patterns: Dict[str, List[str]] = {}
    tx_to_idx: Dict[str, List[int]] = {}
    for i, r in enumerate(records):
        tx_to_idx.setdefault(r.get("txid"), []).append(i)

    for c in chains:
        for hop, tx in enumerate(c["txids"], 1):
            label = f"{c['chain_id']} hop {hop}/{c['length']}"
            tx_patterns.setdefault(tx, []).append(label)
            for i in tx_to_idx.get(tx, []):
                slot = per_record.setdefault(i, {"peeling": 0.0, "mixing": 0.0, "labels": []})
                slot["peeling"] = max(slot["peeling"], c["score"])
                slot["labels"].append(f"part of peeling chain {label}")
    for m in mixes:
        tx_patterns.setdefault(m["txid"], []).append(m["mix_id"])
        for i in tx_to_idx.get(m["txid"], []):
            slot = per_record.setdefault(i, {"peeling": 0.0, "mixing": 0.0, "labels": []})
            slot["mixing"] = max(slot["mixing"], m["score"])
            slot["labels"].append(
                f"mixing-like transaction {m['mix_id']} ({m['equal_output_count']} equal-value outputs)")

    return {
        "peeling_chains": chains,
        "mixing_events": mixes,
        "per_record": per_record,
        "tx_patterns": tx_patterns,
        "summary": {
            "peeling_chains": len(chains),
            "mixing_events": len(mixes),
            "transactions_in_patterns": len(tx_patterns),
        },
    }
