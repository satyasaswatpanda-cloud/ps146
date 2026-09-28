"""
Central runtime configuration (all values overridable via environment).

Everything here is local-only: no setting points at a public service. The
optional Neo4j / local-LLM endpoints are validated to be loopback/private
hosts so the "100% offline" guarantee cannot be broken by a typo.
"""
from __future__ import annotations

import ipaddress
import os
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"


def env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def max_upload_bytes() -> int:
    # Bulk ingestion is Polars/DuckDB-backed, so the cap is a safety valve,
    # not a parser limitation. Default 256 MB, override with MAX_UPLOAD_MB.
    return env_int("MAX_UPLOAD_MB", 256) * 1024 * 1024


def mlflow_enabled() -> bool:
    return env_bool("MLFLOW_ENABLED", True)


def mlflow_tracking_uri() -> str:
    return os.environ.get("MLFLOW_TRACKING_URI", f"sqlite:///{(DATA_DIR / 'mlflow.db').as_posix()}")


def is_local_url(url: str) -> bool:
    """True only for loopback / private-range / .local / docker-service hosts."""
    host = (urlparse(url).hostname or "").lower()
    if not host:
        return False
    if host in {"localhost", "host.docker.internal"} or host.endswith(".local"):
        return True
    try:
        addr = ipaddress.ip_address(host)
        return addr.is_loopback or addr.is_private
    except ValueError:
        # bare docker-compose service name (no dots), e.g. "neo4j" or "ollama"
        return "." not in host
