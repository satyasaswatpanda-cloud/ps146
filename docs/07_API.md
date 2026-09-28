# REST API Specification

The backend is built with FastAPI (`backend/main.py`) providing endpoints for pipeline execution, entity graph analysis, SQLite case management, and forensic report exports.

---

## 1. System & Ingestion Endpoints

### `GET /`
Serves the single-page application dashboard (`frontend/index.html`).

### `GET /api/health`
Returns system status.
* **Response**: `{"status": "ok", "mode": "offline-prototype"}`

### `GET /api/sample`
Parses and executes the bundled synthetic dataset (`data/sample/sample_transactions.csv`) through the complete pipeline.
* **Response (JSON)**:
  * `summary`: Dataset size, alert counts, cluster counts, model name, and data notices.
  * `alerts`: List of top 20 prioritized anomaly alerts.
  * `graph`: Node count, edge count, node kinds breakdown, centrality top nodes, and Cytoscape elements.
  * `clusters`: Ranked list of detected entity clusters.

### `POST /api/analyze`
Multipart form upload for arbitrary metadata files.
* **Form Field**: `file` (File upload, maximum 10 MB).
* **Supported Extensions**: `.csv`, `.json`, `.xml`.
* **Response**: Same unified schema as `/api/sample`.
* **Errors**: `400 Bad Request` for unsupported formats or malformed syntax; `413 Payload Too Large` for files > 10 MB.

---

## 2. Persistent Case Management Endpoints

### `POST /api/cases`
Creates a new investigation case in SQLite (`data/cases.db`).
* **Status Code**: `201 Created`
* **Request Body (JSON)**:
  ```json
  {
    "title": "Suspicious Funnel Investigation",
    "description": "Optional investigation scope description",
    "status": "open",
    "analyst_note": "Initial triage observations"
  }
  ```
* **Response**: Returns the created case object.

### `GET /api/cases`
Lists all investigation cases with aggregated `alert_count`, ordered by most recently updated.
* **Query Parameters**: `status` (optional: `open`, `investigating`, `closed`).
* **Response**: Array of case summary objects.

### `GET /api/cases/{case_id}`
Retrieves a specific case by ID, including all attached alerts and notes.
* **Response**: Case object with full `alerts` array.
* **Error**: `404 Not Found` if `case_id` does not exist.

### `PATCH /api/cases/{case_id}`
Updates editable fields on a case (modifies `updated_at` automatically).
* **Request Body (JSON)**:
  ```json
  {
    "title": "Updated Title",
    "description": "Updated Description",
    "status": "investigating",
    "analyst_note": "Updated notes"
  }
  ```
* **Response**: Updated case object.
* **Error**: `404 Not Found` if `case_id` does not exist.

### `POST /api/cases/{case_id}/alerts`
Attaches a forensic anomaly alert to a case.
* **Status Code**: `201 Created`
* **Request Body (JSON)**:
  ```json
  {
    "alert_id": "ALT-028",
    "txid": "tx000000...",
    "src_ip": "10.0.3.9",
    "score": 100.0,
    "confidence": 0.99,
    "reasons": ["many output addresses"],
    "geo_country": "US",
    "asn": "AS64500",
    "analyst_note": "Attached during investigation"
  }
  ```
* **Response**: Attached alert record.
* **Error**: `404 Not Found` if `case_id` does not exist.

### `GET /api/cases/{case_id}/alerts`
Retrieves all alerts attached to a specific case.
* **Response**: Array of alert objects.
* **Error**: `404 Not Found` if `case_id` does not exist.

### `DELETE /api/cases/{case_id}`
Deletes a case and cascades deletion to all attached alerts.
* **Response**: `{"deleted": true, "case_id": 1}`
* **Error**: `404 Not Found` if `case_id` does not exist.

---

## 3. Forensic Report Export Endpoints

### `GET /api/cases/{case_id}/export/json`
Generates and downloads a machine-readable JSON dossier.
* **Content-Type**: `application/json`
* **Header**: `Content-Disposition: attachment; filename="case_{case_id}_report.json"`
* **Payload**: Complete `report_metadata` block (with neutral classification `"SIH Demonstration / Forensic Analysis Report"`) and `case` object with all attached `alerts`.
* **Error**: `404 Not Found` if `case_id` does not exist.

### `GET /api/cases/{case_id}/export/pdf`
Generates and streams a multi-page vector PDF report rendered in memory.
* **Content-Type**: `application/pdf`
* **Header**: `Content-Disposition: attachment; filename="case_{case_id}_report.pdf"`
* **Output**: Binary `%PDF-1.4` document stream.
* **Error**: `404 Not Found` if `case_id` does not exist.
