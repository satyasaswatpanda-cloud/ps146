"""
Pydantic schema for one observed Bitcoin transaction + its network metadata.

The parser normalises raw CSV/JSON/XML rows (Polars) and then validates each
row against this model. Rows that fail validation are rejected *individually*
and reported in the ingest report instead of aborting the whole upload.
"""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

REQUIRED_FIELDS = ("timestamp", "src_ip", "dst_ip", "txid")


class TransactionRecord(BaseModel):
    model_config = ConfigDict(extra="allow")  # keep optional feed columns (e.g. label)

    timestamp: str = Field(..., min_length=1)
    src_ip: str = Field(..., min_length=1)
    dst_ip: str = Field(..., min_length=1)
    src_port: int = Field(0, ge=0, le=65535)
    dst_port: int = Field(0, ge=0, le=65535)
    txid: str = Field(..., min_length=1)
    input_addresses: List[str] = Field(default_factory=list)
    output_addresses: List[str] = Field(default_factory=list)
    input_amounts: List[float] = Field(default_factory=list)
    output_amounts: List[float] = Field(default_factory=list)
    fee: float = Field(0.0, ge=0.0)
    script_type: str = "unknown"
    geo_country: Optional[str] = ""
    asn: Optional[str] = ""
    label: Optional[str] = None  # optional ground truth ("illicit"/"licit"/1/0)

    @field_validator("script_type", mode="before")
    @classmethod
    def _script_default(cls, v):
        v = (str(v) if v is not None else "").strip().lower()
        return v or "unknown"

    @field_validator("geo_country", "asn", mode="before")
    @classmethod
    def _none_to_empty(cls, v):
        return "" if v is None else str(v).strip()
