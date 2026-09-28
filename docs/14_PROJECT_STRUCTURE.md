# Project Structure

```text
bitcoin_traffic_intelligence_prototype/
├── backend/
│   ├── __init__.py
│   ├── main.py                          # FastAPI application and route handlers
│   └── services/
│       ├── __init__.py
│       ├── parsers.py                   # Multi-format ingestion (CSV, JSON, XML)
│       ├── features.py                  # 12-D numerical feature engineering
│       ├── geoip.py                     # Offline GeoIP / ASN enrichment
│       ├── pipeline.py                  # ML orchestration, TreeSHAP + heuristic explainability
│       ├── graphing.py                  # NetworkX multi-partite graph construction
│       ├── clustering.py                # Connected components + modularity communities
│       ├── case_store.py                # SQLite persistent investigation case management
│       └── reports.py                   # Read-only JSON and multi-page vector PDF export
├── frontend/
│   ├── index.html                       # Forensic investigation console UI
│   └── assets/
│       ├── app.js                       # Frontend state, API integration, and Cytoscape logic
│       ├── style.css                    # Dark-themed console styling
│       └── cytoscape.min.js             # Bundled local Cytoscape.js library (414 KB)
├── data/
│   ├── sample/
│   │   ├── sample_transactions.csv      # 60-record primary evaluation dataset
│   │   ├── sample_transactions.json     # 12-record JSON evaluation dataset
│   │   └── sample_transactions.xml      # 6-record XML evaluation dataset
│   └── cases.db                         # Local SQLite case database (auto-created)
├── tests/
│   ├── test_parsers.py                  # Ingestion and normalization tests
│   ├── test_pipeline.py                 # Pipeline execution and graph summary tests
│   ├── test_geoip_clustering.py         # GeoIP and clustering tests
│   ├── test_case_store.py               # SQLite case CRUD and Foreign Key cascade tests
│   └── test_reports.py                  # JSON/PDF report export and fidelity tests
├── docs/                                # Technical architecture, specifications, and guides
├── requirements.txt                     # Pinned project dependencies (including matplotlib)
├── setup.sh                             # Automated Linux virtualenv installation script
├── run.sh                               # Linux application runner script
├── setup.bat                            # Windows automated setup script
├── run.bat                              # Windows application runner script
├── Dockerfile                           # Container definition (python:3.12-slim)
└── docker-compose.yml                   # Container composition specification
```
