# TrustDrive — Seller Feature Test Report

**Date:** 2026-11-07 · **Accounts:** `samarth@trustdrive.dev` (`u-seller`), second seller `weduo@trustdrive.dev` (`u-seller2`), password `demo1234`
**Method:** real Chromium form login + real UI actions + direct API/SQL read-back. No injected session, no mock response, no direct DB write to fake a pass.

## 1. Seller feature results

| # | Feature | Test performed | Observed | Status |
|---:|---|---|---|---|
| 1 | Seller login | Real form submit | 200, `/seller`, session row | PASS |
| 2 | Dashboard KPIs | Loaded `/seller`; compared API aggregates with DB | Real vehicle/listing/inquiry counts; no hardcoded production stats | PASS |
| 3 | Add vehicle wizard | Created all six categories through the UI | 201 + `vehicles` row + draft listing; survives refresh | PASS 6/6 |
| 4 | Category-specific fields | Petrol vs EV vs 2W vs car | Engine CC/engine no. hidden for EVs; battery SOH/motor shown; frame vs VIN labels correct | PASS |
| 5 | Validation | Duplicate registration, 10-char frame on car, malformed reg | 409 duplicate; 400 car VIN; 400 malformed; no bad row | PASS |
| 6 | My vehicles | Opened list after create and refresh | All created vehicles present | PASS |
| 7 | Edit vehicle | Changed permitted details; refreshed | Values persisted; ownership enforced | PASS |
| 8 | Archive vehicle | Soft archive route exercised | Record retained for audit; not hard-deleted | PASS (suite/prior live) |
| 9 | Document upload | Real RC image upload | 201, private file stored, document row, SHA-256 | PASS |
| 10 | File validation | Unsupported text, corrupt PDF, blank image, duplicate | 415/no row; `needs_correction`; low confidence; `duplicate_of` | PASS 10/10 |
| 11 | OCR extraction | Real RapidOCR run | `rapidocr-onnx-crnn`, confidence 0.778, 8 fields, registration/VIN match | PASS |
| 12 | OCR display | Refresh documents page | Engine, method, confidence, parsed fields visible | PASS |
| 13 | Document consent | Toggle share; buyer read-back | Buyer sees only consented metadata; 0 unconsented | PASS |
| 14 | Replace/reverify | Version/reverify routes | New version linked; history retained | PASS (suite) |
| 15 | Vehicle history | Timeline page + event API | Events render; event records in DB | PASS (page/API) |
| 16 | Mileage timeline | 52,000 → 41,000 km | `flagged:true`, `ODOMETER_ROLLBACK`, 40 points, UI finding | PASS |
| 17 | AI investigation | Run from Fraud UI | Python LangGraph, 15 nodes, 2 findings/6 citations, human review | PASS |
| 18 | Verification center | Open page/run checks | Checks honest; unavailable providers labelled; no fake government verification | PASS |
| 19 | Damage records | Add damage | 201, `damage_records` row, component `front_bumper` | PASS |
| 20 | Damage correction | Correction route | Audited correction, original retained | PASS (suite) |
| 21 | 3D viewer — car | Open car with damage | Real GLB loads; damage hotspot opens DB record | PASS |
| 22 | 3D viewer — 2W | Open scooter/motorcycle | Labelled schematic; no car GLB; interactions disabled | PASS 4/4 |
| 23 | Create listing | Listing form | Draft listing created | PASS |
| 24 | Listing photos | 3 real PNGs | 201, `listing_images` ×3 | PASS |
| 25 | Publish gate | Bare draft, then satisfied draft | 422 `PUBLISH_BLOCKED` → 200 `published` | PASS 6/6 |
| 26 | Edit listing | Update price/description | Persisted and visible to buyer | PASS |
| 27 | Pause / resume / mark sold | Listing action route | Status transitions persisted | PASS (suite/API) |
| 28 | Seller inbox | Open inquiry from buyer | Buyer message rendered | PASS |
| 29 | Seller reply | Send reply | 201, buyer thread shows 2 messages | PASS |
| 30 | Inquiry status | Update status | Persisted (`replied`) | PASS |
| 31 | Reports | Seller reports page + generated report | Report list; generated PDF downloadable | PASS |
| 32 | Notifications | Open list / mark read | DB-backed; read state persists | PASS (suite/page) |
| 33 | Settings/profile | Open settings; profile API | User-scoped fields; no secret exposure | PASS (suite/page) |
| 34 | RBAC — seller A vs B | Seller A reads/mutates Seller B vehicle | 404/403; own vehicle 200 | PASS |
| 35 | Seller → admin boundary | Direct `/admin` navigation | Redirect to login for non-admin | PASS |

## 2. Six-category proof

| Category | Draft | Publish gate | RC/OCR | Investigation | Published |
|---|---|---|---|---|---|
| Petrol motorcycle | PASS | 422→200 | 0.786, 9 fields | 15 nodes | PASS |
| Petrol scooter | PASS | 422→200 | 0.785, 9 fields | 15 nodes | PASS |
| Electric scooter | PASS | 422→200 | 0.779, 9 fields | 16 nodes + EV node | PASS |
| Electric motorcycle | PASS | 422→200 | 0.787, 9 fields | 16 nodes + EV node | PASS |
| Petrol car | PASS | 422→200 | 0.778, 8 fields | 15 nodes | PASS |
| Electric car | PASS | 422→200 | 0.776, 8 fields | 16 nodes + EV node | PASS |

Evidence: `qa/live-e2e-summary.json` (272/272), `SCREENSHOTS/cat-*-step0.png`, `cat-*-investigation.png`, `cat-*-published.png`.

## 3. Focused seller proof (`MW5ATBQ1`)

| Feature | Checks | Result | Evidence |
|---|---:|---|---|
| RC upload + OCR | 11 | PASS | `SCREENSHOTS/feat1-rc-ocr.png` |
| Mileage rollback | 6 | PASS | `SCREENSHOTS/feat2-mileage-rollback.png` |
| AI investigation | 9 | PASS | `SCREENSHOTS/feat3-ai-investigation.png` |
| Damage record | 4 | PASS | `SCREENSHOTS/feat4-damage-record.png` |
| Marketplace publish/3D | 9 | PASS | `SCREENSHOTS/feat5-marketplace-3d.png` |
| Seller inbox reply | 10 | PASS | `SCREENSHOTS/feat6-seller-inbox-reply.png` |

## 4. Seller limitations

- **Archive** is a soft delete; records remain for audit. That is intended, not a missing delete.
- **Replace/reverify, pause/resume/mark sold, settings and notifications** were covered by suite/API and page sweeps, not re-driven end-to-end in the final focused run. They are not claimed as full live E2E proof.
- **External verification** (government/insurer/theft) is unavailable and labelled as such; the seller UI never shows a clean external check.
- **YOLO photo damage** is not active; damage records are human-entered.

**Seller verdict: PASS for all core seller workflows; 0 failed checks.**
