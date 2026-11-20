"""Honest mileage-fraud model metadata.

Loads the experimental XGBoost mileage model artefacts (weights + meta) and
reports them truthfully. It NEVER claims production accuracy: the model is
trained on a synthetic demo corpus and is provided for experimentation only.
"""
from __future__ import annotations

import json
from pathlib import Path

from app.config import settings

MODEL_NAME = "mileage_xgb"
WEIGHTS_FILE = "mileage_xgb.json"
META_FILE = "mileage_xgb.meta.json"


def _read_json(path: Path) -> dict | None:
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def get_model_metadata() -> dict:
    """Return metadata for the mileage fraud model, or an honest unavailable state."""
    meta_path = settings.model_dir / META_FILE
    weights_path = settings.model_dir / WEIGHTS_FILE
    meta = _read_json(meta_path) or {}
    weights_exist = weights_path.is_file()
    # The trainer writes precision/recall/f1 at the top level of the meta file.
    # Older artefacts may already use a nested "metrics" object; support both so
    # real hold-out metrics are never silently reported as unavailable.
    metrics = meta.get("metrics")
    if not isinstance(metrics, dict):
        metrics = {k: meta[k] for k in ("precision", "recall", "f1", "roc_auc") if k in meta}
    return {
        "name": MODEL_NAME,
        "version": meta.get("version") or "0.0.0",
        "mode": "experimental",
        "training_data": meta.get("dataset_label") or "synthetic-demo",
        "metrics": metrics or None,
        "features": meta.get("features") or [],
        "available": weights_exist,
        "weights_file": WEIGHTS_FILE if weights_exist else None,
        "training_note": meta.get("warning") or None,
        "disclaimer": "Not trained on real labelled fraud data; provided for experimentation only.",
    }
