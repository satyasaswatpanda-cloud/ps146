"""
Bulk ingestion & normalisation: Polars (columnar parsing/normalisation) +
Pydantic (row validation). Output is a list of plain dicts so every
downstream stage (DuckDB analytics, graphing, ML) stays format-agnostic.

Supported inputs: CSV, JSON (list or {"records": [...]}), XML (<record> nodes).
Array-valued fields use "|" inside CSV/XML and real lists in JSON.
"""
from __future__ import annotations

import csv
import io
import json
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Tuple

import polars as pl
from pydantic import ValidationError

from backend.services.schema import REQUIRED_FIELDS, TransactionRecord

ARRAY_FIELDS = ("input_addresses", "output_addresses", "input_amounts", "output_amounts")
AMOUNT_FIELDS = ("input_amounts", "output_amounts")
INT_FIELDS = ("src_port", "dst_port")
_DEFAULTS = {"src_port": "0", "dst_port": "0", "fee": "0", "script_type": "unknown"}


def _stringify(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        return "|".join(str(v) for v in value)
    return str(value)


def _frame_from_rows(rows: List[Dict[str, Any]]) -> pl.DataFrame:
    """All-string frame: type coercion is done once, explicitly, below."""
    columns: Dict[str, List[str]] = {}
    for idx, row in enumerate(rows):
        for key in row:
            if key not in columns:
                columns[key] = [""] * idx
        for key in columns:
            columns[key].append(_stringify(row.get(key)))
    return pl.DataFrame(columns, schema={k: pl.Utf8 for k in columns})


def _read_raw(name: str, raw: bytes) -> pl.DataFrame:
    if raw.startswith(b"\xef\xbb\xbf"):
        raw = raw[3:]
    if name.endswith(".csv"):
        try:
            return pl.read_csv(io.BytesIO(raw), infer_schema=False, truncate_ragged_lines=True)
        except pl.exceptions.NoDataError:
            return pl.DataFrame()
    if name.endswith(".xlsx") or name.endswith(".xls"):
        try:
            # Read via openpyxl and cast all columns to Utf8 string for unified downstream normalization
            df = pl.read_excel(io.BytesIO(raw), engine="openpyxl")
            if df.height == 0:
                return pl.DataFrame()
            return df.select([pl.col(c).cast(pl.Utf8, strict=False).fill_null("") for c in df.columns])
        except Exception as e:
            raise ValueError(f"Failed to parse Excel spreadsheet: {e}")
    text = raw.decode("utf-8")
    if name.endswith(".json"):
        payload = json.loads(text)
        rows = payload if isinstance(payload, list) else payload.get("records", [])
        return _frame_from_rows(rows)
    if name.endswith(".xml"):
        root = ET.fromstring(text)
        rows = [{child.tag: child.text or "" for child in node} for node in root.findall(".//record")]
        return _frame_from_rows(rows)
    raise ValueError("Unsupported file format. Supported formats: CSV, XLSX, XLS, JSON, XML.")


def _normalise(df: pl.DataFrame) -> pl.DataFrame:
    for col, default in _DEFAULTS.items():
        if col not in df.columns:
            df = df.with_columns(pl.lit(default).alias(col))
    for col in ARRAY_FIELDS:
        if col not in df.columns:
            df = df.with_columns(pl.lit("").alias(col))

    exprs = []
    for col in ARRAY_FIELDS:
        parts = (
            pl.col(col).fill_null("").str.split("|")
            .list.eval(pl.element().str.strip_chars())
            .list.eval(pl.element().filter(pl.element() != ""))
        )
        if col in AMOUNT_FIELDS:
            parts = parts.list.eval(pl.element().cast(pl.Float64, strict=False).fill_null(0.0))
        exprs.append(parts.alias(col))
    for col in INT_FIELDS:
        exprs.append(pl.col(col).cast(pl.Float64, strict=False).fill_null(0).cast(pl.Int64).alias(col))
    exprs.append(pl.col("fee").cast(pl.Float64, strict=False).fill_null(0.0).alias("fee"))
    return df.with_columns(exprs)


def parse_with_report(filename: str, raw: bytes) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Parse + normalise + validate. Returns (records, ingest_report)."""
    name = (filename or "").lower()
    df = _read_raw(name, raw)
    if df.height == 0:
        raise ValueError("No records were found in the uploaded file.")

    missing = set(REQUIRED_FIELDS) - set(df.columns)
    if missing:
        raise ValueError("Missing required fields: " + ", ".join(sorted(missing)))

    total_rows = df.height
    rows = _normalise(df).to_dicts()

    records: List[Dict[str, Any]] = []
    rejected: List[Dict[str, str]] = []
    for i, row in enumerate(rows):
        try:
            records.append(TransactionRecord.model_validate(row).model_dump())
        except ValidationError as exc:
            if len(rejected) < 20:
                first = exc.errors()[0]
                rejected.append({"row": i + 2, "field": ".".join(map(str, first["loc"])), "error": first["msg"]})
            else:
                rejected.append({})  # keep count only
    if not records:
        raise ValueError("No valid records were found in the uploaded file.")

    report = {
        "engine": "polars+pydantic",
        "format": name.rsplit(".", 1)[-1],
        "rows_read": total_rows,
        "rows_accepted": len(records),
        "rows_rejected": len(rejected),
        "rejected_examples": [r for r in rejected if r][:5],
        "columns": list(df.columns),
    }
    return records, report


def parse_uploaded_bytes(filename: str, raw: bytes) -> List[Dict[str, Any]]:
    """Back-compatible entry point: returns only the normalised records."""
    return parse_with_report(filename, raw)[0]
