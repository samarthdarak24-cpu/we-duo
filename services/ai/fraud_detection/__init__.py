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
    return {
        "name": MODEL_NAME,
        "version": meta.get("version") or "0.0.0",
        "mode": "experimental",
        "training_data": "synthetic-demo",
        "metrics": meta.get("metrics") or None,
        "features": meta.get("features") or [],
        "available": weights_exist,
        "weights_file": WEIGHTS_FILE if weights_exist else None,
        "disclaimer": "Not trained on real labelled fraud data; provided for experimentation only.",
    }
