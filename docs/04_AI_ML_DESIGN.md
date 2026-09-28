# AI/ML Design: Anomaly Detection Architecture

> **Stale — superseded.** This describes the original single-IsolationForest, 12-feature
> prototype. The current model (IsolationForest + CatBoost blend, 20 features, graph-pattern
> detection, entity resolution, GraphSAGE/DBSCAN wallet clustering) is described in
> [`docs/TECHNICAL_WRITEUP.md`](./TECHNICAL_WRITEUP.md) and implemented in `backend/services/`.
> Kept here for history; not updated.

## 1. Prototype Model
The application uses **Isolation Forest** (`sklearn.ensemble.IsolationForest`) as an unsupervised learning baseline for detecting anomalous Bitcoin transaction traffic from synthetic network/blockchain metadata.

### Model Hyperparameters
* **Estimators**: `n_estimators = 100`
* **Contamination Rate**: Dynamic adaptive contamination:
  $$\text{contamination} = \min\left(0.20, \max\left(0.05, \frac{2}{N}\right)\right)$$
  *(For a typical 60-record batch, contamination evaluates to $0.05$, flagging exactly 3 top outlier leads).*
* **Random State**: `random_state = 42` (ensures fully reproducible tree splits)
* **Sample Size Threshold**: If $N < 5$, model fitting is bypassed to prevent degenerate splits on tiny datasets, returning all records as inliers (`labels = 1`).

---

## 2. Production Feature Vector (12 Dimensions)
Each normalized transaction record is converted into a 12-dimensional numerical feature vector (`backend/services/features.py`, `FEATURE_NAMES`):

1. **`total_input_value`** — `math.log1p(abs(total_in))`: Natural logarithm of $1 + \sum \text{input\_amounts}$ (suppresses heavy-tailed financial skew).
2. **`total_output_value`** — `math.log1p(abs(total_out))`: Natural logarithm of $1 + \sum \text{output\_amounts}$.
3. **`fee`** — `math.log1p(abs(fee))`: Natural logarithm of $1 + \text{fee}$.
4. **`input_address_count`** — `len(input_addresses)`: Count of distinct input addresses (fan-in measure).
5. **`output_address_count`** — `len(output_addresses)`: Count of distinct output addresses (fan-out measure).
6. **`src_ip_repetition`** — `src_counts[src_ip]`: Batch-relative observation frequency of the source IP address.
7. **`dst_ip_repetition`** — `dst_counts[dst_ip]`: Batch-relative observation frequency of the destination IP address (network-layer correlation).
8. **`nonstandard_port`** — `1.0` if either `src_port` or `dst_port` falls outside the standard Bitcoin P2P port set (`{8333, 8332, 18333, 18332, 38333}`), else `0.0` (network-layer correlation).
9. **`txid_repetition`** — `tx_counts[txid]`: Batch-relative frequency of the transaction hash.
10. **`country_rarity`**: Statistical rarity of the observed jurisdiction:
    $$\text{country\_rarity} = 1 - \frac{\text{count}(\text{geo\_country})}{N} \in [0.0, 1.0]$$
11. **`asn_rarity`**: Statistical rarity of the observed routing Autonomous System:
    $$\text{asn\_rarity} = 1 - \frac{\text{count}(\text{asn})}{N} \in [0.0, 1.0]$$
12. **`src_ip_burst_timing`** — `math.log1p(gap_seconds)`: seconds since the previous transaction observed from the same `src_ip` (sorted by `timestamp`), log-scaled. A short gap (burst-like, automated relay / peeling-chain pattern) scores low; a source seen for the first time, or with no parseable timestamp, gets a large default gap (one day) so it reads as "not a burst".

> Fields 7, 8 and 12 close a gap in the original prototype where `dst_ip`, `src_port`, `dst_port` and `timestamp` were parsed and normalized but not actually used by the model — the PS explicitly asks for network-layer (IP/port/timing) correlation, not just blockchain-layer features.

---

## 3. Anomaly Scoring and Normalization

1. **Raw Isolation Score**:
   $$\text{raw} = -\text{score\_samples}(X)$$
   Higher raw values indicate instances that isolate with fewer tree splits (more anomalous).
2. **Batch Min-Max Normalization**:
   $$\text{norm} = \frac{\text{raw} - \min(\text{raw})}{\max(\text{raw}) - \min(\text{raw})}$$
3. **Prioritization Score (0.0 to 100.0)**:
   $$\text{score} = \text{round}(\text{norm} \times 100, 1)$$
4. **Model Confidence Value**:
   $$\text{confidence} = \text{round}(0.50 + 0.49 \times \text{norm}, 2) \in [0.50, 0.99]$$

> [!IMPORTANT]
> **Confidence Semantics**:
> The `confidence` metric is an **affine linear scaling of the normalized anomaly score**, designed for analyst triage ranking. It is **NOT** a calibrated posterior Bayesian probability.

---

## 4. Hybrid Explainability Method

The system combines two complementary attribution layers for every flagged record (`backend/services/pipeline.py`):

### 4a. Model-native attribution — TreeSHAP
`shap.TreeExplainer` is run directly over the fitted `IsolationForest` and returns each flagged record's top-3 contributing features by `|SHAP value|`, exposed in the API response as `alert.shap_explanation`. This is real model-native attribution (not a heuristic) — it explains *why the model itself* produced the score it did.

> **Sign convention**: `TreeExplainer` on `IsolationForest` explains `score_samples()`, where *higher* = more normal/inlier (empirically verified: correlation ≈ 0.995 with `score_samples`, not `decision_function`, which uses the opposite sign). So a **positive** `shap_value` pushes a record toward "normal" and a **negative** value pushes it toward "anomaly" — each attribution is labeled with an explicit `direction` string so this never has to be inferred by the reader.

If `shap` is not installed, or `TreeExplainer` fails on a degenerate fit, `shap_explanation` is `null` for that record and the pipeline falls back to heuristics only — explainability never blocks detection.

### 4b. Deterministic post-hoc heuristics
When the Isolation Forest tags a record as an anomaly (`label == -1`), the engine also evaluates explicit, human-readable domain rules — kept because plain-English reasons are what an investigator actually reads first, and because they stay fully auditable independent of the model:

* `len(output_addresses) >= 4` $\rightarrow$ `"many output addresses"`
* `sum(output_amounts) > 25` $\rightarrow$ `"large aggregate output amount"`
* `fee > 0.02` $\rightarrow$ `"unusually high fee in this synthetic dataset"`
* `geo_country in {"KP", "IR", "SY"}` $\rightarrow$ `"source jurisdiction flagged as high-risk (<country>)"`
* `geo_source == "rfc1918"` $\rightarrow$ `"source IP is a private/reserved range (no public geolocation)"`
* `src_port` or `dst_port` outside `{8333, 8332, 18333, 18332, 38333}` $\rightarrow$ `"non-standard Bitcoin P2P port observed on this link"`
* *Fallback*: If `label == -1` but no specific domain rule fired $\rightarrow$ `"feature pattern differs from the learned dataset baseline"`

---

## 5. Demonstration Data Notice
The bundled evaluation dataset (`data/sample/sample_transactions.*`) is synthetic metadata generated for academic and demonstration purposes. Anomaly alerts represent algorithmic leads for forensic inspection, not definitive proof of criminal activity.
