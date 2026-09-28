"""
Model-native explanations.

  * TreeSHAP over the IsolationForest  (why the anomaly model scored a record)
  * CatBoost native SHAP values         (why the supervised refinement agrees)

Only FLAGGED rows are explained, which keeps the cost flat on bulk uploads.
Explainability never breaks detection: every function degrades to None.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np

from backend.services.features import FEATURE_NAMES

try:
    import shap
    SHAP_AVAILABLE = True
except ImportError:  # pragma: no cover
    SHAP_AVAILABLE = False


def if_shap(model, X: np.ndarray, indices: List[int], top: int = 3) -> Dict[int, Optional[List[Dict[str, Any]]]]:
    if not SHAP_AVAILABLE or model is None or not indices:
        return {i: None for i in indices}
    try:
        values = shap.TreeExplainer(model).shap_values(np.asarray(X[indices], dtype=float))
    except Exception:
        return {i: None for i in indices}
    out = {}
    for i, row in zip(indices, values):
        ranked = sorted(zip(FEATURE_NAMES, row), key=lambda p: abs(p[1]), reverse=True)[:top]
        # TreeExplainer(IsolationForest) explains score_samples(): HIGHER = more
        # normal. Positive SHAP -> toward normal, negative -> toward anomaly.
        out[i] = [{"feature": n, "shap_value": round(float(v), 4),
                   "direction": "pushes toward normal" if v > 0 else "pushes toward anomaly"}
                  for n, v in ranked]
    return out


def catboost_shap(model, X: np.ndarray, indices: List[int], top: int = 3) -> Dict[int, Optional[List[Dict[str, Any]]]]:
    if model is None or not indices:
        return {i: None for i in indices}
    try:
        from catboost import Pool
        vals = model.get_feature_importance(Pool(np.asarray(X[indices], dtype=float)), type="ShapValues")
    except Exception:
        return {i: None for i in indices}
    out = {}
    for i, row in zip(indices, vals):
        contrib = row[:-1]
        ranked = sorted(zip(FEATURE_NAMES, contrib), key=lambda p: abs(p[1]), reverse=True)[:top]
        out[i] = [{"feature": n, "shap_value": round(float(v), 4),
                   "direction": "pushes toward suspicious" if v > 0 else "pushes toward normal"}
                  for n, v in ranked]
    return out


def global_importance(cb_model) -> Dict[str, float]:
    if cb_model is None:
        return {}
    try:
        imp = cb_model.get_feature_importance()
        total = float(sum(imp)) or 1.0
        return {n: round(float(v) / total, 4) for n, v in sorted(zip(FEATURE_NAMES, imp), key=lambda p: -p[1])}
    except Exception:
        return {}
