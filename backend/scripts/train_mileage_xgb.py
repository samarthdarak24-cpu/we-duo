#!/usr/bin/env python
"""Train the optional XGBoost mileage model on a labelled CSV.

CSV columns: year, km, delta, age_years, km_per_year, label (1 = confirmed fraud).
Requires `pip install xgboost scikit-learn`. Prints precision/recall/F1 and saves
`models/mileage_xgb.json`. Without a labelled corpus this is intentionally not run.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.intelligence.mileage import xgboost_adapter  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("csv", help="labelled CSV path")
    ap.add_argument("--label", default="label")
    ap.add_argument("--out", default=str(xgboost_adapter.MODEL_PATH))
    ap.add_argument("--dataset-label", default="unknown",
                    help="provenance label, e.g. synthetic-demo or real-labelled")
    args = ap.parse_args()

    if not xgboost_adapter._installed():
        print("xgboost is not installed. Run: python -m pip install xgboost scikit-learn",
              file=sys.stderr)
        return 1
    result = xgboost_adapter.train(args.csv, label_col=args.label,
                                   model_path=Path(args.out),
                                   dataset_label=args.dataset_label)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
