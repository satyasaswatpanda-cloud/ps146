"""
Local-LLM narrative layer + grounding validator.

An investigator gets, per alert, a short plain-English narrative built ONLY
from the evidence the pipeline computed (score, reasons, SHAP features,
patterns, entity, network origin). Two producers:

  * a deterministic template (always available, always grounded)
  * an optional LOCAL LLM (Ollama or any OpenAI-compatible llama.cpp / vLLM
    server on loopback / private network). Non-local URLs are refused so the
    platform can never leak evidence off-box.

Whatever the source, every narrative passes through `validate_narrative`:
any IP, id, number or verdict-style claim that is not present in the evidence
is flagged. An LLM narrative that fails validation is discarded and the
template is used instead -- the LLM can only ever *rephrase*, never invent.

Config (env):  LOCAL_LLM_URL   e.g. http://127.0.0.1:11434
               LOCAL_LLM_MODEL (default llama3.2:3b)
               LOCAL_LLM_API   ollama | openai   (default ollama)
               LOCAL_LLM_TIMEOUT seconds (default 20)
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional

from backend import config

FORBIDDEN = [
    r"\bis guilty\b", r"\bare guilty\b", r"\bconvicted\b", r"\bconfirmed (?:criminal|launder|illicit)",
    r"\bproves?\b", r"\bproof of\b", r"\bdefinitely\b", r"\bcertainly (?:illicit|criminal)",
    r"\bis a (?:criminal|launderer|terrorist)\b",
]
_IP = re.compile(r"\b\d{1,3}(?:\.\d{1,3}){3}\b")
_ID = re.compile(r"\b(?:ALT|WAL|IP|ENT|CHN|MIX|CLU|BHV)-[0-9A-Za-z-]+\b")
_TX = re.compile(r"\btx[0-9a-f]{8,}\b|\b[0-9a-f]{24,}\b")
_ASN = re.compile(r"\bAS\d{3,}\b")
_NUM = re.compile(r"(?<![\w.])\d+(?:\.\d+)?(?![\w])")


def settings() -> Dict[str, Any]:
    url = os.environ.get("LOCAL_LLM_URL", "").strip()
    return {
        "url": url,
        "model": os.environ.get("LOCAL_LLM_MODEL", "llama3.2:3b"),
        "api": os.environ.get("LOCAL_LLM_API", "ollama").lower(),
        "timeout": float(os.environ.get("LOCAL_LLM_TIMEOUT", "20")),
    }


def status(probe: bool = False) -> Dict[str, Any]:
    s = settings()
    if not s["url"]:
        return {"enabled": False, "reason": "LOCAL_LLM_URL not set (template narratives in use)"}
    if not config.is_local_url(s["url"]):
        return {"enabled": False, "reason": "LOCAL_LLM_URL must be a loopback/private host (offline guarantee)"}
    out = {"enabled": True, "url": s["url"], "model": s["model"], "api": s["api"]}
    if probe:
        try:
            path = "/api/tags" if s["api"] == "ollama" else "/v1/models"
            with urllib.request.urlopen(s["url"].rstrip("/") + path, timeout=1.5) as resp:
                out["reachable"] = 200 <= resp.status < 300
        except Exception:
            out["reachable"] = False
    return out


# ---------------------------------------------------------------- evidence
def build_evidence(item: Dict[str, Any]) -> Dict[str, Any]:
    """Compact, LLM-safe fact sheet for one ranked alert."""
    return {
        "entity_type": item.get("entity_type", "transaction"),
        "id": item.get("id"),
        "entity": item.get("entity"),
        "score": item.get("score"),
        "confidence": item.get("confidence"),
        "reasons": list(item.get("reasons", []))[:6],
        "top_model_features": [s["feature"] for s in (item.get("shap_explanation") or [])][:3],
        "patterns": list(item.get("patterns", []))[:4],
        "src_ip": item.get("src_ip"),
        "geo_country": item.get("geo_country"),
        "asn": item.get("asn"),
        "entity_id": item.get("entity_id"),
        "network_origin": item.get("network_origin"),
        "supporting_txids": list(item.get("supporting_txids", []))[:3],
    }


def template_narrative(ev: Dict[str, Any]) -> str:
    kind = ev.get("entity_type", "transaction")
    head = (f"{kind.capitalize()} {ev.get('entity')} ({ev.get('id')}) is ranked with risk score "
            f"{ev.get('score')} and confidence {ev.get('confidence')}.")
    parts = [head]
    if ev.get("reasons"):
        parts.append("Observed: " + "; ".join(ev["reasons"]) + ".")
    if ev.get("patterns"):
        parts.append("Graph patterns: " + "; ".join(ev["patterns"]) + ".")
    if ev.get("top_model_features"):
        parts.append("Most influential model features: " + ", ".join(ev["top_model_features"]) + ".")
    if ev.get("src_ip"):
        loc = ", ".join(x for x in (ev.get("geo_country"), ev.get("asn")) if x)
        parts.append(f"Relayed from {ev['src_ip']}" + (f" ({loc})." if loc else "."))
    origin = ev.get("network_origin")
    if origin and origin.get("src_ip"):
        parts.append(f"Candidate network origin: {origin['src_ip']} relayed {int(origin.get('relay_share', 0) * 100)}% "
                     f"of this entity's activity.")
    parts.append("This is an investigative lead, not a determination of wrongdoing.")
    return " ".join(parts)


# -------------------------------------------------------------- validation
def _flatten(obj: Any, strings: set, numbers: List[float]) -> None:
    if isinstance(obj, dict):
        for v in obj.values():
            _flatten(v, strings, numbers)
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            _flatten(v, strings, numbers)
    elif isinstance(obj, bool):
        return
    elif isinstance(obj, (int, float)):
        numbers.append(float(obj))
    elif obj is not None:
        text = str(obj)
        strings.add(text)
        strings.update(_IP.findall(text))
        strings.update(_ID.findall(text))
        strings.update(_TX.findall(text))
        strings.update(_ASN.findall(text))
        numbers.extend(float(x) for x in _NUM.findall(text))


def validate_narrative(text: str, evidence: Dict[str, Any]) -> Dict[str, Any]:
    strings: set = set()
    numbers: List[float] = []
    _flatten(evidence, strings, numbers)
    issues: List[str] = []

    for label, rx in (("IP address", _IP), ("identifier", _ID), ("transaction id", _TX), ("ASN", _ASN)):
        for tok in set(rx.findall(text)):
            if tok not in strings and not any(tok in s for s in strings):
                issues.append(f"{label} not in evidence: {tok}")
    scrubbed = _IP.sub(" ", _ID.sub(" ", _TX.sub(" ", _ASN.sub(" ", text))))
    for tok in _NUM.findall(scrubbed):
        val = float(tok)
        if val <= 10 and val == int(val):
            continue
        if not any(abs(val - n) <= max(0.005, abs(n) * 0.005) for n in numbers) and \
           not any(abs(val - n * 100) <= 0.51 for n in numbers):  # percentages of shares
            issues.append(f"number not in evidence: {tok}")
    for rx in FORBIDDEN:
        if re.search(rx, text, flags=re.I):
            issues.append(f"unsupported verdict language matches /{rx}/")
    return {"grounded": not issues, "issues": issues[:8]}


# ---------------------------------------------------------------- LLM call
def _prompt(ev: Dict[str, Any]) -> str:
    return (
        "You are assisting a blockchain forensic analyst. Write 2-3 plain sentences summarising why this alert "
        "was raised. Use ONLY the facts in the JSON. Do not add numbers, addresses, names or conclusions that are "
        "not in it. Do not state or imply guilt; call it an investigative lead.\n\nFACTS:\n"
        + json.dumps(ev, ensure_ascii=False, default=str)
    )


def call_local_llm(prompt: str) -> Optional[str]:
    st = status()
    if not st["enabled"]:
        return None
    s = settings()
    base = s["url"].rstrip("/")
    try:
        if s["api"] == "openai":
            body = {"model": s["model"], "temperature": 0.1, "max_tokens": 220,
                    "messages": [{"role": "user", "content": prompt}]}
            url = base + "/v1/chat/completions"
        else:
            body = {"model": s["model"], "prompt": prompt, "stream": False,
                    "options": {"temperature": 0.1, "num_predict": 220}}
            url = base + "/api/generate"
        req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=s["timeout"]) as resp:
            payload = json.loads(resp.read().decode())
        text = (payload["choices"][0]["message"]["content"] if s["api"] == "openai" else payload.get("response", ""))
        return (text or "").strip() or None
    except (urllib.error.URLError, OSError, ValueError, KeyError, IndexError):
        return None


def narrate(item: Dict[str, Any], use_llm: bool = True) -> Dict[str, Any]:
    ev = build_evidence(item)
    template = template_narrative(ev)
    result = {"text": template, "source": "template", "validation": validate_narrative(template, ev)}
    if use_llm and status()["enabled"]:
        candidate = call_local_llm(_prompt(ev))
        if candidate:
            check = validate_narrative(candidate, ev)
            if check["grounded"]:
                return {"text": candidate, "source": f"local-llm:{settings()['model']}", "validation": check}
            result["llm_rejected"] = check["issues"]
            result["source"] = "template (local LLM output rejected by validator)"
        else:
            result["source"] = "template (local LLM unreachable)"
    return result
