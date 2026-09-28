"""
Synthetic labelled traffic generator.

Used for (1) the bundled laundering demo dataset and (2) the validation
harness (backend/services/validation.py). Ground truth is known by
construction, so precision/recall are measurable. Everything is synthetic:
no real addresses, IPs or transactions.
"""
from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

SCRIPTS = ["p2wpkh", "p2pkh", "p2sh", "p2tr", "p2wsh"]
SCRIPT_W = [0.60, 0.15, 0.10, 0.10, 0.05]
COUNTRIES = {"US": ["AS64500", "AS64501"], "DE": ["AS64510"], "GB": ["AS64520"], "IN": ["AS64530", "AS64531"],
             "SG": ["AS64540"], "JP": ["AS64550"], "BR": ["AS64560"], "FR": ["AS64570"]}
COUNTRY_W = [0.28, 0.16, 0.12, 0.14, 0.08, 0.08, 0.07, 0.07]
RISKY = {"KP": "AS64990", "IR": "AS64991"}
T0 = datetime(2026, 9, 1, tzinfo=timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


class _Gen:
    def __init__(self, seed: int):
        self.rng = random.Random(seed)
        self.n = 0
        self.records: List[Dict[str, Any]] = []
        self.truth: Dict[str, str] = {}
        self.entity_truth: List[List[str]] = []

    def _addr(self, prefix="bc1q"):
        return prefix + "".join(self.rng.choice("023456789acdefghjklmnpqrstuvwxyz") for _ in range(20))

    def _txid(self):
        self.n += 1
        return f"tx{self.n:060x}"

    def _emit(self, ts, src_ip, country, asn, inputs, in_amts, outputs, out_amts, fee, script, kind,
              src_port=8333, dst_port=8333):
        txid = self._txid()
        self.records.append({
            "timestamp": _iso(ts), "src_ip": src_ip, "dst_ip": f"172.16.{self.rng.randint(0, 40)}.{self.rng.randint(2, 250)}",
            "src_port": src_port, "dst_port": dst_port, "txid": txid,
            "input_addresses": inputs, "output_addresses": outputs,
            "input_amounts": [round(v, 6) for v in in_amts], "output_amounts": [round(v, 6) for v in out_amts],
            "fee": round(fee, 6), "script_type": script, "geo_country": country, "asn": asn,
        })
        self.truth[txid] = kind
        return txid

    def normal(self, count: int):
        rng = self.rng
        ips = [f"10.{rng.randint(0, 9)}.{rng.randint(0, 50)}.{rng.randint(2, 250)}" for _ in range(max(count // 2, 10))]
        ip_geo = {ip: (rng.choices(list(COUNTRIES), COUNTRY_W)[0]) for ip in ips}
        pool = [self._addr() for _ in range(max(count * 4, 80))]
        for _ in range(count):
            ip = rng.choice(ips)
            c = ip_geo[ip]
            n_in, n_out = rng.choices([1, 2, 3], [0.85, 0.12, 0.03])[0], rng.choices([1, 2, 3], [0.2, 0.6, 0.2])[0]
            total = min(rng.lognormvariate(-1.6, 0.8), 3.0)
            fee = rng.uniform(0.0001, 0.003)
            weights = [rng.random() + 0.2 for _ in range(n_out)]
            outs = [(total - fee) * w / sum(weights) for w in weights]
            ts = T0 + timedelta(seconds=rng.randint(0, 10 * 86400))
            self._emit(ts, ip, c, rng.choice(COUNTRIES[c]), rng.sample(pool, n_in),
                       [total / n_in] * n_in, rng.sample(pool, n_out), outs, fee,
                       rng.choices(SCRIPTS, SCRIPT_W)[0], "normal",
                       src_port=8333 if rng.random() < 0.97 else 8334)

    def peeling_chain(self, length: int):
        rng = self.rng
        ip = f"10.66.{rng.randint(0, 9)}.{rng.randint(2, 250)}"
        country = rng.choice(["DE", "IN", "SG"])
        asn = COUNTRIES[country][0]
        addr = self._addr()
        entity = [addr]
        value = rng.uniform(4.0, 9.0)
        ts = T0 + timedelta(seconds=rng.randint(0, 8 * 86400))
        for hop in range(length):
            peel = value * rng.uniform(0.05, 0.25)
            fee = rng.uniform(0.0002, 0.0008)
            change = value - peel - fee
            change_addr, peel_addr = self._addr(), self._addr()
            self._emit(ts, ip, country, asn, [addr], [value], [change_addr, peel_addr], [change, peel], fee,
                       "p2wpkh", "peeling")
            entity.append(change_addr)
            addr, value = change_addr, change
            ts += timedelta(seconds=rng.randint(25, 240))
        self.entity_truth.append(entity)

    def mixing(self):
        """A CoinJoin-shaped tx, with one pre-mix funding hop and one
        post-mix spend hop so flow_tracing.py has something real to follow.
        The funding hop and the post-mix spend intentionally reuse the same
        relay IP, simulating an operator who didn't rotate their own node."""
        rng = self.rng
        k, n_in = rng.randint(6, 9), rng.randint(6, 9)
        unit = round(rng.choice([0.1, 0.25, 0.5]), 6)
        fee = rng.uniform(0.0008, 0.003)
        country = rng.choice(["US", "GB", "BR"])
        asn = COUNTRIES[country][0]
        operator_ip = f"10.77.{rng.randint(0, 9)}.{rng.randint(2, 250)}"
        ts = T0 + timedelta(seconds=rng.randint(0, 8 * 86400))

        # pre-mix: fund the first mixer input from a fresh deposit tx
        funded_addr = self._addr()
        deposit_total = unit * k / n_in + fee / n_in + 0.0005
        self._emit(ts, operator_ip, country, asn, [self._addr()], [deposit_total],
                   [funded_addr], [deposit_total - 0.0005], 0.0005, "p2wpkh", "normal")
        ts += timedelta(seconds=rng.randint(60, 600))

        ins = [funded_addr] + [self._addr() for _ in range(n_in - 1)]
        outs = [self._addr() for _ in range(k)]
        mix_tx = self._emit(ts, f"10.77.{rng.randint(0, 9)}.{rng.randint(2, 250)}", country, asn,
                            ins, [unit * k / n_in + fee / n_in] * n_in, outs, [unit] * k, fee, "p2wsh", "mixing",
                            src_port=rng.choice([8333, 9050]))
        ts += timedelta(seconds=rng.randint(120, 1800))

        # post-mix: one mixed output gets spent onward, relayed by the same operator IP
        spend_out = self._addr()
        self._emit(ts, operator_ip, country, asn, [outs[0]], [unit], [spend_out],
                   [unit - 0.0004], 0.0004, "p2wpkh", "normal")

    def fanout_outlier(self):
        rng = self.rng
        n_out = rng.randint(9, 14)
        total = rng.uniform(40, 90)
        fee = rng.uniform(0.03, 0.09)
        w = [rng.random() + 0.3 for _ in range(n_out)]
        ts = T0 + timedelta(seconds=rng.randint(0, 9 * 86400))
        country = rng.choice(["JP", "FR"])
        self._emit(ts, f"10.88.{rng.randint(0, 9)}.{rng.randint(2, 250)}", country, COUNTRIES[country][0],
                   [self._addr()], [total], [self._addr() for _ in range(n_out)],
                   [(total - fee) * x / sum(w) for x in w], fee, rng.choice(["p2sh", "p2tr"]), "fanout")

    def burst(self, size: int):
        rng = self.rng
        country = rng.choice(list(RISKY))
        ip = f"10.99.{rng.randint(0, 9)}.{rng.randint(2, 250)}"
        ts = T0 + timedelta(seconds=rng.randint(0, 9 * 86400))
        for _ in range(size):
            total = rng.uniform(0.5, 2.5)
            fee = rng.uniform(0.0005, 0.002)
            self._emit(ts, ip, country, RISKY[country], [self._addr()], [total], [self._addr(), self._addr()],
                       [(total - fee) * 0.6, (total - fee) * 0.4], fee, "p2wpkh", "burst",
                       src_port=31337, dst_port=rng.choice([4444, 9001]))
            ts += timedelta(seconds=rng.randint(1, 8))


def generate_dataset(seed: int = 7, n_normal: int = 150, peeling_chains: int = 2, chain_length=(5, 7),
                     mixing: int = 2, fanout: int = 2, bursts: int = 1, burst_size: int = 5) -> Dict[str, Any]:
    g = _Gen(seed)
    g.normal(n_normal)
    for _ in range(peeling_chains):
        g.peeling_chain(g.rng.randint(*chain_length))
    for _ in range(mixing):
        g.mixing()
    for _ in range(fanout):
        g.fanout_outlier()
    for _ in range(bursts):
        g.burst(burst_size)
    order = list(range(len(g.records)))
    g.rng.shuffle(order)  # unordered feed, like a real capture
    records = [g.records[i] for i in order]
    labels = {tx: kind for tx, kind in g.truth.items()}
    return {"records": records, "labels": labels, "illicit": {t for t, k in labels.items() if k != "normal"},
            "entity_truth": g.entity_truth}
