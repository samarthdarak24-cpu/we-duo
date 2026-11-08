# TrustDrive — Buyer Test Report

**Date:** 2026-11-05 · **Role:** Buyer · **Result: PASS for data/API layer; UI visual blocked (env)**

## Verified this pass
| Buyer feature | Evidence | Status |
|---|---|---|
| Login | `POST /api/v1/auth/login` → JWT (`u-buyer2`) | ✅ |
| Explore / marketplace | `GET /api/v1/marketplace/listings` → 12 == SQL published 12 | ✅ |
| Search & filters | `marketplace.browse(brand, price_min/max, verified_only, sort)` | ✅ (params) |
| Vehicle details | `GET /api/v1/marketplace/listings/{id}` + `vehicles/{id}` | ✅ |
| Verification lookup | `GET /api/v1/verification/lookup`, `vehicles/{id}/verification` | ✅ |
| History timeline | `GET /api/v1/vehicles/{id}/history` (28 events) | ✅ |
| 3D inspection | real GLB + DB hotspots; buyer mode | ✅ |
| Mileage analysis | `GET /api/v1/vehicles/{id}/mileage` (38 readings) | ✅ |
| AI risk summary | `GET /api/v1/vehicles/{id}/risk` + `findings` | ✅ |
| Theft verification | `GET /api/v1/vehicles/{id}/theft` (demo provider; UNAVAILABLE when unconfigured) | ⚙️ |
| Accident/damage | `GET /api/v1/vehicles/{id}/damage` (14 records) | ✅ |
| Market price est | `GET /api/v1/vehicles/{id}/pricing` | ✅ (computed) |
| Compare (2–4) | `POST /api/v1/compare` | ✅ (Vitest) |
| Saved / wishlist | `GET/POST /api/v1/saved` (3 seeded) | ✅ |
| Inquiries / contact | `POST /api/v1/inquiries` | ✅ (data-layer) |
| Reports / QR | `reports/vehicle/{id}`, `verify/{token}` | ⚙️ |
| Profile / notifications | `GET /api/v1/notifications` | ✅ |

## Not executed this pass (environment)
- Live browser UI and visual checks (Next.js server not resident; Playwright not installed).

## Honest gaps
- External theft/registry providers are demo; "no record" is labelled `UNAVAILABLE`, never "theft-free".
- Trust score may be computed live for some vehicles.
