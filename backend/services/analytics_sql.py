"""
DuckDB analytics layer.

Batch-relative statistics that used to be Python Counters/loops are computed
in one in-process, columnar SQL pass: source/destination IP repetition, txid
repetition, country/ASN/script frequencies and per-source-IP burst gaps
(window function LAG over the timestamp-ordered stream).

This is what lets the same pipeline handle 100k+ row bulk uploads.
"""
from __future__ import annotations

from typing import Any, Dict, List

import duckdb
import polars as pl

NO_PRIOR_GAP = 24 * 3600.0  # "effectively not a burst"


def batch_aggregates(records: List[Dict[str, Any]]) -> Dict[str, List[float]]:
    n = len(records)
    frame = pl.DataFrame(
        {
            "idx": list(range(n)),
            "src_ip": [str(r.get("src_ip", "")) for r in records],
            "dst_ip": [str(r.get("dst_ip", "")) for r in records],
            "txid": [str(r.get("txid", "")) for r in records],
            "country": [str(r.get("geo_country") or "UNKNOWN") for r in records],
            "asn": [str(r.get("asn") or "UNKNOWN") for r in records],
            "script": [str(r.get("script_type") or "unknown") for r in records],
            "ts": [_norm_ts(r.get("timestamp")) for r in records],
        },
        schema={"idx": pl.Int64, "src_ip": pl.Utf8, "dst_ip": pl.Utf8, "txid": pl.Utf8,
                "country": pl.Utf8, "asn": pl.Utf8, "script": pl.Utf8, "ts": pl.Utf8},
    )
    con = duckdb.connect(":memory:")
    try:
        con.execute("SET TimeZone='UTC'")
        con.register("txs", frame.to_arrow())
        rows = con.execute(
            f"""
            WITH parsed AS (
                SELECT *, TRY_CAST(ts AS TIMESTAMPTZ) AS t FROM txs
            ),
            gaps AS (
                SELECT idx,
                       epoch(t) - epoch(LAG(t) OVER (PARTITION BY src_ip ORDER BY t, idx)) AS gap
                FROM parsed WHERE t IS NOT NULL
            )
            SELECT p.idx,
                   COUNT(*) OVER (PARTITION BY p.src_ip)  AS src_rep,
                   COUNT(*) OVER (PARTITION BY p.dst_ip)  AS dst_rep,
                   COUNT(*) OVER (PARTITION BY p.txid)    AS tx_rep,
                   COUNT(*) OVER (PARTITION BY p.country) AS country_cnt,
                   COUNT(*) OVER (PARTITION BY p.asn)     AS asn_cnt,
                   COUNT(*) OVER (PARTITION BY p.script)  AS script_cnt,
                   CASE WHEN g.gap IS NULL THEN {NO_PRIOR_GAP} ELSE GREATEST(g.gap, 0) END AS gap
            FROM parsed p LEFT JOIN gaps g USING (idx)
            ORDER BY p.idx
            """
        ).fetchall()
    finally:
        con.close()

    cols = list(zip(*rows)) if rows else [[]] * 8
    return {
        "src_rep": [float(v) for v in cols[1]],
        "dst_rep": [float(v) for v in cols[2]],
        "tx_rep": [float(v) for v in cols[3]],
        "country_cnt": [float(v) for v in cols[4]],
        "asn_cnt": [float(v) for v in cols[5]],
        "script_cnt": [float(v) for v in cols[6]],
        "gap": [float(v) for v in cols[7]],
    }


def _norm_ts(value: Any) -> str:
    text = str(value or "").strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    return text
