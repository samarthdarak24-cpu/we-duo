# TrustDrive — Buyer Feature Test Report

**Date:** 2026-11-07 · **Accounts:** `rohan@trustdrive.dev` (`u-buyer2`), other buyer `aditya@trustdrive.dev` (`u-buyer`), password `demo1234`
**Method:** real Chromium login, real marketplace actions, real inquiry/report flows, direct API + SQL read-back.

## 1. Buyer feature results

| # | Feature | Test performed | Observed | Status |
|---:|---|---|---|---|
| 1 | Buyer login | Real form submit | 200 → `/buyer`, session row | PASS |
| 2 | Buyer dashboard | Load `/buyer`; compare with DB | Saved/inquiry/recommended values are DB-backed | PASS |
| 3 | Explore marketplace | Load `/buyer/explore` | Published listings only; cards render trust/category | PASS |
| 4 | Category filter | Filter each of 6 categories | Correct category set returned; no planned categories | PASS 6/6 |
| 5 | Search | Search registration `MH12QA7132`, VIN, TrustDrive ID | Matching listing returned; SQL metacharacters safe | PASS |
| 6 | Make/model/fuel/price/year/km/location/ownership filters | Combined filters through UI/API | Filtered results match DB | PASS (68-check group) |
| 7 | Sorting/pagination | Sort by price/mileage/trust/newest | Correct ordering; page slices correct | PASS |
| 8 | Empty results | No-match search | Honest empty state, no fake cards | PASS |
| 9 | Vehicle detail | Open all six category listings | Correct make/model/year/price/category; seller info | PASS 6/6 |
| 10 | Vehicle History Passport | Open passport/history | Timeline from DB; missing data shown as missing | PASS (page/API) |
| 11 | Trust score | Buyer detail KPI | Deterministic score + evidence coverage + open findings | PASS |
| 12 | AI findings visible to buyer | Open buyer detail | Permitted findings/evidence only; no private raw documents | PASS |
| 13 | 3D viewer — car | Open car listing, click hotspot | Real GLB; DB damage hotspot opens matching detail | PASS |
| 14 | 3D viewer — 2W | Open scooter/motorcycle | Labelled schematic; no car GLB; interactions disabled | PASS 4/4 |
| 15 | Save vehicle | Save button + refresh | Saved row persists; appears in `/buyer/saved` | PASS (suite/page) |
| 16 | Remove saved vehicle | Remove + refresh | Row removed; UI updates | PASS (suite) |
| 17 | Compare | Add two vehicles, open compare | Comparison values from DB; missing specs shown honestly | PASS (suite/page) |
| 18 | Saved searches | Save search | Row in `saved_searches` | PASS (suite) |
| 19 | Contact seller | Submit inquiry from listing | 201, `inquiries` row, seller inbox receives it | PASS |
| 20 | Test-drive / inspection request | Inquiry type/request | Request stored with type; seller sees it | PASS (suite/API) |
| 21 | Buyer inquiry thread | Open thread after seller reply | 2 messages, seller reply visible | PASS |
| 22 | PDF report | Generate + download | 201, `reports.status=ready`, real `%PDF` (45,266 bytes) | PASS |
| 23 | Verification lookup | Lookup/verify page | DB-backed result; token revocation path present | PASS (suite/page) |
| 24 | Notifications | Open list / mark read | DB-backed notifications; read state | PASS (suite/page) |
| 25 | Buyer settings | Open settings/profile | User-scoped data; no secret exposure | PASS (suite/page) |
| 26 | Buyer cannot access seller API | Direct API calls | 403 on create/publish/seller data; 401 anonymous | PASS |
| 27 | Buyer B cannot read Buyer A inquiry | Cross-buyer request | 403 | PASS |
| 28 | Private documents | Request unconsented/raw document | 403; consented metadata only | PASS |

## 2. Six-category buyer proof

| Category | Buyer detail | 3D asset | Marketplace filter | Result |
|---|---|---|---|---|
| Petrol motorcycle | PASS | labelled schematic | PASS | PASS |
| Petrol scooter | PASS | labelled schematic | PASS | PASS |
| Electric scooter | PASS | labelled schematic | PASS | PASS |
| Electric motorcycle | PASS | labelled schematic | PASS | PASS |
| Petrol car | PASS | real GLB + DB hotspot | PASS | PASS |
| Electric car | PASS | real GLB | PASS | PASS |

Evidence: `SCREENSHOTS/buyer-*-detail.png`, `buyer-car-3d-hotspot.png`, `verify-passenger_car-glb.png`, `verify-electric_scooter-schematic.png`, `qa/live-e2e-summary.json`.

## 3. Focused buyer proof (`MW5ATBQ1`)

| Check | Result |
|---|---|
| Published vehicle appears in buyer marketplace search by registration | PASS |
| Buyer vehicle page renders the listing | PASS |
| 3D viewer lists the recorded defect | PASS |
| Hotspot exists for the stored damage | PASS |
| Hotspot opens the matching damage detail | PASS |
| Contact form opens from the listing | PASS |
| Buyer inquiry persists with message | PASS |
| Buyer receives seller reply (2 messages) | PASS |
| PDF report generated and downloads as real PDF | PASS |

## 4. Buyer limitations

- **Saved/compare/saved-search actions** are implemented and suite-covered; the final focused run did not re-drive every click. They are labelled suite/page-level, not full live E2E.
- **Verification lookup** cannot claim government/insurer verification; it shows TrustDrive-issued and consent-gated records only.
- **AI findings** are buyer-visible only when permitted; raw private documents remain owner/admin-only.
- **Missing evidence** is displayed as unverified coverage, never as proof of fraud.

**Buyer verdict: PASS for all core buyer journeys; 0 failed checks.**
