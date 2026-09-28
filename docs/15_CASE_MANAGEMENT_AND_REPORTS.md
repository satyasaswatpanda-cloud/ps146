# Persistent Case Management & Forensic Reporting

## 1. Overview
The Bitcoin Traffic Intelligence prototype provides a persistent case management system (`backend/services/case_store.py`) backed by Python's built-in `sqlite3` database, coupled with a read-only reporting service (`backend/services/reports.py`) for exporting investigation dossiers.

---

## 2. SQLite Database Architecture

* **Database File Location**: Defaults to `data/cases.db` (automatically created on first run), configurable via the `CASE_DB_PATH` environment variable.
* **Foreign Key Constraints**: Uses SQLite Foreign Key cascading (`ON DELETE CASCADE`) enforced via `PRAGMA foreign_keys = ON;`.
* **Database Isolation**: Unit and regression tests utilize `:memory:` or temporary directory databases to ensure production cases are never polluted.

### Schema Definitions

#### `cases` Table
Stores high-level investigation lead dossiers:
* `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
* `title` (TEXT NOT NULL): Brief case summary.
* `description` (TEXT): Detailed investigative scope.
* `status` (TEXT NOT NULL DEFAULT 'open'): Current status (`open`, `investigating`, `closed`).
* `analyst_note` (TEXT): Case-level investigative observations and conclusions.
* `created_at` (TEXT NOT NULL): ISO-8601 UTC timestamp.
* `updated_at` (TEXT NOT NULL): ISO-8601 UTC timestamp (automatically updated on modification).

#### `case_alerts` Table
Stores forensic anomaly evidence items attached to specific cases:
* `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
* `case_id` (INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE)
* `alert_id` (TEXT NOT NULL): Unique alert identifier (e.g. `ALT-028`).
* `txid` (TEXT): 64-character transaction hash.
* `src_ip` (TEXT): Observed source IP address.
* `score` (REAL): Normalized anomaly score (0.0 to 100.0).
* `confidence` (REAL): Anomaly confidence value (0.50 to 0.99).
* `reasons` (TEXT): JSON-serialized list of detection reasons.
* `geo_country` (TEXT): Geographic country code.
* `asn` (TEXT): Routing Autonomous System identifier.
* `analyst_note` (TEXT): Alert-specific evidence notes.
* `created_at` (TEXT NOT NULL): ISO-8601 UTC timestamp.

---

## 3. Investigation Lifecycle Workflow

```
[Anomalous Transaction Detected]
               │
               ▼
   [Analyst Reviews Alert in UI]
               │
               ▼
    [Create Case / Attach Lead]
               │
               ▼
[Add Investigative Notes & Update Status]
               │
               ▼
    [Export Forensic Dossier]
    ├── Machine-Readable JSON
    └── Multi-Page Vector PDF
```

1. **Lead Triaging**: Analysts inspect alerts produced by the Isolation Forest model on the dashboard.
2. **Case Creation**: An analyst creates a case (e.g. *"Darknet Mixer Attribution Lead"*).
3. **Evidence Preservation**: Alerts are attached to the case via the `+ Case` modal with optional alert-level notes.
4. **Iterative Analysis**: Analysts update the status (`open` $\rightarrow$ `investigating` $\rightarrow$ `closed`) and save running commentary.
5. **Dossier Export**: When complete, the case can be exported for external presentation.

---

## 4. Forensic Report Export Formats

### Read-Only Operation Guarantee
Exporting reports is strictly **READ-ONLY**. Report generation executes purely functional queries and transformations; it never alters database records, timestamps, statuses, or notes.

### Neutral Report Classification
All generated reports carry the neutral academic/demonstration classification:
> **Classification: SIH Demonstration / Forensic Analysis Report**  
> *(The prototype does not generate or claim official law-enforcement legal attribution).*

---

### Format A: Machine-Readable JSON Dossier
* **Endpoint**: `GET /api/cases/{case_id}/export/json`
* **Content-Type**: `application/json`
* **File Header**: `Content-Disposition: attachment; filename="case_{case_id}_report.json"`
* **Structure**: Contains top-level `report_metadata` (generated timestamp, application name, classification) and full `case` object with array of attached `alerts`.

### Format B: Multi-Page Vector PDF Report
* **Endpoint**: `GET /api/cases/{case_id}/export/pdf`
* **Content-Type**: `application/pdf`
* **File Header**: `Content-Disposition: attachment; filename="case_{case_id}_report.pdf"`
* **Engine**: Rendered in memory using `matplotlib.backends.backend_pdf.PdfPages` (zero third-party binary dependencies).
* **Layout Design**:
  * **Page 1**: High-contrast dark navy banner, classification badge, generation timestamp, case metadata summary box, case description, case analyst notes, and first alert card.
  * **Subsequent Pages**: Continuation header with case ID, report classification, and up to two alert evidence cards per page.
  * **Alert Card Details**: Alert ID, score badge, confidence, monospace transaction ID, origin IP, country, ASN, detection reasons, and alert-specific analyst notes.
  * **Footer**: Standardized page numbers (`Page X of Y`) and prototype limitation notice.
