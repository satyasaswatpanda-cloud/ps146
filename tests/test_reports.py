import json
import re
import tempfile
from pathlib import Path
import pytest
from fastapi import HTTPException

from backend.main import (
    export_case_json as api_export_case_json,
    export_case_pdf as api_export_case_pdf,
)
from backend.services.case_store import CaseStore, set_default_case_store
from backend.services.reports import (
    build_case_json_report,
    build_case_pdf_report,
    REPORT_CLASSIFICATION,
    APPLICATION_NAME,
)


@pytest.fixture
def temp_store():
    """Provides a fresh isolated temporary SQLite CaseStore for each test."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test_cases.db"
        store = CaseStore(db_path=db_path)
        yield store


@pytest.fixture
def sample_case_with_alerts(temp_store):
    """Creates a sample case with attached alerts for report testing."""
    case = temp_store.create_case(
        title="Cross-Border High Fan-Out Investigation",
        description="Lead involving multiple transaction outputs routing to distinct endpoints.",
        status="investigating",
        analyst_note="High-priority triage lead flagged by Isolation Forest model.",
    )
    case_id = case["id"]

    alert_1 = {
        "alert_id": "ALT-001",
        "txid": "tx0000000000000000000000000000000000000000000000000000000000000001",
        "src_ip": "198.51.100.12",
        "score": 92.5,
        "confidence": 0.98,
        "reasons": ["many output addresses", "unusually high fee"],
        "geo_country": "US",
        "asn": "AS15169",
    }
    temp_store.attach_alert(case_id, alert_1, analyst_note="Investigate destination clustering.")

    alert_2 = {
        "alert_id": "ALT-002",
        "txid": "tx0000000000000000000000000000000000000000000000000000000000000002",
        "src_ip": "203.0.113.45",
        "score": 84.0,
        "confidence": 0.91,
        "reasons": ["large aggregate output amount"],
        "geo_country": "DE",
        "asn": "AS3320",
    }
    temp_store.attach_alert(case_id, alert_2, analyst_note="Secondary hop confirmed.")

    return temp_store.get_case(case_id)


def test_build_case_json_report_structure(sample_case_with_alerts):
    """Test machine-readable JSON report schema and neutral classification."""
    report = build_case_json_report(sample_case_with_alerts)

    assert "report_metadata" in report
    meta = report["report_metadata"]
    assert meta["report_title"] == "Bitcoin Traffic Intelligence - Forensic Investigation Report"
    assert meta["classification"] == "SIH Demonstration / Forensic Analysis Report"
    assert meta["application"] == APPLICATION_NAME
    assert "generated_at" in meta

    assert "case" in report
    c = report["case"]
    assert c["id"] == sample_case_with_alerts["id"]
    assert c["title"] == "Cross-Border High Fan-Out Investigation"
    assert c["status"] == "investigating"
    assert c["description"] == sample_case_with_alerts["description"]
    assert c["analyst_note"] == sample_case_with_alerts["analyst_note"]
    assert c["alert_count"] == 2
    assert len(c["alerts"]) == 2


def test_build_case_json_report_alerts_fidelity(sample_case_with_alerts):
    """Ensure attached alerts retain exact forensic fields without fabrication."""
    report = build_case_json_report(sample_case_with_alerts)
    alerts = report["case"]["alerts"]

    assert alerts[0]["alert_id"] == "ALT-001"
    assert alerts[0]["txid"].startswith("tx000000")
    assert alerts[0]["src_ip"] == "198.51.100.12"
    assert alerts[0]["score"] == 92.5
    assert alerts[0]["confidence"] == 0.98
    assert alerts[0]["geo_country"] == "US"
    assert alerts[0]["asn"] == "AS15169"
    assert "many output addresses" in alerts[0]["reasons"]
    assert alerts[0]["analyst_note"] == "Investigate destination clustering."

    assert alerts[1]["alert_id"] == "ALT-002"
    assert alerts[1]["geo_country"] == "DE"
    assert alerts[1]["asn"] == "AS3320"


def test_build_case_json_is_serializable(sample_case_with_alerts):
    """Verify JSON export is 100% standard JSON-serializable."""
    report = build_case_json_report(sample_case_with_alerts)
    serialized = json.dumps(report)
    assert isinstance(serialized, str)
    deserialized = json.loads(serialized)
    assert deserialized["case"]["id"] == sample_case_with_alerts["id"]


def test_build_case_pdf_report_valid_pdf(sample_case_with_alerts):
    """Verify PDF export generates valid bytes beginning with %PDF- header."""
    pdf_bytes = build_case_pdf_report(sample_case_with_alerts)
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 1000
    assert pdf_bytes.startswith(b"%PDF-")


def test_build_case_pdf_report_empty_case(temp_store):
    """Verify PDF export handles cases with zero alerts cleanly."""
    empty_case = temp_store.create_case(title="Empty Case", description="No alerts")
    full_empty_case = temp_store.get_case(empty_case["id"])
    pdf_bytes = build_case_pdf_report(full_empty_case)
    assert pdf_bytes.startswith(b"%PDF-")
    assert len(pdf_bytes) > 1000


def test_build_case_pdf_report_multiple_pages(temp_store):
    """Verify multi-page PDF generation when multiple alerts are attached."""
    case = temp_store.create_case(title="Multi-Alert Lead", description="Many attached items")
    case_id = case["id"]

    for i in range(5):
        temp_store.attach_alert(
            case_id,
            {
                "alert_id": f"ALT-00{i+1}",
                "txid": f"tx{i:062d}",
                "src_ip": f"10.0.0.{i+1}",
                "score": 75.0 + i,
                "confidence": 0.85,
                "reasons": ["anomalous transaction volume", "rapid clustering"],
                "geo_country": "SG",
                "asn": "AS37963",
            },
            analyst_note=f"Evidence block {i+1}",
        )

    multi_case = temp_store.get_case(case_id)
    pdf_bytes = build_case_pdf_report(multi_case)
    assert pdf_bytes.startswith(b"%PDF-")
    pages = re.findall(rb"/Type\s*/Page[^s]", pdf_bytes)
    assert len(pages) >= 2


def test_api_export_json_endpoint(temp_store, sample_case_with_alerts):
    """Test GET /api/cases/{case_id}/export/json endpoint."""
    set_default_case_store(temp_store)
    try:
        response = api_export_case_json(case_id=sample_case_with_alerts["id"])
        assert response.status_code == 200
        assert f'case_{sample_case_with_alerts["id"]}_report.json' in response.headers.get("Content-Disposition", "")
        
        body = json.loads(response.body.decode("utf-8"))
        assert body["case"]["title"] == "Cross-Border High Fan-Out Investigation"
        assert body["report_metadata"]["classification"] == REPORT_CLASSIFICATION
    finally:
        set_default_case_store(None)


def test_api_export_pdf_endpoint(temp_store, sample_case_with_alerts):
    """Test GET /api/cases/{case_id}/export/pdf endpoint."""
    set_default_case_store(temp_store)
    try:
        response = api_export_case_pdf(case_id=sample_case_with_alerts["id"])
        assert response.status_code == 200
        assert response.media_type == "application/pdf"
        assert f'case_{sample_case_with_alerts["id"]}_report.pdf' in response.headers.get("Content-Disposition", "")
        assert response.body.startswith(b"%PDF-")
    finally:
        set_default_case_store(None)


def test_api_export_nonexistent_case_raises_404(temp_store):
    """Verify both export endpoints return HTTP 404 for nonexistent cases."""
    set_default_case_store(temp_store)
    try:
        with pytest.raises(HTTPException) as exc_json:
            api_export_case_json(case_id=99999)
        assert exc_json.value.status_code == 404

        with pytest.raises(HTTPException) as exc_pdf:
            api_export_case_pdf(case_id=99999)
        assert exc_pdf.value.status_code == 404
    finally:
        set_default_case_store(None)


def test_export_is_strictly_read_only(temp_store, sample_case_with_alerts):
    """Verify exporting never alters case or alert records, status, or timestamps."""
    set_default_case_store(temp_store)
    case_id = sample_case_with_alerts["id"]
    try:
        # Snapshot state before exports
        before_case = temp_store.get_case(case_id)
        before_alerts = temp_store.get_case_alerts(case_id)

        # Run exports
        api_export_case_json(case_id=case_id)
        api_export_case_pdf(case_id=case_id)

        # Snapshot state after exports
        after_case = temp_store.get_case(case_id)
        after_alerts = temp_store.get_case_alerts(case_id)

        assert before_case == after_case
        assert before_alerts == after_alerts
        assert after_case["updated_at"] == before_case["updated_at"]
        assert after_case["status"] == before_case["status"]
    finally:
        set_default_case_store(None)
