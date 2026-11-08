#!/usr/bin/env python
"""Build a mileage training CSV.

Two modes:
  --synthetic N   (default) balanced, clearly SYNTHETIC rows for adapter demos.
  --from-db       weakly-labelled rows from the shared DB (rules as labels).

Neither mode is confirmed fraud data. The synthetic set exists so the XGBoost
adapter can be trained and evaluated end-to-end; it is NOT used by the findings
engine and must be replaced with a real labelled corpus for production.
"""
from __future__ import annotations

import argparse
import csv
import random
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / ".data" / "trustdrive.db"
DEFAULT_OUT = ROOT / "services" / "ai" / "shared" / "data" / "mileage_training.csv"


def synthetic_rows(n: int, seed: int = 42) -> list[dict]:
    rng = random.Random(seed)
    rows: list[dict] = []
    for i in range(n):
        age = rng.randint(1, 12)
        year = 2026 - age
        positive = i % 2 == 1
        if positive:
            pattern = rng.choice(["rollback", "jump", "high_usage"])
            if pattern == "rollback":
                km_per_year = rng.randint(5_000, 25_000)
                delta = -rng.randint(5_000, 60_000)
            elif pattern == "jump":
                km_per_year = rng.randint(5_000, 25_000)
                delta = rng.randint(55_000, 120_000)
            else:
                km_per_year = rng.randint(55_000, 120_000)
                delta = km_per_year + rng.randint(-2_000, 2_000)
        else:
            km_per_year = rng.randint(5_000, 25_000)
            delta = km_per_year + rng.randint(-2_000, 2_000)
        km = max(0, age * km_per_year + rng.randint(-3_000, 3_000))
        rows.append({
            "year": year, "km": km, "delta": delta, "age_years": age,
            "km_per_year": km_per_year, "label": 1 if positive else 0,
        })
    return rows


def db_rows() -> list[dict]:
    if not DB.is_file():
        raise SystemExit(f"Database not found: {DB}")
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    rows: list[dict] = []
    for v in conn.execute("SELECT id FROM vehicles"):
        readings = [dict(r) for r in conn.execute(
            "SELECT km, date FROM mileage_readings WHERE vehicle_id = ? ORDER BY date", (v["id"],)
        )]
        prev = None
        for r in readings:
            km = r.get("km")
            if not isinstance(km, (int, float)):
                continue
            date = str(r.get("date") or "")
            year = int(date[:4]) if date[:4].isdigit() else 0
            delta = 0 if prev is None else int(km) - int(prev)
            age = max(0, 2026 - year) if year else 0
            kmpy = int(int(km) / age) if age else 0
            label = 1 if (delta < 0 or delta > 50_000 or (age and int(km) / age > 50_000)) else 0
            rows.append({"year": year, "km": int(km), "delta": delta,
                         "age_years": age, "km_per_year": kmpy, "label": label})
            prev = km
    conn.close()
    return rows


def write(rows: list[dict], out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=["year", "km", "delta", "age_years", "km_per_year", "label"])
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--synthetic", type=int, default=600, help="number of synthetic rows")
    ap.add_argument("--from-db", action="store_true", help="use weakly-labelled DB rows")
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    args = ap.parse_args()

    rows = db_rows() if args.from_db else synthetic_rows(args.synthetic)
    out = Path(args.out)
    write(rows, out)
    positives = sum(r["label"] for r in rows)
    source = "weakly-labelled DB rows (rules as labels)" if args.from_db else "SYNTHETIC (demo)"
    print(f"wrote {len(rows)} rows to {out}")
    print(f"source: {source}; positives={positives}, negatives={len(rows) - positives}")
    if not args.from_db:
        print("WARNING: synthetic rows are for adapter demonstration only, not production fraud data.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
