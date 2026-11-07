# TrustDrive — Feature-by-Feature Audit

**Audit date:** 2026-11-08 · **Final evidence snapshot:** 2026-11-08 (final corrective retest)
**Runtimes tested:** Next.js 14 (`frontend/`, :3000) + FastAPI intelligence service (`backend/`, :8000) + one shared SQLite database (`.data/trustdrive.db`, 55 tables, schema v3).

**Evidence sources**

| Source | Result | Artefact |
|---|---|---|
| Broad live run `LIVE-MW6DOO1A` | **272 / 272 checks PASS**, 6/6 categories | `qa/live-e2e-summary.json`, `qa/live_e2e.log`, `SCREENSHOTS/` |
| Focused live run `MW5ATBQ1` | **49 / 49 checks PASS** across six connected features | `qa/live-browser/six_features_results.json`, `SCREENSHOTS/feat*.png` |
| OCR negative paths | **10 / 10 PASS** | `qa/live-browser/ocr_negative_results.json`, `SCREENSHOTS/ocr-negative.png` |
| Focused RBAC / consent | **13 / 13 PASS** | `qa/live-browser/security_results.json` |
| Independent auth / pages / responsive / persistence | Auth 13/13, pages 40/40, responsive 44/44, persistence 7/7 | `qa/indep-results-full-pass1.json`, `qa/indep-results-retest2.json`, `qa/indep-pages.json`, `qa/indep-responsive.json` |
| Independent security + API probe | Security 10/10, API 15/15 | `qa/indep-results.json`, `qa/indep-api.json` |
| Frontend tests | **187 / 187 passed** (15 files, isolated fresh seeded DB) | `npm test` |
| Backend tests | **127 / 127 passed** (includes durable checkpoint) | `npm run intel:test` |
| TypeScript / production build | 0 errors / 52 pages, 109 API routes | `npx tsc --noEmit`, `NEXT_DIST_DIR=.next_verify npm run build` |
| Final corrective live retest (2026-11-08) | Signed link 200 `%PDF` 45,266 B anonymously; tampered link 403 `DOWNLOAD_LINK_INVALID`; invalid report type 400 / missing vehicle 404 / valid 201; 13th rapid login 429 `Retry-After: 43`; LangGraph investigation wrote 15 checkpoints / 96 writes | live HTTP + `.data/langgraph-checkpoints.db` read-back |

**Status rule:** `PASS` = exercised with an artefact. `PASS` rows 1–39 were exercised through the real browser/API/DB. Rows 40–48 and 59 are implemented and covered by Vitest/Pytest plus a real 200 page sweep (row 59 is additionally verified against the checkpoint tables and `/health`), but were not re-driven through every UI action in this pass; they are labelled “suite/page sweep” in the Live Browser column. `BLOCKED` = an external dependency/credential is missing. `NOT IMPLEMENTED` = deliberately out of scope. No row is marked PASS because an endpoint merely returned 200.

## Summary

| Classification | Count |
|---|---:|
| Features identified | **60** |
| PASS — live browser end-to-end | **39** |
| PASS — suite + browser page sweep | **10** |
| PASS total | **49** |
| FAIL | **0** |
| BLOCKED — missing external configuration / durable infrastructure | **9** |
| NOT IMPLEMENTED — planned only | **2** |

## Feature table

| # | Feature | UI | API | Backend Logic | Database | Live Browser | Result |
|---:|---|---|---|---|---|---|---|
| 1 | Seller real-form login | `#login-email`, `#login-password`, submit | `POST /api/v1/auth/login` → 200 | scrypt + HS256 session | `sessions` row | Real form login → `/seller` | **PASS** |
| 2 | Buyer real-form login | same form | 200 → `/buyer` | role guard | `sessions` row | Real form login → `/buyer` | **PASS** |
| 3 | Role dashboard routing | `/seller`, `/buyer` | server guard | role from `users` | `users.role` | Direct URL denied across roles | **PASS** |
| 4 | Category taxonomy (exactly 6) | 6 wizard options | `/api/v1/categories` | `vehicle-categories.json` + Python profiles | `category_registry_snapshot` | 6/6 category wizard screens | **PASS** |
| 5 | Planned categories not selectable | absent from wizard | not returned as implemented | strict resolver | no planned rows | taxonomy screenshot | **PASS** |
| 6 | Category-driven identity label | “Chassis/frame” vs “VIN (17)” | `validateIdentity()` | category profile | `vehicles.vin` reused per category | step0 screenshots ×6 | **PASS** |
| 7 | No universal 17-char VIN rule | 2W never shows VIN-17 | 10-char frame 201 for 2W, 400 for car | category validator | frame stored as-is | edge checks | **PASS** |
| 8 | Combustion fields (CC, engine no.) | shown on 3 petrol categories | draft body | 15-node profile | `fuel=Petrol`, `specs={}` | step0 ×3 | **PASS** |
| 9 | EV fields (battery, SOH, motor) | shown on 3 EV categories | draft body | 16-node profile + `EVBatteryAnalysisNode` | `specs.battery_soh` | step0 ×3 | **PASS** |
| 10 | EV never asks petrol details | CC/engine hidden | injected petrol keys ignored | category guard | no `engine_cc` in EV specs | edge checks | **PASS** |
| 11 | Battery SOH ≠ odometer | distinct inputs | distinct payload keys | mileage rules | SOH in `vehicle_specs`, km in `vehicles.km_claimed`, 0 battery odometer rows | EV detail | **PASS** |
| 12 | Seller vehicle draft creation | wizard submit | `POST /api/v1/seller/vehicles` → 201 | `createVehicleDraft()` | `vehicles` + `listings` draft | 6/6 creates; refresh persistence | **PASS** |
| 13 | Publish gate — block bare draft | blocked state | 422 `PUBLISH_BLOCKED` | `publishGate()` | draft remains | 6/6 gate checks | **PASS** |
| 14 | 3-photo multipart upload | 3 real files | `POST /vehicles/:id/photos` → 201 | file validation/storage | `listing_images` ×3 | 6/6 | **PASS** |
| 15 | Category-correct RC type | `rc_2w` / `rc` | `POST /vehicles/:id/documents` → 201 | document catalogue | `documents.type` | 6/6 | **PASS** |
| 16 | Real OCR + auto-verification | engine/method/confidence shown | `ocr.engine=rapidocr`, `status=processed` | RapidOCR + PyMuPDF + OpenCV | `documents.extracted`, `document_extractions` | 6/6, confidence 0.776–0.787 | **PASS** |
| 17 | Publish gate — allow when satisfied | published badge | publish → 200 | gate re-evaluated | `listings.status=published` | 6/6 published screenshots | **PASS** |
| 18 | AI investigation from Seller UI | answer rendered | `POST /vehicles/:id/ai-investigations` → 200 | Python agent first | `ai_runs`, `agent_investigations` | 6/6; focused 9/9 | **PASS** |
| 19 | Conditional 15/16-node LangGraph | node timeline | nodes array | `langgraph-conditional` | `ai_runs.graph` | 6/6; 15 combustion / 16 EV | **PASS** |
| 20 | `EVBatteryAnalysisNode` conditional | EV badge | nodes array | EV-only branch | persisted run | 3 EV categories | **PASS** |
| 21 | Honest fallback labelling | source shown | `python-intelligence` vs `next-deterministic-fallback` | deterministic fallback | run row | source asserted | **PASS** |
| 22 | Trust score / findings / evidence coverage | KPI cards | `/trust`, `/findings` | deterministic additive rules | `trust_scores`, `findings` | buyer detail screenshots | **PASS** |
| 23 | Marketplace category filter | category selector | `GET /marketplace/listings?category=` | shared filter | published rows | 6/6 | **PASS** |
| 24 | Marketplace registration search | search box | `GET /marketplace/listings?q=` | `reg_no` / VIN / TrustDrive ID | matching row | 6/6 | **PASS** |
| 25 | Category identity preserved in listing | correct label | `vehicle_category_id` in payload | shared resolver | matches vehicle | 6/6 | **PASS** |
| 26 | Car 3D GLB resolution | studio renders GLB | `3d-model` → 200, `available` | asset manifest | `damage_records` map | `verify-passenger_car-glb.png` | **PASS** |
| 27 | 2W labelled schematic | wireframe + “NO 3D MODEL AVAILABLE” | `status=unavailable`, `url=null` | category asset rule | — | `verify-electric_scooter-schematic.png` | **PASS** |
| 28 | No car GLB for scooters/motorcycles | no sedan geometry | rule text, `license=null` | category asset rule | — | 4× 2W buyer pages | **PASS** |
| 29 | 2W 3D interactions disabled | Exploded/Damage/X-Ray greyed | `interactionsAvailable=false` | category asset rule | — | schematic screenshot | **PASS** |
| 30 | Damage record → 3D hotspot | hotspot button | `POST /vehicles/:id/damage` → 201 | component registry anchor | `damage_records` row | `buyer-car-3d-hotspot.png` | **PASS** |
| 31 | PDF report + signed download | button + download | `POST /reports/vehicle/:id` → 201, download 200 | PDF builder | `reports.status=ready` | 45,266-byte real `%PDF` | **PASS** |
| 32 | Buyer inquiry | contact form | `POST /inquiries` → 201 | ownership checks | `inquiries.status=open` | buyer detail | **PASS** |
| 33 | Seller inbox + reply | inbox + reply box | `POST /inquiries/:id/messages` → 201 | seller ownership | `inquiry_messages` | `seller-inquiry-reply.png` | **PASS** |
| 34 | Buyer reads seller reply | thread | `GET /inquiries/:id` | participant gate | 2 messages | read-back verified | **PASS** |
| 35 | Intelligence service-token auth | — | anonymous 401; token 200 | FastAPI guard | — | direct HTTP | **PASS** |
| 36 | `/health` service introspection | — | `GET /health` → 200 | 16-node registry, shared SQLite, OCR backends | 55 tables | live JSON | **PASS** |
| 37 | RBAC boundary enforcement | seller `/admin` redirect | buyer→seller 403; create/publish 403 | `requireRole()` + ownership | roles/ownership joins | focused 13/13 + independent 10/10 | **PASS** |
| 38 | Duplicate registration detection | — | 409 `DUPLICATE_REG` + `existingId` | duplicate guard | unique `reg_no` | edge checks | **PASS** |
| 39 | Malformed / injection-style registration | — | 400 `VALIDATION_FAILED` | validator | no row created | edge checks | **PASS** |
| 40 | Document completeness / reverify / replace | panels | routes exist | OCR re-run path | `document_extractions` | Suite; page sweep 200 | **PASS** |
| 41 | Vehicle passport / evidence graph / chain | components | routes exist | evidence graph service | `evidence_nodes`, `evidence_edges`, `chain_records` | Suite; page sweep 200; detail shows “Hash chain intact” | **PASS** |
| 42 | Saved vehicles / comparisons / saved searches | buyer components | `/saved`, `/compare`, `/saved-searches` | user-scoped reads/writes | `saved_vehicles`, `saved_comparisons`, `saved_searches` | Suite; page sweep 200 | **PASS** |
| 43 | Notifications / alerts / newsletter | notification components | `/notifications`, `/alerts/evaluate`, `/newsletter` | notification service | `notifications`, `activity` | Suite; page sweep 200 | **PASS** |
| 44 | Admin KYC / disputes / audit / queue | admin components | `/admin/*` routes | admin RBAC | `disputes`, `audit_logs`, `verification_cases` | Suite; page sweep 200 | **PASS** |
| 45 | 2FA / sessions / password reset / KYC | account components | `/me/2fa`, `/me/sessions`, auth routes | auth service | `auth_tokens`, `sessions` | Suite; page sweep 200 | **PASS** |
| 46 | Rate limiting / idempotency / audit log | — | middleware + `Idempotency-Key` | shared DB sliding window + memory fallback | `rate_limit_hits`, `idempotency_keys`, `audit_logs` | Suite + live 429/`Retry-After` | **PASS** |
| 47 | Malware scan / magic-byte validation | upload path | upload routes | local signature scan | accepted files only | Real PNG/PDF uploads accepted | **PASS** |
| 48 | QR token / public verify revocation | verify page | `/verify/:token` | token revocation | `qr_tokens` | Suite; page sweep 200 | **PASS** |
| 49 | LLM narrative generation | deterministic evidence-only answer | honest `source` | `TD_LLM_PROVIDER=none` | findings/score still computed | 6 investigations; no invented conclusion | **BLOCKED** |
| 50 | External provider lookups (government/VAHAN, insurer, theft) | demo-labelled panels | `/provider-checks` | local adapters only | `provider_checks` (0 rows) | Demo source ignored; status `unavailable` | **BLOCKED** |
| 51 | Moped / 3-wheeler / SUV / hybrid / commercial categories | not in wizard | not implemented | no profile | no rows | Not selectable | **NOT IMPLEMENTED** |
| 52 | Vehicle-specific 3D scan geometry | car GLB labelled generic reference | `vehicleSpecific=false` | asset manifest | — | Provenance label shown | **NOT IMPLEMENTED** |
| 53 | Blockchain anchoring | not shown as on-chain | — | local SHA-256 chain only | `chain_records` | “Hash chain intact”, not blockchain | **BLOCKED** |
| 54 | YOLO photo damage detection | manual damage UI only | — | weights not wired to upload | `damage_records` human-entered | No YOLO claim | **BLOCKED** |
| 55 | XGBoost production fraud classifier | demo-labelled | — | synthetic-trained model | — | Demo only | **BLOCKED** |
| 56 | S3 / external antivirus | — | local disk + signature scan | no cloud adapter | — | Local uploads work | **BLOCKED** |
| 57 | Email / SMS delivery | in-app notifications only | — | no provider | `notifications` | No email/SMS claim | **BLOCKED** |
| 58 | PostgreSQL split deployment | — | Next `node:sqlite` | shared file DB | `.data/trustdrive.db` | Migration not done | **BLOCKED** |
| 59 | Durable LangGraph checkpoints | — | `GET /health` + investigation payload | `langgraph-checkpoint-sqlite`; memory fallback reported honestly | `checkpoints`, `writes` in `.data/langgraph-checkpoints.db` | Backend 127/127; `checkpoint_backend=sqlite`, `durable_checkpointing=true` | **PASS** |
| 60 | PaddleOCR fallback engine | active engine shown | `/health` reports `paddleocr=false` | RapidOCR active | OCR rows persist | No PaddleOCR | **BLOCKED** |

## Honest coverage notes

1. **Rows 40–48 are not claimed as full end-to-end live proof.** They are implemented, covered by the Vitest/Pytest suites, and every corresponding page returned HTTP 200 in the independent 40-page authenticated sweep. They were not re-driven through every action in this final pass.
2. **Rows 1–39 are live-proven.** Evidence includes the 272-check six-category run, the focused 49-check run, the 10-check OCR negative run, the 13-check security run, the independent 13-check auth run, the 7-check persistence run, and direct SQL read-back.
3. **Missing records are never fraud.** Theft/provider checks without credentials are `unavailable`, not `verified`; OCR `verified` means automated extraction checks passed, not that the document is authentic.
4. **No external integration is claimed.** Government registry, insurer, theft registry, blockchain, YOLO, production XGBoost, S3, email/SMS, PaddleOCR and Postgres are explicitly BLOCKED.
5. **Final hardening pass:** durable LangGraph checkpoints (Row 59) are now SQLite-backed and verified, and rate limiting (Row 46) is shared through the database. Trust snapshots are persisted and deduplicated, signed downloads fail closed, fresh-database FKs rebuild correctly, and the test suites no longer touch the live database. See `ALL_BUGS_FOUND.md` §2b/§6.7–6.9.
