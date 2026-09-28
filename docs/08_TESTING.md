# Automated Testing Suite

## 1. Running the Tests
Execute the full test suite from the repository root:

### Linux / macOS:
```bash
PYTHONPATH="." pytest -v
```

### Windows (PowerShell):
```powershell
$env:PYTHONPATH="."
.\.venv\Scripts\python.exe -m pytest -v
```

---

## 2. Test Suite Organization (30 Tests)

### `tests/test_parsers.py` (1 test)
* Verifies multi-format parsing, header validation, and array normalization on `data/sample/sample_transactions.csv`.

### `tests/test_pipeline.py` (3 tests)
* `test_pipeline_returns_graph_and_summary`: Confirms end-to-end pipeline execution and alert generation.
* `test_pipeline_includes_clusters_and_geo_fields`: Validates cluster formation and GeoIP/ASN alert fields.
* `test_pipeline_returns_cytoscape_elements`: Validates serialization of node/edge dictionaries and flagged entity tagging.

### `tests/test_geoip_clustering.py` (5 tests)
* `test_classify_ip_private_vs_public`: RFC1918, loopback, and public IP classification.
* `test_resolve_prefers_existing_feed_values`: Priority order favoring upstream feed attributes.
* `test_resolve_falls_back_to_private_range`: Private range fallback handling without crashing.
* `test_enrich_records_fills_missing_geo`: Batch enrichment behavior.
* `test_clusters_group_shared_wallets_and_flag_alerts`: Validates connected components and community modularity splitting.

### `tests/test_case_store.py` (11 tests)
* `test_init_db`: SQLite schema and table creation.
* `test_create_and_get_case`: Case creation and retrieval with zero attached alerts.
* `test_create_case_empty_title_fails`: Input validation enforcing non-empty titles.
* `test_list_cases_and_filter`: Status filtering (`open`, `investigating`, `closed`) and alert count aggregations.
* `test_attach_alert_and_retrieve`: Attaching alert data with analyst notes.
* `test_attach_alert_to_nonexistent_case`: Error handling for invalid case IDs.
* `test_update_case_status_and_notes`: Updating status and timestamps.
* `test_update_nonexistent_case`: 404 validation.
* `test_foreign_key_cascade_delete`: Foreign Key cascading deletion of attached alerts.
* `test_persistence_across_connections`: Data retention across SQLite connections.
* `test_case_api_endpoint_flow`: REST endpoint integration test.

### `tests/test_reports.py` (10 tests)
* `test_build_case_json_report_structure`: Validates JSON schema, metadata, and neutral classification.
* `test_build_case_json_report_alerts_fidelity`: Validates all attached alert forensic fields without fabrication.
* `test_build_case_json_is_serializable`: Confirms 100% JSON-serializable output.
* `test_build_case_pdf_report_valid_pdf`: Confirms `%PDF-` magic header and valid non-empty byte stream.
* `test_build_case_pdf_report_empty_case`: Confirms clean PDF rendering for cases with 0 alerts.
* `test_build_case_pdf_report_multiple_pages`: Confirms multi-page PDF generation (3+ pages) for multiple alerts.
* `test_api_export_json_endpoint`: Validates HTTP 200, Content-Disposition, and JSON payload from endpoint.
* `test_api_export_pdf_endpoint`: Validates HTTP 200, application/pdf media type, and Content-Disposition.
* `test_api_export_nonexistent_case_raises_404`: Validates HTTP 404 for nonexistent cases on both endpoints.
* `test_export_is_strictly_read_only`: Validates database state before and after exports is identical.
