# TrustDrive — Seller Test Report

**Date:** 2026-11-05 · **Role:** Seller · **Result: PASS for data/API layer; UI visual blocked (env)**

## Verified this pass
| Seller feature | Evidence | Status |
|---|---|---|
| Login & session | `POST /api/v1/auth/login` → cookie/JWT | ✅ |
| Dashboard overview KPIs | `getSellerOverview` derived from `getSellerStats`/`getVehiclesByOwner`; route passes real `guard.user.sub` | ✅ (no hardcoded stats) |
| My vehicles | `GET /api/v1/seller/vehicles` → 17 rows for `u-seller` == SQL 17 | ✅ |
| Add vehicle (draft) | `createVehicleDraft` (Vitest 15-step workflow) | ✅ |
| Duplicate VIN/reg rejection | `DUPLICATE_VIN`/`DUPLICATE_REG` (Vitest) | ✅ |
| Vehicle detail / edit | `GET /api/v1/vehicles/{id}` matches DB | ✅ |
| Documents + OCR | engines installed/available (`/health`); `documents` 83 rows seeded | ⚙️ (OCR run via pytest) |
| Verification center | `GET /api/v1/vehicles/{id}/verification` | ✅ |
| AI fraud analysis | `GET /api/v1/vehicles/{id}/findings` (15 seeded) | ✅ |
| 3D inspection | real GLB + DB hotspots (see THREEJS_TEST_REPORT) | ✅ |
| Marketplace listing | `GET /api/v1/marketplace/listings` 12 == SQL 12 | ✅ |
| Listing action bar (8 actions) | `ListingActionBar.tsx` + RTL test (5 tests pass) | ✅ |
| Inquiries (receive/reply) | `GET/POST /api/v1/inquiries` | ✅ (data-layer) |
| Reports / PDF / QR | `reports/[id]/download`, `verify/{token}` | ⚙️ (server-side) |
| Notifications / settings | `GET /api/v1/notifications` (19 seeded) | ✅ |

## Not executed this pass (environment)
- **Live browser UI** (pages rendering, button clicks, forms) — Next.js server not resident in this
  sandbox; Playwright browsers not installed.
- **Visual confirmation** of dashboard layout/charts — see VISUAL_REGRESSION_REPORT.

## Honest gaps
- Trust score for some vehicles is computed live (persistence on recompute job).
- Test suite binds to the real DB (data-safety risk) — see BUGS_FOUND.md.
