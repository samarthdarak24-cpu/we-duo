"""Optional XGBoost adapter for mileage anomaly scoring.

Only useful with a labelled corpus. `train()` requires a CSV with the feature
columns plus a binary label, reports precision/recall/F1, and saves the model.
`predict()` is inactive until a model file exists and xgboost is installed.
"""
from __future__ import annotations

import csv
import importlib.util
import json
import os
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from ...config import REPO_ROOT
MODEL_DIR = Path(os.getenv("TD_MODEL_DIR", str(REPO_ROOT / "ai-services" / "shared" / "models")))
MODEL_PATH = MODEL_DIR / "mileage_xgb.json"
META_PATH = MODEL_DIR / "mileage_xgb.meta.json"
FEATURES = ["year", "km", "delta", "age_years", "km_per_year"]
MODEL_VERSION = "mileage-xgb-1.1.0"


class NotConfigured(RuntimeError):
    pass


def _installed() -> bool:
    return importlib.util.find_spec("xgboost") is not None


def _meta() -> dict | None:
    if not META_PATH.is_file():
        return None
    try:
        return json.loads(META_PATH.read_text(encoding="utf-8"))
    except Exception:
        return None


def status() -> dict:
    active = _installed() and MODEL_PATH.is_file()
    return {
        "available": active,
        "xgboost_installed": _installed(),
        "model_path": str(MODEL_PATH),
        "model_exists": MODEL_PATH.is_file(),
        "features": FEATURES,
        "version": MODEL_VERSION,
        "training": _meta(),
        "reason": (
            "Ready. Check `training.dataset_label`: a synthetic model is a demo, "
            "not production fraud detection."
            if active else
            "Inactive: requires xgboost and a trained model file. "
            "Train with scripts/train_mileage_xgb.py on a labelled CSV."
        ),
    }


def build_features(readings: list[dict]) -> list[dict]:
    """Turn ordered readings into one feature row per reading (first has delta=0)."""
    ordered = sorted(readings, key=lambda r: str(r.get("date") or ""))
    rows: list[dict] = []
    prev_km = None
    for r in ordered:
        km = r.get("km")
        if not isinstance(km, (int, float)):
            continue
        year = int(str(r.get("date") or "0")[:4] or 0)
        delta = 0 if prev_km is None else int(km) - int(prev_km)
        age = max(0, 2026 - year) if year else 0
        rows.append({
            "year": year, "km": int(km), "delta": delta, "age_years": age,
            "km_per_year": int(int(km) / age) if age else 0,
        })
        prev_km = km
    return rows


def train(csv_path: str | Path, label_col: str = "label",
          model_path: Path = MODEL_PATH, dataset_label: str = "unknown") -> dict:
    if not _installed():
        raise NotConfigured("xgboost is not installed. `pip install xgboost` first.")
    import xgboost as xgb  # type: ignore
    from sklearn.metrics import precision_recall_fscore_support  # type: ignore
    from sklearn.model_selection import train_test_split  # type: ignore

    rows: list[dict] = []
    with Path(csv_path).open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            rows.append(row)
    if len(rows) < 20:
        raise ValueError("At least 20 labelled rows are required to train responsibly.")
    missing = [c for c in FEATURES + [label_col] if c not in rows[0]]
    if missing:
        raise ValueError(f"CSV is missing columns: {missing}")

    X = [[float(r[c]) for c in FEATURES] for r in rows]
    y = [int(float(r[label_col])) for r in rows]
    # Stratify only when both classes have at least two samples; otherwise
    # scikit-learn raises and a tiny demo corpus could never be trained.
    counts = Counter(y)
    strat = y if len(counts) > 1 and min(counts.values()) >= 2 else None
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=strat
    )
    model = xgb.XGBClassifier(
        n_estimators=200, max_depth=4, learning_rate=0.08,
        subsample=0.9, colsample_bytree=0.9, eval_metric="logloss",
        random_state=42,
    )
    model.fit(X_train, y_train)
    preds = model.predict(X_test)
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_test, preds, average="binary", zero_division=0
    )
    model_path.parent.mkdir(parents=True, exist_ok=True)
    model.save_model(str(model_path))
    result = {
        "trained": True, "rows": len(rows), "positives": int(sum(y)), "features": FEATURES,
        "precision": round(float(precision), 4), "recall": round(float(recall), 4),
        "f1": round(float(f1), 4), "model_path": str(model_path),
        "dataset_label": dataset_label, "version": MODEL_VERSION,
        "warning": "Metrics are on a hold-out split; validate on a larger, real corpus before production.",
    }
    meta_path = Path(model_path).with_suffix(".meta.json")
    meta_path.write_text(json.dumps({
        **{k: result[k] for k in ("rows", "positives", "features", "precision",
                                  "recall", "f1", "dataset_label", "version", "warning")},
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }, indent=2), encoding="utf-8")
    return result


def predict(features: list[dict]) -> dict:
    if not (_installed() and MODEL_PATH.is_file()):
        raise NotConfigured(status()["reason"])
    import xgboost as xgb  # type: ignore
    model = xgb.XGBClassifier()
    model.load_model(str(MODEL_PATH))
    matrix = [[float(row.get(c, 0)) for c in FEATURES] for row in features]
    probs = model.predict_proba(matrix)[:, 1] if matrix else []
    return {
        "method": "xgboost", "version": MODEL_VERSION,
        "probabilities": [round(float(p), 4) for p in probs],
        "note": "A probability is a lead for human review, not proof of odometer fraud.",
    }
