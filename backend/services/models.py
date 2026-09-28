"""
Detection models: Isolation Forest (unsupervised) + CatBoost (supervised /
weakly-supervised refinement), blended into one risk score.

Why two models
  * IsolationForest needs no labels and finds "unlike the rest of the batch".
  * CatBoost adds a learned, non-linear decision surface over the same 20
    features. With real labels (a `label` column in the upload) it is trained
    supervised. Without labels it is trained on WEAK labels (IF outliers +
    graph-pattern hits) and scored strictly OUT-OF-FOLD, so a record is never
    scored by a model that memorised its own weak label.

The blend is intentionally simple and documented: 0.6*IF + 0.4*CatBoost
(0.4/0.6 when real labels exist).
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.model_selection import StratifiedKFold

MIN_ROWS_IF = 5
MIN_ROWS_CB = 30
SEED = 42

try:  # CatBoost is a runtime-optional dependency: the pipeline degrades gracefully
    from catboost import CatBoostClassifier
    CATBOOST_AVAILABLE = True
except Exception:  # pragma: no cover
    CATBOOST_AVAILABLE = False


def parse_label(value: Any) -> Optional[int]:
    """Map a free-form ground-truth cell to 1 (illicit) / 0 (licit) / None."""
    if value is None:
        return None
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "illicit", "malicious", "fraud", "suspicious"}:
        return 1
    if text in {"0", "false", "no", "licit", "benign", "normal", "clean"}:
        return 0
    return None


def _cb_params(n: int) -> Dict[str, Any]:
    return dict(iterations=120 if n <= 50_000 else 80, depth=4, learning_rate=0.1, loss_function="Logloss",
                auto_class_weights="Balanced", random_seed=SEED, verbose=0, allow_writing_files=False,
                thread_count=-1)


def fit_isolation_forest(X: np.ndarray) -> Dict[str, Any]:
    n = len(X)
    if n < MIN_ROWS_IF:
        return {"model": None, "labels": np.ones(n, dtype=int), "raw": np.zeros(n), "norm": np.zeros(n)}
    model = IsolationForest(n_estimators=100, contamination=min(0.20, max(0.05, 2 / n)), random_state=SEED)
    labels = model.fit_predict(X)
    raw = -model.score_samples(X)
    span = (raw.max() - raw.min()) or 1.0
    return {"model": model, "labels": labels, "raw": raw, "norm": (raw - raw.min()) / span}


def fit_catboost(X: np.ndarray, weak_positive: np.ndarray, true_labels: Optional[List[Optional[int]]] = None
                 ) -> Dict[str, Any]:
    n = len(X)
    info: Dict[str, Any] = {"status": "skipped", "reason": "", "mode": None, "prob": None, "model": None}
    if not CATBOOST_AVAILABLE:
        info["reason"] = "catboost not installed"
        return info
    if n < MIN_ROWS_CB:
        info["reason"] = f"needs >= {MIN_ROWS_CB} records (got {n})"
        return info

    supervised = bool(true_labels) and sum(l is not None for l in true_labels) >= 0.8 * n
    if supervised:
        y = np.array([1 if l == 1 else 0 for l in true_labels], dtype=int)
        info["mode"] = "supervised"
    else:
        y = weak_positive.astype(int)
        info["mode"] = "weak-supervised"
    pos, neg = int(y.sum()), int(n - y.sum())
    if pos < 3 or neg < 3:
        info["reason"] = f"too few examples per class (pos={pos}, neg={neg})"
        return info

    params = _cb_params(n)
    folds = max(2, min(5 if n <= 50_000 else 3, pos))
    oof = np.zeros(n)
    skf = StratifiedKFold(n_splits=folds, shuffle=True, random_state=SEED)
    for train_idx, test_idx in skf.split(X, y):
        m = CatBoostClassifier(**params)
        m.fit(X[train_idx], y[train_idx])
        oof[test_idx] = m.predict_proba(X[test_idx])[:, 1]

    final = CatBoostClassifier(**params)  # for explanations / global importance only
    final.fit(X, y)
    info.update(status="active", prob=oof, model=final, positives=pos, negatives=neg, folds=folds,
                params={k: v for k, v in params.items() if k in ("iterations", "depth", "learning_rate")})
    return info


def blend(if_norm: np.ndarray, cb_prob: Optional[np.ndarray], supervised: bool = False) -> np.ndarray:
    if cb_prob is None:
        return if_norm
    w_if, w_cb = (0.4, 0.6) if supervised else (0.6, 0.4)
    return w_if * if_norm + w_cb * cb_prob
