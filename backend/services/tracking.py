"""
MLflow experiment tracking (local, offline).

Every analysis / validation run is logged to a local MLflow store (SQLite
under data/ by default): parameters (model config), metrics (alert counts,
benchmark precision/recall) and a feature-importance artifact. This gives the
team reproducible model history without any external service.

Tracking is best-effort: if MLflow is missing, disabled (MLFLOW_ENABLED=0) or
its store is unwritable, the call is a no-op and detection is unaffected.
"""
from __future__ import annotations

import logging
import warnings
from typing import Any, Dict, Optional

from backend import config

log = logging.getLogger("antardrishti.tracking")


def status() -> Dict[str, Any]:
    if not config.mlflow_enabled():
        return {"enabled": False, "reason": "MLFLOW_ENABLED=0"}
    try:
        import mlflow  # noqa: F401
        return {"enabled": True, "tracking_uri": config.mlflow_tracking_uri(), "version": mlflow.__version__}
    except Exception as exc:  # pragma: no cover
        return {"enabled": False, "reason": f"mlflow unavailable: {exc}"}


def log_run(experiment: str, run_name: str, params: Dict[str, Any], metrics: Dict[str, float],
            artifacts: Optional[Dict[str, Any]] = None, tags: Optional[Dict[str, str]] = None) -> Optional[str]:
    if not config.mlflow_enabled():
        return None
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            import mlflow
            mlflow.set_tracking_uri(config.mlflow_tracking_uri())
            mlflow.set_experiment(experiment)
            with mlflow.start_run(run_name=run_name) as run:
                mlflow.log_params({k: str(v)[:250] for k, v in params.items()})
                mlflow.log_metrics({k: float(v) for k, v in metrics.items() if v is not None})
                for name, payload in (artifacts or {}).items():
                    mlflow.log_dict(payload, f"{name}.json")
                if tags:
                    mlflow.set_tags(tags)
                return run.info.run_id
    except Exception as exc:
        log.warning("MLflow tracking skipped: %s", exc)
        return None
