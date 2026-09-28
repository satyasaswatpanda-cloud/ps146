# ANTARDRISHTI — Network-Blockchain Investigation Platform

Offline prototype for **SIH26146: AI-Powered Monitoring & Analysis of Bitcoin Transaction Traffic**.

Two services, talking only to each other:

- **`backend/`** — a FastAPI JSON API running the full detection pipeline.
- **`frontend-next/`** — a Next.js / React / TypeScript investigation dashboard (Cytoscape.js link-analysis graph, case management, system status).

## Pipeline (`Ingestion → Network/Blockchain Correlation → Detection → Entity Intelligence → Explainability → Dashboard`)

| Stage | Where | What it does |
|---|---|---|
| Ingestion & normalization | `parsers.py`, `analytics_sql.py` | Polars parses CSV/JSON/XML; Pydantic validates each row; DuckDB computes batch statistics (repetition, rarity, burst timing) in one SQL pass |
| Network–blockchain correlation | `graphing.py` | One heterogeneous NetworkX graph: IP, peer, port, country, ASN, transaction and wallet nodes |
| Graph-pattern detection | `patterns.py`, `flow_tracing.py` | Peeling-chain and CoinJoin-style mixing detection, plus pre-mix → mixer → post-mix flow tracing |
| Detection | `features.py`, `models.py` | 20-dimension feature vector → IsolationForest (unsupervised) blended with CatBoost (supervised if labels exist, else weak-supervised, always scored out-of-fold) |
| Entity intelligence | `entities.py` | Union-Find wallet resolution (common-input + peeling-change heuristics), candidate network origin (IP → country → ASN) per entity |
| Graph learning | `graph_learning.py` | GraphSAGE (PyTorch Geometric) structural embeddings + behavioural embeddings → DBSCAN wallet clustering. Falls back to a dependency-free spectral embedding, reported honestly via `method`, if PyG isn't installed |
| Graph analytics (optional) | `neo4j_sync.py` | Mirrors the run's graph into Neo4j and runs WCC + PageRank via the Graph Data Science library, as an explicit pipeline stage — not merely a one-way sync. No-ops safely if Neo4j/GDS aren't reachable |
| Explainability | `explain.py`, `llm.py` | TreeSHAP for both models; a local-LLM (optional, offline-only) or template narrative per alert, passed through a grounding validator that rejects any unsupported number, ID or verdict language |
| Tracking | `tracking.py` | Every run and every validation benchmark logged to a local MLflow store (SQLite) |
| Validation harness | `synthetic.py`, `validation.py` | Synthetic labelled data with known ground truth → measured precision/recall/F1/AUC, peeling/mixing recall, entity-resolution purity |
| Dashboard | `frontend-next/` | Next.js/React/TypeScript, Cytoscape.js link-analysis graph, case management with JSON/PDF export |

Everything above runs fully offline: Neo4j, the local LLM and PyTorch Geometric are all optional and validated as loopback/private-network-only when configured (see `backend/config.py::is_local_url`); missing any of them degrades detection quality, never breaks it.

## Run it

### Backend
```bash
chmod +x setup.sh run.sh
./setup.sh
source .venv/bin/activate
./run.sh
```
API and docs: `http://127.0.0.1:8000` / `http://127.0.0.1:8000/docs`

### Frontend
```bash
cd frontend-next
npm install
npm run dev      # http://localhost:3000, proxies /api/* to the backend above
```

### Docker (both services)
```bash
docker compose up            # backend on :8000, dashboard on :3000
docker compose --profile graphdb up   # + Neo4j with the GDS plugin
docker compose --profile llm up       # + a local LLM (Ollama) for narratives
```

## Test
```bash
pytest -q                          # backend: 46 tests
cd frontend-next
npm test                           # Vitest: unit + component tests
npm run e2e                        # Playwright E2E (needs `npx playwright install chromium`
                                    # and the backend running — see e2e/investigation.spec.ts)
```

## Important limitation

The bundled and generated data is synthetic. Model alerts, entity resolutions and network-origin
candidates are investigative leads for prototype demonstration only; they are not proof of criminal
activity, identity, or physical attribution.
