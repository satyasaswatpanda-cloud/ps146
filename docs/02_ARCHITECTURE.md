# Prototype Architecture

```text
CSV / JSON / XML Metadata
            │
            ▼
┌───────────────────────┐
│   Parser & Normalizer │  (parsers.py)
└───────────────────────┘
            │
            ▼
┌───────────────────────┐
│  Offline GeoIP / ASN  │  (geoip.py)
└───────────────────────┘
            │
      ┌─────┴───────────────────────┐
      ▼                             ▼
┌──────────────┐             ┌──────────────┐
│ 12-D Feature │             │ Multi-Partite│
│  Extraction  │             │ Entity Graph │  (graphing.py)
└──────────────┘             └──────────────┘
      │                             │
      ▼                             ▼
┌──────────────┐             ┌──────────────┐
│  Isolation   │             │ Graph-Based  │
│    Forest    │             │  Clustering  │  (clustering.py)
└──────────────┘             └──────────────┘
      │                             │
      ▼                             │
┌──────────────┐                    │
│   Anomaly    │                    │
│   Scoring    │                    │
└──────────────┘                    │
      │                             │
      ▼                             │
┌──────────────┐                    │
│  Heuristic   │                    │
│ Attribution  │                    │
└──────────────┘                    │
      │                             │
      └──────────────┬──────────────┘
                     ▼
          ┌─────────────────────┐
          │ Pipeline Summary &  │  (pipeline.py)
          │ Cytoscape Elements  │
          └─────────────────────┘
                     │
                     ▼
          ┌─────────────────────┐
          │     FastAPI App     │  (backend/main.py)
          └─────────────────────┘
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│ Interactive UI  │     │ Persistent Case │  (case_store.py)
│    Dashboard    │     │  Store (SQLite) │
└─────────────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │ Forensic Report │  (reports.py)
                        │  Export Engine  │
                        │  (JSON / PDF)   │
                        └─────────────────┘
```

---

## Service Modules

* **`backend/services/parsers.py`**: Multi-format ingestion (CSV, JSON, XML) and normalization of pipe-separated array fields.
* **`backend/services/geoip.py`**: Offline GeoIP/ASN enrichment, RFC1918 private range classification, and optional MaxMind `.mmdb` integration.
* **`backend/services/features.py`**: 12-dimensional numerical feature engineering combining blockchain values, fan-out counts, Geo/ASN rarity, and network-layer signals (dst_ip repetition, nonstandard-port flag, src_ip burst timing).
* **`backend/services/pipeline.py`**: Execution orchestrator, Isolation Forest anomaly scoring, TreeSHAP model-native attribution, and rule-based heuristic explanation attribution.
* **`backend/services/graphing.py`**: NetworkX multi-partite graph construction (IP, TX, Wallet, Country, ASN) and Cytoscape.js serialization.
* **`backend/services/clustering.py`**: Graph-based entity clustering using connected components and greedy modularity community detection.
* **`backend/services/case_store.py`**: SQLite persistent investigation case storage, alert attachment, and status tracking.
* **`backend/services/reports.py`**: Read-only machine-readable JSON dossier and multi-page vector PDF report generation.
* **`backend/main.py`**: FastAPI application entrypoint, REST API routes, and static asset serving.
* **`frontend/`**: Single-page forensic investigation console (`index.html`, `app.js`, `style.css`, `cytoscape.min.js`).
