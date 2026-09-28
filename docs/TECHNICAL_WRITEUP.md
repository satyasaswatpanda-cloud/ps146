# ANTARDRISHTI — Technical Write-up

**SIH26146: AI-Powered Monitoring & Analysis of Bitcoin Transaction Traffic**

## 1. Approach

Bitcoin transactions are pseudonymous, but the network traffic that carries them is not: every
transaction is relayed by a source IP, port, and (usually) geolocatable ASN. ANTARDRISHTI's core
idea is to build **one heterogeneous graph that joins the network layer to the blockchain layer**
— IP, peer, port, country and ASN nodes on one side; transaction and wallet-address nodes on the
other — rather than analysing either layer alone. Anomaly detection, entity resolution and
laundering-pattern detection all run over this joint graph, so a lead is never just "this
transaction looks odd" but "this transaction looks odd, was relayed from this IP/ASN, and belongs
to this resolved wallet entity."

Pipeline: **Ingestion → Network/Blockchain Correlation → Detection → Entity Intelligence →
Explainability → Dashboard.**

1. **Ingestion** — Polars parses CSV/JSON/XML; Pydantic validates every row individually (bad rows
   are reported and skipped, not fatal); DuckDB computes batch statistics (IP/ASN/script
   repetition, per-source burst timing) in one SQL pass so the same pipeline scales to bulk
   uploads.
2. **Correlation** — a NetworkX graph joins IP/peer/port/country/ASN nodes to transaction/wallet
   nodes. A "backbone" view (hub nodes like country/ASN removed) is used wherever raw graph
   structure — not shared geography — should drive a result.
3. **Detection** — 20 engineered features (amount/shape, network-behaviour, script, graph, and
   graph-pattern families) feed an **IsolationForest + CatBoost** blend (below).
4. **Pattern detection** — peeling-chain and CoinJoin-style mixing detectors run directly on
   transaction shape and graph structure, plus flow tracing that follows funds pre-mix → mixer →
   post-mix hops.
5. **Entity intelligence** — Union-Find wallet resolution (common-input + peeling-change
   heuristics) produces multi-wallet entities, each with a candidate network origin
   (IP → country → ASN).
6. **Explainability** — TreeSHAP per alert, plus a grounded narrative (template or optional local
   LLM) that a validator checks against the evidence before it's shown.
7. **Dashboard** — a Next.js/React/TypeScript investigation UI (Cytoscape.js link-analysis graph,
   alert detail, case management with export).

## 2. Model choice

| Stage | Model | Why |
|---|---|---|
| Primary anomaly detection | **IsolationForest** | No labels needed — the realistic case for a new capture with no confirmed illicit examples. Cheap, well-calibrated for tabular anomaly scoring, and its tree structure supports exact SHAP explanations. |
| Refinement | **CatBoost** | Adds a learned, non-linear decision boundary over the same features. Trained **supervised** if the upload carries a `label` column, otherwise **weak-supervised** from IsolationForest outliers + graph-pattern hits. Always scored **out-of-fold** (k-fold), so no record is ever scored by a model that memorised its own weak label. Final score = a documented 0.6×IF + 0.4×CatBoost blend (0.4/0.6 when real labels exist). |
| Graph-pattern detection | **Rule-based, not learned** | Peeling chains and CoinJoin-style mixing have well-defined structural signatures (Meiklejohn et al.). A precise detector beats a black-box classifier here, and it's auditable — the exact ratio/threshold that fired is always visible. |
| Entity resolution | **Union-Find over common-input + peeling-change heuristics** | Same reasoning: these are the standard, defensible clustering heuristics for wallet ownership (not a black-box embedding), so every merge has a stated cause. |
| Wallet-behaviour clustering | **GraphSAGE (PyTorch Geometric) structural embedding + PCA behavioural embedding → DBSCAN** | GraphSAGE learns structure beyond hand-picked graph stats; DBSCAN needs no fixed cluster count and reports outliers explicitly (a risk signal in its own right). If PyG isn't installed, a dependency-free spectral fallback (two rounds of normalised neighbourhood propagation + truncated SVD) runs instead — reported honestly via a `method` field, never silently. |
| Graph analytics (optional) | **Neo4j Graph Data Science (WCC, PageRank)** | Where the in-memory graph is large enough or an investigator wants to explore it interactively; the platform's own detection never depends on this being available. |

## 3. Explainability method

- **TreeSHAP** on both IsolationForest and CatBoost gives an exact, additive per-feature
  contribution for every flagged record (not an approximation) — surfaced as ranked bars in the
  dashboard with a "toward anomaly" / "toward normal" direction.
- **Grounded narrative layer**: a short natural-language summary per alert, built either from a
  fixed template or an optional local LLM. Every narrative — template or LLM — passes through a
  **validator** that rejects any IP, ID, transaction hash, number, or verdict-style claim
  ("is guilty", "proven") not present in the alert's own evidence. An LLM narrative that fails
  validation is discarded in favour of the template; the LLM can rephrase, never invent.
- **Structural transparency**: peeling-chain and mixing detections carry their own `reason` string
  stating exactly which shape matched (e.g. "7 consecutive 2-output transactions, larger output
  spent by the next hop"), and entity resolutions carry their `heuristics` list
  (`common-input`, `peeling-change`).

## 4. Validation

Because the bundled data is synthetic, claims are checked against a **generator with known ground
truth** (`backend/services/synthetic.py`) rather than asserted. Latest run
(`backend/services/validation.py`, seed 7, 177 synthetic records, 23 illicit):

| Metric | Value |
|---|---|
| Precision / Recall / F1 (transaction-level) | 1.00 / 0.87 / 0.93 |
| ROC-AUC / Average precision | 0.93 / 0.89 |
| Peeling-chain recall / precision | 1.00 / 1.00 |
| Mixing recall | 1.00 |
| Entity-resolution purity | 1.00 |

Every run and every benchmark is logged to a local MLflow store for reproducibility.

## 5. Offline operation & known limits

Every optional engine (local LLM, Neo4j, PyTorch Geometric) is validated as loopback/private-only
when configured and degrades to a documented no-op — never a silent failure — when absent. The
shipped dashboard self-hosts its fonts rather than fetching them at runtime.

Limitations, stated plainly: the bundled/generated data is synthetic, so these numbers describe
detector behaviour on known patterns, not real-world illicit-activity rates. Network-origin
attribution is a candidate lead (most frequent relaying IP/ASN), not identity or physical
attribution. GraphSAGE currently runs on its dependency-free fallback in this build (PyTorch
Geometric wasn't installed); the Neo4j/GDS stage is implemented and called from the pipeline but
untested against a live Neo4j instance in this build.
