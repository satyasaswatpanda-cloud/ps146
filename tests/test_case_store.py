import os
from pathlib import Path
import tempfile
import pytest
from fastapi import HTTPException

from backend.main import (
    create_case as api_create_case,
    list_cases as api_list_cases,
    get_case as api_get_case,
    update_case as api_update_case,
    attach_alert as api_attach_alert,
    get_case_alerts as api_get_case_alerts,
    delete_case as api_delete_case,
    CaseCreate,
    CaseUpdate,
    AttachAlertRequest,
)
from backend.services.case_store import CaseStore, set_default_case_store


@pytest.fixture
def temp_store():
    """Provides a fresh temporary SQLite CaseStore for each test."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test_cases.db"
        store = CaseStore(db_path=db_path)
        yield store


@pytest.fixture
def memory_store():
    """Provides a pure in-memory CaseStore."""
    return CaseStore(db_path=":memory:")


def test_init_db(temp_store):
    assert Path(temp_store.db_path).exists()
    cases = temp_store.list_cases()
    assert cases == []


def test_create_and_get_case(memory_store):
    case = memory_store.create_case(
        title="High-Value Funnel Investigation",
        description="Suspicious fan-out patterns detected",
        status="open",
        analyst_note="Initial triage review required."
    )
    assert case["id"] is not None
    assert case["title"] == "High-Value Funnel Investigation"
    assert case["description"] == "Suspicious fan-out patterns detected"
    assert case["status"] == "open"
    assert case["analyst_note"] == "Initial triage review required."
    assert case["created_at"] is not None
    assert case["updated_at"] is not None
    assert case["alert_count"] == 0
    assert case["alerts"] == []

    # Retrieve case
    retrieved = memory_store.get_case(case["id"])
    assert retrieved == case


def test_create_case_empty_title_fails(memory_store):
    with pytest.raises(ValueError, match="title cannot be empty"):
        memory_store.create_case(title="   ")


def test_list_cases_and_filter(memory_store):
    c1 = memory_store.create_case(title="Case 1", status="open")
    c2 = memory_store.create_case(title="Case 2", status="investigating")
    c3 = memory_store.create_case(title="Case 3", status="closed")

    all_cases = memory_store.list_cases()
    assert len(all_cases) == 3

    open_cases = memory_store.list_cases(status="open")
    assert len(open_cases) == 1
    assert open_cases[0]["id"] == c1["id"]

    investigating_cases = memory_store.list_cases(status="investigating")
    assert len(investigating_cases) == 1
    assert investigating_cases[0]["id"] == c2["id"]


def test_attach_alert_and_retrieve(memory_store):
    case = memory_store.create_case(title="Sanctioned Jurisdiction Flow")

    alert_data = {
        "id": "ALT-009",
        "txid": "tx0000000000000000000000000000000000000000000000000000000000000008",
        "src_ip": "10.0.2.10",
        "geo_country": "IN",
        "asn": "AS64500",
        "score": 85.4,
        "confidence": 0.92,
        "reasons": [
            "many output addresses",
            "large aggregate output amount",
            "unusually high fee in this synthetic dataset"
        ]
    }

    attached = memory_store.attach_alert(
        case_id=case["id"],
        alert_data=alert_data,
        analyst_note="High risk transaction observed via AS64500."
    )
    assert attached is not None
    assert attached["case_id"] == case["id"]
    assert attached["alert_id"] == "ALT-009"
    assert attached["txid"] == alert_data["txid"]
    assert attached["src_ip"] == "10.0.2.10"
    assert attached["score"] == 85.4
    assert attached["confidence"] == 0.92
    assert attached["reasons"] == alert_data["reasons"]
    assert attached["geo_country"] == "IN"
    assert attached["asn"] == "AS64500"
    assert attached["analyst_note"] == "High risk transaction observed via AS64500."

    # Verify retrieved case has updated alerts
    c = memory_store.get_case(case["id"])
    assert c["alert_count"] == 1
    assert len(c["alerts"]) == 1
    assert c["alerts"][0]["alert_id"] == "ALT-009"
    assert c["alerts"][0]["reasons"] == alert_data["reasons"]

    # Verify get_case_alerts
    alerts_list = memory_store.get_case_alerts(case["id"])
    assert len(alerts_list) == 1
    assert alerts_list[0]["alert_id"] == "ALT-009"


def test_attach_alert_to_nonexistent_case(memory_store):
    attached = memory_store.attach_alert(99999, {"id": "ALT-001"})
    assert attached is None


def test_update_case_status_and_notes(memory_store):
    case = memory_store.create_case(title="Triage Case", status="open")
    orig_updated_at = case["updated_at"]

    updated = memory_store.update_case(
        case_id=case["id"],
        status="investigating",
        analyst_note="Assigned to senior investigator."
    )
    assert updated is not None
    assert updated["status"] == "investigating"
    assert updated["analyst_note"] == "Assigned to senior investigator."
    assert updated["updated_at"] >= orig_updated_at


def test_update_nonexistent_case(memory_store):
    res = memory_store.update_case(99999, status="closed")
    assert res is None


def test_foreign_key_cascade_delete(memory_store):
    case = memory_store.create_case(title="Cascade Test Case")
    memory_store.attach_alert(case["id"], {"id": "ALT-001", "txid": "tx123"})
    memory_store.attach_alert(case["id"], {"id": "ALT-002", "txid": "tx456"})

    alerts_before = memory_store.get_case_alerts(case["id"])
    assert len(alerts_before) == 2

    # Delete case
    deleted = memory_store.delete_case(case["id"])
    assert deleted is True

    # Case should not exist
    assert memory_store.get_case(case["id"]) is None

    # Alerts should have been cascade deleted
    alerts_after = memory_store.get_case_alerts(case["id"])
    assert alerts_after == []


def test_persistence_across_connections(temp_store):
    """Verify data is persisted across separate database connections and store instances."""
    case = temp_store.create_case(title="Persistent Cold Storage Case")
    temp_store.attach_alert(case["id"], {"id": "ALT-007", "score": 90.0, "reasons": ["heavy fan-out"]})
    case_id = case["id"]
    db_path = temp_store.db_path

    # Simulate application restart with a new CaseStore opening the same SQLite file
    new_store_instance = CaseStore(db_path=db_path)
    reopened_case = new_store_instance.get_case(case_id)
    assert reopened_case is not None
    assert reopened_case["title"] == "Persistent Cold Storage Case"
    assert reopened_case["alert_count"] == 1
    assert reopened_case["alerts"][0]["alert_id"] == "ALT-007"
    assert reopened_case["alerts"][0]["score"] == 90.0
    assert reopened_case["alerts"][0]["reasons"] == ["heavy fan-out"]


def test_case_api_endpoint_flow():
    """Test full FastAPI case endpoints flow using an isolated test database."""
    with tempfile.TemporaryDirectory() as tmpdir:
        test_db = Path(tmpdir) / "api_test.db"
        test_store = CaseStore(db_path=test_db)
        set_default_case_store(test_store)

        try:
            # 1. Create case via API endpoint
            payload = CaseCreate(
                title="API Flow Case",
                description="Testing FastAPI case flow",
                status="open",
                analyst_note="Created via automated test"
            )
            case = api_create_case(payload)
            case_id = case["id"]
            assert case["title"] == "API Flow Case"

            # 2. List cases via API endpoint
            cases = api_list_cases()
            assert len(cases) >= 1
            assert any(c["id"] == case_id for c in cases)

            # 3. Attach alert via API endpoint
            alert_payload = AttachAlertRequest(
                alert_id="ALT-009",
                txid="tx0000000000000000000000000000000000000000000000000000000000000008",
                src_ip="10.0.2.10",
                score=85.4,
                confidence=0.92,
                reasons=["many output addresses", "unusually high fee in this synthetic dataset"],
                geo_country="IN",
                asn="AS64500",
                analyst_note="Attached via test"
            )
            attached = api_attach_alert(case_id, alert_payload)
            assert attached["alert_id"] == "ALT-009"
            assert attached["case_id"] == case_id

            # 4. Update case status & analyst note via API endpoint
            update_payload = CaseUpdate(
                status="investigating",
                analyst_note="Under active forensic review"
            )
            updated = api_update_case(case_id, update_payload)
            assert updated["status"] == "investigating"
            assert updated["analyst_note"] == "Under active forensic review"

            # 5. Retrieve case with attached alerts via API endpoint
            retrieved = api_get_case(case_id)
            assert retrieved["id"] == case_id
            assert retrieved["status"] == "investigating"
            assert retrieved["alert_count"] == 1
            assert len(retrieved["alerts"]) == 1
            assert retrieved["alerts"][0]["alert_id"] == "ALT-009"
            assert retrieved["alerts"][0]["reasons"] == alert_payload.reasons

            # 6. Retrieve case alerts endpoint
            alerts_list = api_get_case_alerts(case_id)
            assert len(alerts_list) == 1

            # 7. Nonexistent case 404s
            with pytest.raises(HTTPException) as exc_info:
                api_get_case(99999)
            assert exc_info.value.status_code == 404

            with pytest.raises(HTTPException) as exc_info:
                api_update_case(99999, CaseUpdate(status="closed"))
            assert exc_info.value.status_code == 404

            with pytest.raises(HTTPException) as exc_info:
                api_attach_alert(99999, AttachAlertRequest(alert_id="ALT-001"))
            assert exc_info.value.status_code == 404

            # 8. Delete case via API endpoint
            del_res = api_delete_case(case_id)
            assert del_res["deleted"] is True
            assert test_store.get_case(case_id) is None

        finally:
            set_default_case_store(None)
