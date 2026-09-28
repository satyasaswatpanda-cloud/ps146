"""
Offline GeoIP / ASN enrichment.

Design goals (per PS 26146: "integrate open source downloadable Geo IP database"):
  1. Never require a network call at runtime -- this must run fully offline.
  2. Prefer geo_country/asn values already present on a record (many bulk
     metadata feeds, and this prototype's own sample data, ship pre-resolved
     geo/ASN fields from an upstream collector).
  3. If a local MaxMind GeoLite2 (or GeoLite2-ASN) .mmdb file is available,
     use it to resolve any IP that is missing geo/ASN data. The DB file is
     NOT bundled (its license requires a free MaxMind account to download),
     so this is a soft dependency: if the file or the `geoip2` package is
     absent, the resolver degrades gracefully instead of crashing the app.
  4. Always classify private/reserved IP ranges (RFC1918 etc.) explicitly,
     since a lot of synthetic/lab traffic uses them and "no geo data" should
     not silently look identical to "unresolvable public IP".

To enable real MaxMind resolution, set the environment variable
GEOIP_CITY_DB (and optionally GEOIP_ASN_DB) to local .mmdb file paths and
`pip install geoip2`. Nothing else changes.
"""
from __future__ import annotations

import ipaddress
import os
import threading

_LOCK = threading.Lock()
_CITY_READER = None
_ASN_READER = None
_READERS_LOADED = False


def _load_readers():
    """Lazily open local MaxMind .mmdb readers, if configured. Offline only."""
    global _CITY_READER, _ASN_READER, _READERS_LOADED
    if _READERS_LOADED:
        return
    with _LOCK:
        if _READERS_LOADED:
            return
        _READERS_LOADED = True
        city_path = os.environ.get("GEOIP_CITY_DB")
        asn_path = os.environ.get("GEOIP_ASN_DB")
        if not city_path and not asn_path:
            return
        try:
            import geoip2.database  # optional dependency
        except ImportError:
            return
        if city_path and os.path.isfile(city_path):
            try:
                _CITY_READER = geoip2.database.Reader(city_path)
            except Exception:
                _CITY_READER = None
        if asn_path and os.path.isfile(asn_path):
            try:
                _ASN_READER = geoip2.database.Reader(asn_path)
            except Exception:
                _ASN_READER = None


def classify_ip(ip_text):
    """Return 'private', 'public', or 'invalid' for the given IP string."""
    try:
        addr = ipaddress.ip_address(ip_text)
    except ValueError:
        return "invalid"
    if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
        return "private"
    return "public"


def resolve(ip_text, existing_country=None, existing_asn=None):
    """
    Resolve a single IP to (country, asn, source).

    Order of precedence:
      1. Pre-resolved fields already on the record (existing_country/asn).
      2. Local MaxMind .mmdb lookup, if configured (fully offline).
      3. Explicit private/reserved-range classification.
      4. "unknown".
    """
    existing_country = (existing_country or "").strip()
    existing_asn = (existing_asn or "").strip()
    if existing_country or existing_asn:
        return existing_country or "UNKNOWN", existing_asn or "UNKNOWN", "source-feed"

    kind = classify_ip(ip_text)
    if kind == "private":
        return "PRIVATE-RANGE", "PRIVATE-RANGE", "rfc1918"
    if kind == "invalid":
        return "UNKNOWN", "UNKNOWN", "unresolvable"

    _load_readers()
    country = "UNKNOWN"
    asn = "UNKNOWN"
    if _CITY_READER is not None:
        try:
            resp = _CITY_READER.country(ip_text)
            country = resp.country.iso_code or "UNKNOWN"
        except Exception:
            pass
    if _ASN_READER is not None:
        try:
            resp = _ASN_READER.asn(ip_text)
            asn = f"AS{resp.autonomous_system_number}" if resp.autonomous_system_number else "UNKNOWN"
        except Exception:
            pass
    if country != "UNKNOWN" or asn != "UNKNOWN":
        return country, asn, "maxmind-local"
    return "UNKNOWN", "UNKNOWN", "unresolved"


def enrich_records(records):
    """Attach resolved geo_country / asn / geo_source to every record in place."""
    for r in records:
        country, asn, source = resolve(
            r.get("src_ip", ""),
            r.get("geo_country"),
            r.get("asn"),
        )
        r["geo_country"] = country
        r["asn"] = asn
        r["geo_source"] = source
    return records
