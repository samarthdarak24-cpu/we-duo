# TrustDrive — Implementation Status

> **Master tracker.** A feature is COMPLETE only when: UI matches design · backend API
> exists · DB operation works · permissions enforced server-side · loading/empty/error
> states work · input validation works · tests pass · data persists after refresh · no
> placeholder action remains · no fake result is presented as real · the related
> Seller/Buyer workflow works.

**Last updated:** 2026-11-12 (live Render audit + OCR memory fix) · **Current suite evidence:** frontend **384 passed / 20 skipped**, backend **187 passed / 1 skipped**, typecheck 0 errors, `render:validate` 42/42. · **Previous live evidence:** broad run `LIVE-MW6DOO1A` (272/272), focused run `MW5ATBQ1` (49/49), OCR negative 10/10, security 13/13 + 10/10, page sweep 40/40, responsive 44/44.

## Governing decision

Additive, not destructive. The Next.js app is the **system of record** (portals, REST API,
relational DB). The Python FastAPI service is **additive** beside it, sharing the same
database. One shared DB, two runtimes, no removed feature.

## Verified facts (live, this pass)

- **55 tables**, `SCHEMA_VERSION=3`, shared `.data/trustdrive.db`; `integrity_check=ok`, 0 FK violations, WAL mode.
- **52 pages**, **109 Next.js API route handlers**, **87 React components**, **56 Python modules**.
- Users: admin + sellers (`samarth@trustdrive.dev`, `weduo@trustdrive.dev`) + buyers (`rohan@trustdrive.dev`, `aditya@trustdrive.dev`, others); password `demo1234`.
- **122 vehicles**, **110 listings** at final snapshot; all six implemented categories present; no planned-category rows.
- Evidence tables populated: `documents` 254, `document_extractions` 1,200, `damage_records` 75, `findings` 40, `mileage_readings` 158, `history_events` 97, `trust_scores` 73, `ai_runs` 41, `inquiries` 57, `inquiry_messages` 106, `reports` 33, `notifications` 361, `audit_logs` 209, `chain_records` 652.
- Seller pages pass the **real** logged-in `user.id` into `getSellerOverview` (not hardcoded).
- RBAC isolation confirmed: `inquiries` carry `buyer_id` + `seller_id`; non-owner read → 403; buyer document view is consent-gated.
- 3D: real `trustdrive-sedan.glb` for cars; labelled schematic and disabled interactions for all two-wheelers.

## Latest verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **0 errors** |
| `npm test -- --run` | **363 passed** (20 files, incl. auth-security + integration suites: S3/SMTP/SMS/ClamAV/LLM/OCR-provider/anchoring/registry-adapters/evm-anchoring) |
| `npm run intel:test` | **182 passed** |
| `NEXT_DIST_DIR=.next_verify npm run build` | **PASS**, 52/52 pages, 109 API routes |
| Broad live browser run | **272/272 checks, 6/6 categories** |
| Focused six-feature run | **49/49 checks** |
| OCR negative paths | **10/10** |
| Security/RBAC focused | **13/13** |
| Independent security/API | **10/10 security, 15/15 API** |
| Page sweep / responsive | **40/40 pages, 44/44 responsive** |
| Trust snapshots | Persisted, deduplicated, append-only; returned as `history` |
| Rate limiting | Shared `rate_limit_hits` table; 429 + `Retry-After` verified |
| Durable checkpoints | `checkpoint_backend=sqlite`, `durable_checkpointing=true` |

## Phase summary

| Phase | Area | Status |
| --- | --- | --- |
| 0 | Repo audit (55 tables, 109 routes, 52 pages) | ✅ |
| 1 | Premium design system (Day/Night) | ✅ (skeletons present; some pages use simpler loading states) |
| 2 | Production authentication & demo security | ✅ `validateProductionConfig` fail-closed; `TD_SEED_DEMO=0` enforced; anonymous 401; wrong role 403; tampered JWT 401; cross-user isolation; `tests/auth-security.test.ts` (16 tests) |
| 3 | Buyer frontend (dashboard, explore, search, saved, compare, history, risk, reports, verification, inquiries, settings) | ✅ |
| 4 | DB & API architecture (55 tables, 11 immutability triggers) | ✅ |
| 5 | FastAPI backend (auth/users/vehicles/docs/history/mileage/verification/AI/damage/listings/search/saved/compare/inquiries/reports/QR/notifications/audit) | ✅ |
| 6 | Seller integration | ✅ |
| 7 | Buyer integration | ✅ |
| 8 | Document intelligence (18-step OCR pipeline) | ✅ (RapidOCR default locally; PaddleOCR 3.7.0 installed + selectable; the 512 MB Render Free image uses Tesseract 5 because the ONNX peak exceeds its cgroup limit — see the live section below) |
| 9 | Deterministic fraud detection | ✅ |
| 10 | ML models (XGBoost demo-trained; YOLO wired end-to-end) | 🟡 XGBoost `EXPERIMENTAL` (trained + evaluated on synthetic-demo-600; not production fraud detection); YOLO detect/review + `DamageAiAnalyzer` UI + buyer passport visibility |
| 11 | 15/16-node investigator (EV + hybrid adds `EVBatteryAnalysisNode`) | ✅ LangGraph active in `backend/.venv` |
| 12 | Three.js inspection (real GLB, 4 modes, raycast picking, DB hotspots) | ✅ |
| 13 | Trust score & reports (PDF + QR) | ✅ |
| 14 | Record integrity (SHA-256, drift checks; no on-chain claim) | ✅ |
| 15 | Security / testing / workers | ✅ (DB-backed shared rate limit; `tests/auth-security.test.ts` 16 tests; signed downloads fail closed; upload-guard: clamd/HTTP/local scan, quarantine, fail-closed 503, `file_scans` + `notification_deliveries` audit tables) |
| 16 | Seed & deployment (20-category taxonomy; demo inventory additive) | ✅ Six demo vehicles plus 14 new category profiles exercised through seller-created records |
| 17 | Integration adapters (storage/AV/notify/LLM/anchoring/registry) | ✅ `files.ts` (async local/S3, presigned URLs, health), `scan.ts` (clamd INSTREAM + HTTP + local, fail-closed), `upload-guard.ts` (quarantine+audit+notify), `mailer.ts` (SMTP retry + SMS gateway + delivery rows), `llm-provider.ts` (8-case stub-tested), `anchoring.ts` (local SHA-256 chain, on-chain NOT claimed) — all config-gated, honest `unavailable` when credentials absent |
| 18 | Live browser verification | ✅ (seller/buyer core flows, 20 categories, OCR/AI/RBAC) |
| 19 | Final reports | ✅ `PRODUCTION_READINESS_REPORT.md`, `ALL_REMAINING_ISSUES_STATUS.md`, `ENVIRONMENT_CONFIGURATION_GUIDE.md`, `DEPLOYMENT_AND_ROLLBACK_GUIDE.md`, `SECURITY_HARDENING_REPORT.md`, `FULL_REGRESSION_TEST_REPORT.md` |

Legend: ✅ done & verified · 🟡 partial / honest gap · ⚙️ env-gated adapter · 🔲 not started.

## Multi-category platform

- **Taxonomy:** `frontend/lib/vehicle-categories.json` (`version: multicategory-2.0.0`, `trustVersion: trust-v2-multicategory`) is the single source of truth consumed by both TS and Python.
- **20 implemented categories (zero planned):** petrol motorcycle, petrol scooter, electric scooter, electric motorcycle, passenger car, electric car, moped, electric bike, auto rickshaw, electric three-wheeler, passenger three-wheeler, cargo three-wheeler, hatchback, SUV, MUV, hybrid car, light commercial, truck, bus, electric commercial.
- **Planned categories:** none (`plannedCategories: []`).
- **Strict resolution:** `matchCategoryId` / `match_category_id` returns `undefined`/`None` for unknown labels at API/registration boundaries — no silent fallback to passenger-car rules. `resolveCategoryId` / `resolve_category_id` stay lenient only for legacy DB rows.
- **Category-specific validation:** 2W chassis/frame 8–22 chars; four-wheeler cars 17-char VIN; commercial/truck/bus accept 14-char chassis; EVs reject engine numbers; hybrids keep engine fields + add battery fields.
- **Powertrain:** pure electric profiles hide engine/CC/PUC and add motor + battery fields; hybrid keeps engine + battery; commercial profiles add axle_count, GVW, payload, tyre condition and permit type.
- **Documents:** strict per-category allowlist — `isAllowedDocument` no longer falls back to car docs. RC types: `rc_2w` (2W), `rc_3w` (3W), `rc_commercial` (commercial), `rc` (cars/hybrid). Permits/fitness/road_tax for commercial and 3W.
- **Battery SOH ≠ odometer:** battery checks apply to all battery-pack profiles (EV + hybrid). SOH in `vehicle_specs`; distance in `vehicles.km_claimed`; no odometer rows in `battery_records`; State of Health never inferred.
- **3D policy:** car GLB labelled `generic-reference` for `passenger_car`/`electric_car` only; every other category reports `unavailable`, no car asset substituted, interactions disabled.
- **Agent nodes:** 15 nodes for combustion/commercial; 16 nodes (adds `EVBatteryAnalysisNode`) for every battery-pack profile including hybrid.
- **Marketplace:** class filtering supports all four classes (`two_wheeler`, `three_wheeler`, `four_wheeler`, `commercial`) plus exact category id match.
- **Preserved:** car functionality, QA22 GLB registry and the earlier feature baseline remain intact; legacy 69-car rows keep their behaviour via `vehicle_category_id` authority.

## Honest gaps / blockers

- **External providers:** government/VAHAN, insurer and theft registries have provider interfaces implemented (`lib/server/providers.ts`) but no credentials/adapters against real services. Results are `unavailable`, never `verified`. 4 tests verify honest unavailable behavior. User-submitted documents never labelled government-verified.
- **Blockchain anchoring:** provider interface + EVM adapter fully implemented (`lib/server/evm/anchoring-service.ts`, `client.ts`, `registry-contract.ts`) and tested against a local JSON-RPC stub (`qa/evm-rpc-stub.mjs`, `tests/evm-anchoring.test.ts` — 15 tests pass). Real on-chain anchoring NOT IMPLEMENTED: no funded EVM signer / RPC URL / testnet faucet available locally; local SHA-256 chain remains the only integrity claim.
- **YOLO photo damage:** `car_damage.pt` (MIT, 6 classes) + `/detect` + human confirmation (`PATCH .../damage/:damageId/review` with optional `component_id` & `severity`) + 3D `hotspotsFor` linkage are verified end-to-end on car photos (`Journey D`), while non-car categories (`petrol_motorcycle`, `electric_scooter`) honestly report `available: false`; slim Render runtime without `ultralytics`/`torch` likewise reports `available: false` honestly. Unreviewed `detected_candidate` and `rejected` rows are excluded from 3D hotspots.
- **XGBoost fraud model:** trained + evaluated on synthetic demo data (`dataset_label: synthetic-demo-600`; precision/recall/F1/ROC-AUC=1.0 on separable demo rows); marked `EXPERIMENTAL`, not production fraud detection.
- **LLM narrative:** `TD_LLM_PROVIDER=none` by default; deterministic evidence-only text. Provider adapter tested against a local OpenAI-compatible stub across 8 cases (disabled / missing key / valid / invalid key / rate limit / timeout / malformed / contradictory). No LLM conclusion is generated unless a real provider call succeeds.
- **S3 / external AV / email / SMS:** implemented and tested against local stand-ins (moto S3 server, clamd stub, aiosmtpd sink, HTTP SMS gateway). Not claimed against real production credentials; config-gated and honest when credentials absent.
- **Postgres:** adapter/interface prepared in `app/config.py` (`TD_DB_URL`); shared SQLite remains the dev/runtime database. A production Postgres split is not locally runnable here (no server/daemon).
- **OCR engines:** RapidOCR (ONNX) is the local default; PaddleOCR 3.7.0 is installed and selectable via `TD_OCR_PROVIDER=paddleocr`. On the 512 MB Render Free instance the ONNX peak (~250-330 MB) plus Next.js/FastAPI exceeds the cgroup limit, so the blueprint sets `TD_OCR_PROVIDER=tesseract` (a real Tesseract 5 CLI OCR engine with a ~30-60 MB peak). Larger instances can switch back to `rapidocr` for higher accuracy on noisy photos. No engine is ever reported as another.
- **Docker:** build not run in this environment (daemon unavailable); CI builds `Dockerfile.render`.
- **Playwright E2E (workflows S4–S8):** S1–S3 pass reliably. Deeper workflows time out on Windows single-threaded `next dev` (environment slowness, not a code regression — S2 passes the same vehicle-creation form individually). Needs a Linux CI runner with a seeded DB and Chromium to complete workflows S4–S8.
- **Licensed non-car GLB assets:** NOT IMPLEMENTED — no licensed motorcycle/scooter/3-wheeler/commercial GLB obtained. Three documentation files written (`3D_ASSET_CATALOG.md`, `3D_COMPONENT_MAPPING.md`, `3D_VIEWER_TEST_REPORT.md`) plus existing `3D_ASSET_LICENSES.md`. Non-car categories honestly report `unavailable`; no car GLB substituted.

## Demo logins (password `demo123456`)

`admin@trustdrive.dev` · `samarth@trustdrive.dev`, `weduo@trustdrive.dev` (seller) · `rohan@trustdrive.dev`, `aditya@trustdrive.dev` (buyer)

## Verification commands

```powershell
cd frontend
npx tsc --noEmit
npm test -- --run
cd ..
npm run intel:test
cd frontend
$env:NEXT_DIST_DIR='.next_verify'
npm run build
```

Live: `npm run intel:serve` + `npm run dev`, then `node qa/live_e2e.mjs` (or the focused harnesses in `qa/live-browser/`).

## Connectivity & Render Deployment Fixes (Verified)

- **Shared local state paths**: [`frontend/lib/server/auth.ts`](../../frontend/lib/server/auth.ts), [`frontend/lib/server/db.ts`](../../frontend/lib/server/db.ts), and [`frontend/lib/server/files.ts`](../../frontend/lib/server/files.ts) now resolve relative `.data/*` defaults (`trustdrive.db`, `jwt-secret`, `uploads`, `quarantine`) against the repository root whenever `process.cwd()` is `frontend/`, even on first boot before `.data/` exists.
- **Bearer-token proxy forwarding**: [`userBearer`](../../frontend/lib/server/backend.ts) now falls back to `Authorization: Bearer <token>` when `td_token` cookie is absent, matching [`requireRole`](../../frontend/lib/server/http.ts).
- **Model metadata & YOLO /detect parity**: Fixed stale `ai-services` model metadata path in [`backend-local.ts`](../../frontend/lib/server/backend-local.ts) to `services/ai/shared/models/mileage_xgb.meta.json`; updated [`vehicles.py`](../../backend/app/routers/vehicles.py) and [`backend-local.ts`](../../frontend/lib/server/backend-local.ts) to resolve uploaded/seeded photos from both `vehicle_images` and `listing_images` (joined via `listings`) and populate non-null defaults (`zone_id`, `repair_status`, `inspection_date`), with null guards in [`VehicleDetailPanel.tsx`](../../frontend/components/buyer/VehicleDetailPanel.tsx), [`pdf.ts`](../../frontend/lib/server/pdf.ts), [`ai.ts`](../../frontend/lib/server/ai.ts), [`evidence.ts`](../../frontend/lib/server/evidence.ts), and [`data.ts`](../../frontend/lib/server/data.ts).
- **OCR extraction & review sync**: [`vehicles.py`](../../backend/app/routers/vehicles.py) and [`backend-local.ts`](../../frontend/lib/server/backend-local.ts) now persist extracted and manually reviewed OCR fields back to `documents.extracted` and `document_extractions` (supporting both Next.js and pytest schemas), [`getDocumentsView`](../../frontend/lib/server/data.ts) reads `ocr_extracted`/`ocr_status` fallbacks, and [`OcrExtract.tsx`](../../frontend/components/seller/OcrExtract.tsx) excludes `confidence` from string inputs, keeps raw OCR text visible when regex fields are empty, and surfaces save confirmation & stringified error messages.
- **Seller UI fixes**: Fixed [`DamageAiAnalyzer.tsx`](../../frontend/components/seller/DamageAiAnalyzer.tsx) to parse flat JSON responses from `/detect` and `/review` and wired its header action button; fixed object-error rendering in [`IntegrationStatus.tsx`](../../frontend/components/seller/IntegrationStatus.tsx) and mounted `<IntegrationStatus />` in [`frontend/app/seller/settings/page.tsx`](../../frontend/app/seller/settings/page.tsx).
- **Render deployment readiness**: Added `TD_QUARANTINE_DIR`, `TD_CHECKPOINT_DB`, `TD_MODEL_DIR`, and `NEXT_PUBLIC_APP_URL` to [`render.yaml`](../../render.yaml), added `RENDER_EXTERNAL_URL` fallback via [`appBaseUrl`](../../frontend/lib/server/http.ts), added `libgl1`, `libglib2.0-0`, and `libgomp1` to [`Dockerfile.render`](../../project/infra/docker/Dockerfile.render), and un-ignored [`start-render.sh`](../../project/infra/deployment/start-render.sh) in [`.dockerignore`](../../.dockerignore).
- **Production empty-DB (`TD_SEED_DEMO=0`) Server Component & health check fixes**: Fixed [`getBuyerOverview`](../../frontend/lib/server/data.ts) and [`frontend/app/buyer/page.tsx`](../../frontend/app/buyer/page.tsx) crashing with `TypeError` on `rv.make` / `pricing.estimate` when zero seeded/published vehicles exist; updated [`getRecommendedVehicles`](../../frontend/lib/server/data.ts) to fall back to published marketplace listings when demo vehicles are absent; updated `HEAD /api/v1/health/ready` in [`ready/route.ts`](../../frontend/app/api/v1/health/ready/route.ts) to validate `getDb()` just like `GET`.
- **Blueprint audit, Journey D 3D hotspot wiring & Render guide sync**: Updated [`AiDamageScan.tsx`](../../frontend/components/seller/AiDamageScan.tsx) and [`DamageAiAnalyzer.tsx`](../../frontend/components/seller/DamageAiAnalyzer.tsx) (wired `zones` from [`seller/vehicles/[id]/page.tsx`](../../frontend/app/seller/vehicles/[id]/page.tsx)) so confirming a YOLO candidate can map a 3D `component_id` and `severity`, safe-stringifies `{ error: { message } }` objects in `AiDamageScan.tsx`, sets `position_source = "detected_visible_damage"` in [`vehicles.py`](../../backend/app/routers/vehicles.py) and [`backend-local.ts`](../../frontend/lib/server/backend-local.ts), and excludes unreviewed `detected_candidate` and `rejected` rows from [`hotspotsFor`](../../frontend/lib/server/data.ts). Synced [`RENDER_DEPLOYMENT_GUIDE.md`](../deployment/RENDER_DEPLOYMENT_GUIDE.md) with [`render.yaml`](../../render.yaml) paths, secrets, and Free-tier `/tmp/trustdrive` notes. Verified Journeys A–F against live Next.js + FastAPI + Worker (`TD_ENV=production`, `TD_SEED_DEMO=0`) and Playwright `e2e/trustdrive.spec.ts` (`chromium-1920`).
- **Live Render audit (12 Nov 2026)**: `https://we-duo-65t8.onrender.com` runs the labelled synthetic demo dataset (18 marketplace listings) and the three demo logins; buyer/seller/admin pages return 200, the vehicle report and signed PDF download work (`application/pdf`, `%PDF-`), notifications and profile updates persist, and the admin integration health endpoint reports SQLite shared with FastAPI, local storage/scanner, and intelligence connected. **Active:** Next.js, Tailwind, Three.js/R3F with the real GLB, Next.js REST, FastAPI, shared SQLite, SQLAlchemy, RapidOCR/PyMuPDF/OpenCV adapters, XGBoost demo model, DB-backed worker (inline), SHA-256 chain, local Playwright/Pytest/Vitest, Render Docker. **Fallback/limited:** Tesseract is the active OCR engine on the 512 MB Free instance (the ONNX peak OOM-killed the container; see the OCR section above), the investigator uses the deterministic `sequential-fallback` graph because LangGraph is not installed in the slim image, and the LLM is `none`. **Not configured / not claimed:** PostgreSQL, S3, Redis/Celery, YOLO/torch, PaddleOCR, SMTP/SMS/ClamAV, VAHAN/insurer/theft providers and on-chain blockchain anchoring. **Free-plan limits:** no persistent disk (`/tmp` resets on restart/deploy), 512 MB RAM, 0.15 CPU; demo data reseeds after a restart but user-created uploads/rows do not survive it.
- **Full `trustdrive_test_fixtures` (`A00`–`H07`) & Render container fixes**: Fixed missing `COPY frontend/lib/vehicle-categories.json` and added runtime `/tmp/trustdrive` defaults in [`Dockerfile.render`](../../project/infra/docker/Dockerfile.render); made [`frontend/app/inspection/page.tsx`](../../frontend/app/inspection/page.tsx) `force-dynamic` so build-time static prerendering does not bake demo `v-demo-bike` when `TD_SEED_DEMO=0`. Tightened upload validation (`EMPTY_FILE` 400, double/disallowed extensions `415`, photo MIME sniff, filename sanitization) in [`files.ts`](../../frontend/lib/server/files.ts) and upload routes, and scoped `/JS` / `/Launch` heuristics in [`scan.ts`](../../frontend/lib/server/scan.ts) to PDF files so compressed PNG images never false-positive as malware. Updated [`DocumentsManager.tsx`](../../frontend/components/seller/DocumentsManager.tsx) / [`seller/documents/page.tsx`](../../frontend/app/seller/documents/page.tsx) to show category-specific document types and ignore soft-deleted duplicates in [`db.ts`](../../frontend/lib/server/db.ts). Enhanced [`ocr.py`](../../backend/app/ocr.py), [`extract.py`](../../backend/app/extract.py), [`detectors.py`](../../backend/app/detectors.py), [`document-ocr.ts`](../../frontend/lib/server/document-ocr.ts), and [`data.ts`](../../frontend/lib/server/data.ts) for blur/skew/low-res/blank quality gating, deskewing, EV battery extraction & `batteryRecords`, model-year / future-date / pre-manufacture-date / same-vehicle & cross-vehicle invoice reuse findings, and `ODOMETER_ROLLBACK` (`NEEDS_REVIEW`) timeline sync. Added [`backend/tests/test_trustdrive_fixtures.py`](../../backend/tests/test_trustdrive_fixtures.py), [`frontend/tests/trustdrive-fixtures.test.ts`](../../frontend/tests/trustdrive-fixtures.test.ts), and PNG heuristic coverage in [`frontend/tests/scan.test.ts`](../../frontend/tests/scan.test.ts).
