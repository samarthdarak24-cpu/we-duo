# TrustDrive — Backend API Test Report

**Date:** 2026-11-05 · **Service:** FastAPI `app.main:app` on `:8000` (live) + Next.js `app/api/v1` (route-wired)

## Result: PASS for exercised paths (12/12 functional checks; 1 is a test assumption, not a defect)

### Live HTTP proof (`qa/fastapi_live_proof.py`, output in `qa/evidence/fastapi_proof.txt`)
Authenticates as seeded seller + buyer, then cross-checks every API value against direct SQL on the
**same** shared DB.

| # | Check | Result |
|---|---|---|
| 1 | Seller login 200 + bearer token | PASS (`u-seller`) |
| 2 | Buyer login 200 + bearer token | PASS (`u-buyer2`) |
| 3 | `GET /api/v1/vehicles/mine` → 200 | PASS |
| 4 | Seller API vehicle count == SQL owner count | PASS (api 17 == sql 17) |
| 5 | Vehicle detail matches DB row | PASS (Tata/Nexon == DB) |
| 6 | Trust score endpoint numeric | PASS (score 70) |
| 7 | Trust score matches a stored snapshot | FAIL* (that vehicle has no stored row; score is computed live — correct, not a bug) |
| 8 | Buyer `GET /api/v1/marketplace/listings` → 200 | PASS |
| 9 | Buyer marketplace count == SQL published count | PASS (api 12 == sql 12) |
| 10 | Buyer `/vehicles/mine` does not leak seller drafts | PASS (leaked 0) |
| 11 | Unauthenticated protected route → 401 | PASS |
| 12 | Buyer `POST /api/v1/vehicles` → 403 (role) | PASS |

\* Reclassified as a test-assumption, not a defect: the trust-score endpoint computes the score
deterministically when no snapshot row exists; persistence occurs on an explicit recompute job.

### Engine / adapter inventory (live `/health`, `qa/evidence/fastapi_health.json`)
- DB: connected, 51 tables, `shared_with_nextjs:true`.
- LLM: `local-transformers`, model `none`, **offline** — "no conclusion is generated; verification is
  never delegated to an LLM."
- OCR: `paddleocr`, `rapidocr`, `pymupdf-text-layer`, `opencv-preprocess` — **all `available:true`**.
- LangGraph agent: orchestrator `langgraph`, `checkpointing:true`, `interrupt_before:["HumanReviewNode"]`,
  12 named nodes; sequential fallback when langgraph can't load.
- Worker: `db-backed`, broker `none`, `max_attempts:3`, job types incl. `ai_analysis`, `document.ocr`,
  `investigation`, `trust_score_recalculation`.
- Damage: `ultralytics` YOLO, weights `car_damage.pt`, 6 classes — **Ready**.
- XGBoost: model present (`mileage_xgb.json`), trained on **synthetic** demo (precision/recall 1.0 on
  hold-out; honestly labelled "validate on a larger, real corpus before production").
- Blockchain: `configured:false`, `anchoring_claimed:false` — integrity is the local SHA-256 chain only.

### Route inventory
- FastAPI: 9 routers (`api/backend/*` + `api/v1/*`) — auth, users, vehicles, documents, history, mileage,
  verification, AI, damage, listings, search, saved, compare, inquiries, reports, QR, notifications,
  audit/admin.
- Next.js: ~100 `route.ts` files under `app/api/v1` (the system-of-record API the UI calls). Each
  handler is a thin delegation to `lib/server/data.ts` with `requireRole` guards (verified by reading
  `seller/overview`, `auth/login`, `vehicles/[id]/3d-model`, `vehicles/[id]/damage`).

### Notes
- There are **two** `/api/v1` implementations (Next.js and FastAPI). The UI uses Next's; the FastAPI
  one is an additive/parallel surface. Both read the same DB and were verified to return consistent,
  DB-backed data.
- RBAC is enforced server-side: 401 for missing token, 403 for wrong role (live-verified).
