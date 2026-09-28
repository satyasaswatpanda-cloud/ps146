# Project Implementation Progress

## Completed Tasks (1–8)

- [x] **Repository Architecture**: FastAPI backend + static HTML/JS/CSS console.
- [x] **Multi-Format Ingestion**: Parsers for CSV, JSON, and XML with pipe-separated array normalization.
- [x] **Offline GeoIP / ASN Enrichment (Task 1)**: Prefers feed values, falls back to private RFC1918 classification or optional local `.mmdb` reader (`backend/services/geoip.py`).
- [x] **Entity Clustering (Task 2)**: Graph-based clustering using connected components and greedy modularity community detection (`backend/services/clustering.py`).
- [x] **Interactive Cytoscape.js Link-Analysis (Task 3)**: Interactive network graph with node/edge inspection, zoom/fit toolbar, and flagged entity pulsing animations (`frontend/assets/cytoscape.min.js`).
- [x] **Model Evaluation & Benchmark (Task 4)**: 12-dimensional production feature vector, dynamic contamination, and baseline performance benchmark.
- [x] **Persistent Case Storage (Task 5)**: SQLite-backed case management (`backend/services/case_store.py`) with foreign key cascading and REST APIs (`POST /api/cases`, alert attachments, status updates, notes).
- [x] **Forensic Report Export (Task 6)**: Read-only machine-readable JSON dossier and multi-page vector PDF reports (`backend/services/reports.py`) rendered in memory.
- [x] **Full Compliance & Deployment Audit (Task 7)**: 30 automated tests passing, E2E headless Chrome verification, offline readiness audit, and gap identification.
- [x] **Deployment Readiness & Cleanup (Task 8)**: Added `matplotlib` to `requirements.txt`, updated `run.sh` virtualenv selection, resolved `datetime.utcnow()` deprecation warning (30 passed, 0 warnings), and brought all documentation into alignment with the codebase.
- [x] **Model-Native Explainability & Full Field Correlation (Task 9)**: Added real `shap.TreeExplainer` attribution over the fitted `IsolationForest` (`alert.shap_explanation`, top-3 features by |SHAP value|, with an explicit `direction` label — verified against the model's actual sign convention, not assumed); pipeline degrades gracefully to heuristics-only if `shap` is unavailable. Closed the previously-known feature gap by adding `dst_ip` repetition, a `nonstandard_port` flag (src/dst port outside the standard Bitcoin P2P set), and `src_ip` burst timing (log-scaled gap since the previous transaction from the same source IP, using `timestamp`) to the feature vector (9-D → 12-D), plus a matching new heuristic reason for non-standard ports. All 30 existing tests still pass unmodified; verified end-to-end against the live `/api/analyze` endpoint with real and crafted data.

---

## Known Limitations & Design Decisions

* **Synthetic Demonstration Data**: Bundled records in `data/sample/` are synthetic. Anomaly alerts represent algorithmic investigation leads, not conclusive criminal evidence.
* **No Ground-Truth Malicious Labels**: Unsupervised Isolation Forest is used because real labeled ground-truth Bitcoin traffic with peer-level network attribution is unavailable in open research datasets.
* **Confidence Semantics**: Model confidence is an affine linear transformation of the normalized anomaly score, not a calibrated Bayesian posterior probability.
* **Explainability Architecture**: Feature attribution now combines model-native TreeSHAP values with deterministic post-hoc heuristic domain rules (see `docs/04_AI_ML_DESIGN.md` §4). LIME is still not implemented.
* **Remaining Graph-Topology Gap**: `dst_ip`, `src_port`, and `dst_port` now feed the 12-D feature vector (as `dst_ip_repetition` and `nonstandard_port`) but are still not represented as edges/nodes in the entity graph itself — the graph still only links IPs, wallets, transactions, countries, and ASNs.
* **Partial Temporal Correlation**: `src_ip_burst_timing` (gap since the previous transaction from the same source IP) is now a model feature, but full sliding-window / multi-hop latency correlation across the whole batch is still not implemented.
* **Network Isolation**: Static offline readiness has been verified through codebase inspection; physical air-gapped network isolation execution was not performed in this testing environment.
