from pathlib import Path
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from typing import List, Optional
from pydantic import BaseModel, Field
from backend import config
from backend.services.parsers import parse_with_report
from backend.services.pipeline import analyze_records
from backend.services.case_store import get_case_store
from backend.services.reports import build_case_json_report, build_case_pdf_report
from backend.services import llm, neo4j_sync, tracking
from backend.services.models import CATBOOST_AVAILABLE
from backend.services.explain import SHAP_AVAILABLE

BASE_DIR = Path(__file__).resolve().parent.parent
SAMPLE_FILE = BASE_DIR / "data" / "sample" / "sample_transactions.csv"

app = FastAPI(
    title="ANTARDRISHTI — Network-Blockchain Investigation Platform",
    version="0.2.0",
    description=("Offline prototype for synthetic Bitcoin network/blockchain metadata analysis. "
                "Pure JSON API: the investigation dashboard lives in frontend-next/ (Next.js) and "
                "talks to this service over /api/*; see docs/09_DEPLOYMENT.md for how the two are served."),
)

# The Next.js dev/prod server is a separate origin (see frontend-next/next.config.ts,
# which proxies /api/* here in dev). Allow it explicitly rather than "*", so this
# stays a deliberate, documented boundary rather than an open API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class CaseCreate(BaseModel):
    title: str = Field(..., min_length=1, description="Case title")
    description: Optional[str] = Field("", description="Case description")
    status: Optional[str] = Field("open", description="Case status: open, investigating, closed")
    analyst_note: Optional[str] = Field("", description="Initial analyst note")


class CaseUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = None
    status: Optional[str] = None
    analyst_note: Optional[str] = None


class AttachAlertRequest(BaseModel):
    alert_id: str = Field(..., description="Alert identifier, e.g. ALT-009")
    txid: Optional[str] = ""
    src_ip: Optional[str] = ""
    score: Optional[float] = 0.0
    confidence: Optional[float] = 0.0
    reasons: Optional[List[str]] = Field(default_factory=list)
    geo_country: Optional[str] = ""
    asn: Optional[str] = ""
    analyst_note: Optional[str] = ""


@app.get("/")
def index():
    return {
        "service": "antardrishti-api",
        "docs": "/docs",
        "dashboard": "the Next.js app in frontend-next/ (run separately, proxies here)",
    }

@app.get("/api/health")
def health():
    return {"status": "ok", "mode": "offline-prototype"}


@app.get("/api/status")
def status():
    """Availability of every optional engine, so the UI/judges can see what's live."""
    return {
        "catboost": {"available": CATBOOST_AVAILABLE},
        "shap": {"available": SHAP_AVAILABLE},
        "mlflow": tracking.status(),
        "local_llm": llm.status(probe=True),
        "neo4j": {**neo4j_sync.status(), "gds": neo4j_sync.gds_available()},
        "max_upload_mb": config.max_upload_bytes() // (1024 * 1024),
    }


@app.get("/api/sample")
def analyze_sample():
    data = SAMPLE_FILE.read_bytes()
    records, ingest_report = parse_with_report(SAMPLE_FILE.name, data)
    result = analyze_records(records, sync_neo4j=True)
    result["ingest_report"] = ingest_report
    return result

@app.post("/api/analyze")
async def analyze_file(file: UploadFile = File(...)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".csv", ".json", ".xml"}:
        raise HTTPException(status_code=400, detail="Only CSV, JSON and XML are supported.")
    raw = await file.read()
    if len(raw) > config.max_upload_bytes():
        limit_mb = config.max_upload_bytes() // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"Upload limit is {limit_mb} MB.")
    try:
        records, ingest_report = parse_with_report(file.filename, raw)
        result = analyze_records(records, sync_neo4j=True)
        result["ingest_report"] = ingest_report
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/validate")
def run_validation(seed: int = 7):
    """Benchmark the pipeline against synthetic ground truth (precision/recall/etc)."""
    from backend.services.validation import run_benchmark
    return run_benchmark(seed=seed, log_to_mlflow=True)


# ---------------------------------------------------------------------------
# Case Storage Endpoints (Task 5)
# ---------------------------------------------------------------------------

@app.post("/api/cases", status_code=201)
def create_case(payload: CaseCreate):
    store = get_case_store()
    try:
        return store.create_case(
            title=payload.title,
            description=payload.description or "",
            status=payload.status or "open",
            analyst_note=payload.analyst_note or "",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/cases")
def list_cases(status: Optional[str] = None):
    store = get_case_store()
    return store.list_cases(status=status)


@app.get("/api/cases/{case_id}")
def get_case(case_id: int):
    store = get_case_store()
    case = store.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail=f"Case with ID {case_id} not found.")
    return case


@app.patch("/api/cases/{case_id}")
def update_case(case_id: int, payload: CaseUpdate):
    store = get_case_store()
    try:
        updated = store.update_case(
            case_id=case_id,
            title=payload.title,
            description=payload.description,
            status=payload.status,
            analyst_note=payload.analyst_note,
        )
        if not updated:
            raise HTTPException(status_code=404, detail=f"Case with ID {case_id} not found.")
        return updated
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/cases/{case_id}/alerts", status_code=201)
def attach_alert(case_id: int, payload: AttachAlertRequest):
    store = get_case_store()
    alert_data = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
    attached = store.attach_alert(case_id=case_id, alert_data=alert_data, analyst_note=payload.analyst_note or "")
    if not attached:
        raise HTTPException(status_code=404, detail=f"Case with ID {case_id} not found.")
    return attached


@app.get("/api/cases/{case_id}/alerts")
def get_case_alerts(case_id: int):
    store = get_case_store()
    case = store.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail=f"Case with ID {case_id} not found.")
    return store.get_case_alerts(case_id)


@app.delete("/api/cases/{case_id}")
def delete_case(case_id: int):
    store = get_case_store()
    deleted = store.delete_case(case_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Case with ID {case_id} not found.")
    return {"deleted": True, "case_id": case_id}


@app.get("/api/cases/{case_id}/export/json")
def export_case_json(case_id: int):
    store = get_case_store()
    case = store.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail=f"Case with ID {case_id} not found.")
    report_data = build_case_json_report(case)
    return JSONResponse(
        content=report_data,
        headers={"Content-Disposition": f'attachment; filename="case_{case_id}_report.json"'}
    )


@app.get("/api/cases/{case_id}/export/pdf")
def export_case_pdf(case_id: int):
    store = get_case_store()
    case = store.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail=f"Case with ID {case_id} not found.")
    pdf_bytes = build_case_pdf_report(case)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="case_{case_id}_report.pdf"'}
    )

