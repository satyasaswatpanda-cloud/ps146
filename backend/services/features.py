"""
Feature engineering for the detection stage (Isolation Forest + CatBoost).

Batch statistics (repetition counts, rarity, per-IP burst gaps) are computed
in one DuckDB SQL pass; graph and pattern features come from the graph /
pattern stages. 20 dimensions in four families:

  amounts & shape      total_input_value, total_output_value, fee,
                       input_address_count, output_address_count
  network behaviour    src_ip_repetition, dst_ip_repetition, nonstandard_port,
                       txid_repetition, country_rarity, asn_rarity,
                       src_ip_burst_timing
  script               script_type_rarity, script_nonstandard
  graph                graph_wallet_reuse, graph_ip_wallet_span,
                       graph_component_size, graph_pagerank
  graph patterns       pattern_peeling_score, pattern_mixing_score
"""
from __future__ import annotations

import math

from backend.services.analytics_sql import batch_aggregates

# Ports Bitcoin Core / common wallet software normally use. Anything else
# observed on a P2P link is a mild network-layer anomaly signal.
STANDARD_BITCOIN_PORTS = {8333, 8332, 18333, 18332, 38333}
STANDARD_SCRIPT_TYPES = {"p2pkh", "p2sh", "p2wpkh", "p2wsh", "p2tr", "unknown"}

FEATURE_NAMES = [
    "total_input_value",
    "total_output_value",
    "fee",
    "input_address_count",
    "output_address_count",
    "src_ip_repetition",
    "dst_ip_repetition",
    "nonstandard_port",
    "txid_repetition",
    "country_rarity",
    "asn_rarity",
    "src_ip_burst_timing",
    "script_type_rarity",
    "script_nonstandard",
    "graph_wallet_reuse",
    "graph_ip_wallet_span",
    "graph_component_size",
    "graph_pagerank",
    "pattern_peeling_score",
    "pattern_mixing_score",
]
BASE_FEATURE_COUNT = 12


def _safe_sum(values):
    return float(sum(values or []))


def build_features(records, graph_features=None, pattern_scores=None):
    """
    records         normalised transaction dicts
    graph_features  optional list aligned to records: [wallet_reuse, ip_span, component_size, pagerank]
    pattern_scores  optional list aligned to records: [(peeling, mixing), ...]

    Missing graph/pattern inputs default to neutral values, so the function is
    usable standalone (and the original 12 feature semantics are unchanged).
    """
    n = max(len(records), 1)
    agg = batch_aggregates(records)

    features = []
    for i, r in enumerate(records):
        total_in = _safe_sum(r.get("input_amounts", []))
        total_out = _safe_sum(r.get("output_amounts", []))
        fee = float(r.get("fee", 0.0) or 0.0)

        src_port = r.get("src_port", 0) or 0
        dst_port = r.get("dst_port", 0) or 0
        nonstandard_port = 0.0 if (
            src_port in STANDARD_BITCOIN_PORTS and dst_port in STANDARD_BITCOIN_PORTS
        ) else 1.0

        script = str(r.get("script_type") or "unknown").lower()
        gf = graph_features[i] if graph_features else [0.0, 0.0, 0.0, 0.0]
        peel, mix = pattern_scores[i] if pattern_scores else (0.0, 0.0)

        features.append([
            math.log1p(abs(total_in)),
            math.log1p(abs(total_out)),
            math.log1p(abs(fee)),
            len(r.get("input_addresses", [])),
            len(r.get("output_addresses", [])),
            agg["src_rep"][i],
            agg["dst_rep"][i],
            nonstandard_port,
            agg["tx_rep"][i],
            1 - (agg["country_cnt"][i] / n),
            1 - (agg["asn_cnt"][i] / n),
            math.log1p(agg["gap"][i]),
            1 - (agg["script_cnt"][i] / n),
            0.0 if script in STANDARD_SCRIPT_TYPES else 1.0,
            gf[0], gf[1], math.log1p(gf[2]), gf[3],
            float(peel), float(mix),
        ])
    return features
