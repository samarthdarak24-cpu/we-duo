#!/usr/bin/env python
"""Rigorous XGBoost evaluation on the synthetic demo dataset.

Reports precision, recall, F1, ROC-AUC, confusion matrix, stratified
5-fold cross-validation and feature importance. Synthetic patterns are
deliberately separable, so high scores here are a property of the demo
data — NOT evidence of production fraud-detection accuracy.
"""
from __future__ import annotations

import csv
import json
from pathlib import Path

from sklearn.metrics import (
    confusion_matrix, precision_recall_fscore_support, roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split

import xgboost as xgb

ROOT = Path(__file__).resolve().parents[2]  # backend/scripts/ -> repo root
CSV = ROOT / "services" / "ai" / "shared" / "data" / "mileage_training.csv"
MODEL = ROOT / "services" / "ai" / "shared" / "models" / "mileage_xgb.json"
FEATURES = ["year", "km", "delta", "age_years", "km_per_year"]


def load():
    rows = []
    with CSV.open(newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            rows.append(row)
    X = [[float(r[c]) for c in FEATURES] for r in rows]
    y = [int(float(r["label"])) for r in rows]
    return X, y


def main() -> None:
    X, y = load()
    model = xgb.XGBClassifier()
    model.load_model(str(MODEL))

    # Hold-out (the same split the training script used: random_state=42, 25%)
    from sklearn.model_selection import train_test_split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=y
    )
    probs = model.predict_proba(X_test)[:, 1]
    preds = (probs >= 0.5).astype(int)

    precision, recall, f1, _ = precision_recall_fscore_support(
        y_test, preds, average="binary", zero_division=0
    )
    tn, fp, fn, tp = confusion_matrix(y_test, preds).ravel()
    auc = roc_auc_score(y_test, probs)

    # Stratified 5-fold cross-validation for stability
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_f1 = cross_val_score(model, X, y, cv=cv, scoring="f1")
    cv_auc = cross_val_score(model, X, y, cv=cv, scoring="roc_auc")

    report = {
        "dataset": str(CSV),
        "dataset_label": "synthetic-demo-600",
        "model": str(MODEL),
        "features": FEATURES,
        "rows": len(X),
        "positives": int(sum(y)),
        "negatives": int(len(y) - sum(y)),
        "hold_out": {
            "precision": round(float(precision), 4),
            "recall": round(float(recall), 4),
            "f1": round(float(f1), 4),
            "roc_auc": round(float(auc), 4),
            "tp": int(tp), "tn": int(tn), "fp": int(fp), "fn": int(fn),
        },
        "cross_validation_5fold": {
            "f1_mean": round(float(cv_f1.mean()), 4),
            "f1_std": round(float(cv_f1.std()), 4),
            "roc_auc_mean": round(float(cv_auc.mean()), 4),
            "roc_auc_std": round(float(cv_auc.std()), 4),
        },
        "feature_importance": {
            FEATURES[int(k[1:])]: round(float(v), 4)
            for k, v in model.get_booster().get_score(importance_type="gain").items()
        },
        "status": "EXPERIMENTAL",
        "disclaimer": (
            "Synthetic, perfectly-separable demo data. High scores here do not "
            "generalise to real-world odometer fraud. Retain deterministic "
            "mileage checks as the active functionality."
        ),
    }
    out = ROOT / "services" / "ai" / "shared" / "models" / "mileage_xgb.eval.json"
    out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
