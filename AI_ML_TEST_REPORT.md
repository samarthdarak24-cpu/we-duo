# TrustDrive — AI / ML Test Report

**Date:** 2026-11-05 · **Result: PASS (adapters active; honest about synthetic/training data)**

## What is actually active (live `/health`)
- **XGBoost** (mileage anomaly): `model_exists:true`, `mileage_xgb.json` present, features
  `[year, km, delta, age_years, km_per_year]`. Trained on **synthetic-demo** data
  (precision/recall/f1 = 1.0 on hold-out). Honest warning: "validate on a larger, real corpus before
  production." → not a production fraud classifier.
- **YOLO / Ultralytics** (damage detection): weights `car_damage.pt`, classes
  `[dent, scratch, crack, shattered_glass, broken_lamp, flat_tire]` — Ready.
- **Deterministic detectors** (odometer rollback, duplicate invoice, VIN/reg mismatch, accident/
  insurance inconsistency, missing history) — rule-based, versioned.
- **LLM**: `local-transformers`, model `none`, **offline** — "no conclusion is generated; verification
  is never delegated to an LLM." Findings never invent evidence.
- Every finding carries: detected issue, evidence IDs, method/rule version, risk level, explanation,
  recommended action, review status.

## Test coverage
- Pytest: detectors, explainability, model adapters (YOLO, XGBoost), investigator agent.
- Vitest: `engine.test.ts` (12 tests), `vehicle-3d-inspection`, `ai-assistant-wiring`.

## Honest limitations
- No labelled fraud corpus → no supervised classifier fitted (by design).
- LLM offline by config (`TD_LLM_MODEL=none`) → AI answers are evidence-only, never invented.
- XGBoost metric is on synthetic hold-out; explicitly not production-grade.
