# TrustDrive — Remaining Issues Implementation Plan

**Created:** 2026-11-08
**Basis:** direct inspection of the repository, not the previous audit alone.
**Rule:** every item is classified `PASS`, `FAIL`, `BLOCKED`, `NOT IMPLEMENTED`, or `DEMO ONLY`. A visual placeholder or a synthetic result is never marked PASS.

## 0. Verified baseline

| Area | Actual state found in code | Consequence |
|---|---|---|
| Framework | Next.js 14 app in `frontend/`, FastAPI service in `backend/` | Keep both; Next remains system of record |
| Database | One SQLite file (`.data/trustdrive.db`) via `node:sqlite`; Python reads the same file | No Postgres driver or SQL migration layer exists yet |
| Auth | JWT cookie + Bearer; RBAC in `lib/server/http.ts` | Phase 2 can be completed without replacing auth |
| Category taxonomy | `frontend/lib/vehicle-categories.json`, mirrored by `backend/app/categories.py` | 6 implemented, 14 planned; safe to extend additively |
| YOLO | `backend/app/intelligence/damage/yolo.py`; `ai-services/shared/models/car_damage.pt` (40.5 MB, 6 classes); `ultralytics`, `onnxruntime`, `torch`, `cv2` installed | Adapter is genuinely runnable; only the upload→review→DB/UI workflow is missing |
| OCR | RapidOCR active; PaddleOCR not installed | PaddleOCR must remain an optional adapter, labelled inactive |
| XGBoost | `mileage_xgb.json` + metadata; synthetic demo training | Must stay `DEMO ONLY`; no production metric may be claimed |
| Storage | Local uploads in `.data/uploads`; Python S3 adapter exists | Next upload path has no S3 provider yet; no credentials |
| Malware scan | Local signature/heuristics in `lib/server/files.ts` | No ClamAV/hosted scanner configured |
| Email/SMS | In-app notification rows only | No SMTP/SMS/provider adapter or delivery log |
| LLM | `TD_LLM_PROVIDER=none`; deterministic explainer | Optional provider must stay optional and labelled |
| Blockchain | Local SHA-256 chain; `chain_adapter.py` refuses to claim anchoring | No funded signer, contract or RPC |
| 3D | One measured generic sedan GLB; `scooter.glb` is 10 KB and not a final asset | Motorcycle/scooter/commercial GLBs are absent; labelled schematic is the honest fallback |
| CI | No Docker daemon locally; Playwright browser provisioning unverified | Add CI workflow; local Docker remains BLOCKED |

## 1. Work plan and acceptance criteria

### Phase 1 — Plan and evidence
- **Root cause:** previous audit was not translated into an executable, verified backlog.
- **Missing:** implementation-level root cause, files, dependencies, tests and acceptance criteria per issue.
- **Files:** this document; final status reports in Phase 18.
- **Tests:** every phase below runs `npx tsc --noEmit`, `npm test -- --run`, `npm run intel:test`, and a production build.
- **Acceptance:** every remaining item has an owner phase, a classification and concrete evidence.

### Phase 2 — Production authentication and demo security
- **Existing:** JWT verification, role guards, `TD_SEED_DEMO`, micro-category demo seeding, in-app notifications.
- **Missing:** explicit production startup validation; anonymous/demo fallback audit; demo-login config gate; tests for tampered JWT and cross-user access.
- **Files:** `frontend/lib/server/auth.ts`, `frontend/lib/server/db.ts`, `frontend/lib/server/http.ts`, `frontend/lib/server/page.ts`, `frontend/app/api/v1/auth/*`, auth/security tests, deployment docs.
- **Security:** fail closed on missing/weak `JWT_SECRET` when `TD_ENV=production`; never log secrets; no guest access to private records.
- **Tests:** anonymous 401, wrong role 403, other-seller 403, tampered JWT 401, demo seeding disabled with `TD_SEED_DEMO=0`.
- **Acceptance:** production mode rejects anonymous protected API/page access, demo accounts are not recreated when disabled, and startup refuses unsafe config.

### Phase 3 — All vehicle categories
- **Existing:** JSON-driven taxonomy, category-aware identity, documents, mileage, trust, detection, 3D and agent nodes.
- **Missing:** 14 planned profiles; three-wheeler/commercial component sets; permit/fitness/weight fields; dynamic resolver mappings.
- **Files:** `frontend/lib/vehicle-categories.json`, `frontend/lib/vehicle-categories.ts`, `backend/app/categories.py`, category tests, seller wizard, marketplace filters.
- **Tests:** 20 implemented categories; VIN only for four-wheelers; EVs never asked for engine/CC/PUC; commercial docs; hybrid battery evidence; marketplace filter per category.
- **Acceptance:** every category can be selected in the real seller wizard, validated, filtered in the marketplace and resolved by Python with the same id.

### Phase 4 — YOLO upload→review→DB workflow
- **Existing:** working Ultralytics adapter and 6-class weights.
- **Missing:** image endpoint, job/analysis persistence, Next API route, seller review UI, human confirmation into `damage_records`, buyer visibility.
- **Files:** `backend/app/main.py`, `backend/app/detectors.py`, `frontend/app/api/v1/vehicles/[id]/damage/analyze/route.ts`, `frontend/lib/server/multicategory.ts`, `frontend/lib/server/data.ts`, `frontend/components/seller/DamageAiAnalyzer.tsx`, seller vehicle page.
- **Tests:** valid no-damage image (engine active, zero detections), corrupted image (400), unsupported type (415), oversized (413), missing intelligence service (503, no fake result), confirmation persists a `detected_visible_damage` row with model version and photo key.
- **Acceptance:** a seller can upload a real photo, see the real engine/model/version and detections, confirm one into the DB, and the buyer passport shows the confirmed record with provenance. No detection is auto-verified.

### Phase 5 — XGBoost honesty and validation
- **Existing:** synthetic demo model.
- **Missing:** explicit experiment metadata/label and an evaluation contract.
- **Files:** `ai-services/shared/models/mileage_xgb.meta.json`, model status endpoint, `ML_MODEL_VALIDATION_REPORT.md`.
- **Acceptance:** API/UI report `DEMO ONLY — synthetic training data`; no precision/recall claim; deterministic rules remain authoritative.

### Phase 6 — PaddleOCR
- **Existing:** RapidOCR active, labelled.
- **Missing:** PaddleOCR installed and model assets.
- **Files:** optional adapter only; OCR report.
- **Acceptance:** if PaddleOCR is absent, the response says `paddleocr: unavailable` and names RapidOCR as the active engine. No fake PaddleOCR claim.

### Phase 7 — S3 and antivirus
- **Existing:** local storage + Python S3 adapter + local signature scan.
- **Missing:** Next storage abstraction; ClamAV/hosted scanner interface; quarantine status.
- **Files:** `frontend/lib/server/storage.ts`, `frontend/lib/server/antivirus.ts`, upload routes, health endpoint, `FILE_STORAGE_AND_SECURITY_REPORT.md`.
- **Acceptance:** local mode labelled; S3 activates only with complete config + SDK; ClamAV activates only with host/port and a successful scan; an unavailable configured scanner fails closed; no external-scan claim otherwise.

### Phase 8 — Email/SMS
- **Existing:** in-app notifications only.
- **Missing:** provider interface, delivery outbox/retries, audit, disabled status.
- **Files:** `frontend/lib/server/notify.ts`, `notification_deliveries` table, inquiry/notification hooks, health, `NOTIFICATION_INTEGRATION_REPORT.md`.
- **Acceptance:** no provider → `disabled`, no “sent” message; configured HTTP/SMTP provider → real attempt recorded with status and retry count.

### Phase 9 — LLM narrative
- **Existing:** deterministic evidence-only explanation; `TD_LLM_PROVIDER=none`.
- **Missing:** capability/health status and strict evidence-only prompt contract.
- **Files:** `backend/app/integrations/llm/*`, `LLM_INTEGRATION_REPORT.md`.
- **Acceptance:** disabled provider retains deterministic narrative; configured provider must cite evidence IDs and cannot mutate facts; live provider test remains BLOCKED without credentials.

### Phase 10 — Blockchain anchoring
- **Existing:** local SHA-256 chain only.
- **Missing:** real submit/verify adapter with a signer or anchoring service.
- **Files:** `backend/app/blockchain/chain_adapter.py`, status endpoint, `BLOCKCHAIN_INTEGRITY_REPORT.md`.
- **Acceptance:** local chain remains the only integrity claim; configured provider may submit/verify a real tx; no configured provider → `NOT IMPLEMENTED`, never “anchored”.

### Phase 11 — External registry adapters
- **Existing:** generic admin provider-check route; demo providers.
- **Missing:** separate vehicle-registry/insurer/theft HTTP adapters with provenance, timeout and audit.
- **Files:** `frontend/lib/server/providers.ts`, provider-check route, backend integrations, tests with local stub server, `EXTERNAL_DATA_INTEGRATION_REPORT.md`.
- **Acceptance:** configured endpoint → normalized result with source/provenance; absent endpoint → `unavailable`, never clean; stub tests prove success and failure.

### Phase 12 — 3D asset system
- **Existing:** measured generic sedan GLB, labelled schematic, component registry.
- **Missing:** licensed motorcycle/scooter/three-wheeler/commercial GLBs and measured hierarchies.
- **Files:** `frontend/public/models/vehicles/*`, `model-manifest.json`, `3D_ASSET_CATALOG.md`, `3D_ASSET_LICENSES.md`.
- **Acceptance:** never substitute the car GLB; every non-car category reports `unavailable` and disables hotspots. Obtaining licensed assets remains BLOCKED.

### Phase 13 — PostgreSQL
- **Existing:** SQLite-only Next data layer.
- **Missing:** Postgres driver, schema migration, repository abstraction.
- **Files:** migration/report only.
- **Acceptance:** local SQLite remains the tested system of record; production Postgres is `BLOCKED` until a driver and credentials exist. No claim of a completed split deployment.

### Phase 14 — Docker and CI
- **Existing:** Dockerfiles/compose may exist but daemon unavailable locally.
- **Missing:** executable CI pipeline with Docker build.
- **Files:** `.github/workflows/ci.yml`, `DOCKER_DEPLOYMENT_REPORT.md`.
- **Acceptance:** CI workflow runs install/typecheck/tests/build/backend tests/Playwright install/Docker build. Local Docker remains BLOCKED with the exact error recorded.

### Phase 15 — Playwright CI
- **Existing:** browser scripts and screenshots from earlier runs.
- **Missing:** CI browser provisioning.
- **Files:** CI workflow, `PLAYWRIGHT_CI_REPORT.md`.
- **Acceptance:** CI installs Chromium and OS deps; local run may be skipped only if the local browser binary is absent, with the reason recorded.

### Phase 16 — Hydration warning
- **Existing:** one reported injected `style` attribute on a file input.
- **Missing:** reproducible application cause.
- **Files:** SSR source inspection/test only.
- **Acceptance:** server HTML inspected; no application-side injected style found; do not suppress warnings globally; document extension/tool cause if external.

### Phase 17 — Live Seller→Buyer regression
- **Existing:** 272/272 broad run, 49/49 focused run.
- **Missing:** rerun after category/YOLO/security changes, including the new damage workflow.
- **Files:** QA scripts/results, `FULL_REGRESSION_TEST_REPORT.md`.
- **Acceptance:** real browser/API journeys for a scooter, an EV, mileage inconsistency, damage confirm, iPad/desktop responsive, report download, and cross-user denial.

### Phase 18 — Final reports
- `PRODUCTION_READINESS_REPORT.md`, `ALL_REMAINING_ISSUES_STATUS.md`, `ENVIRONMENT_CONFIGURATION_GUIDE.md`, `DEPLOYMENT_AND_ROLLBACK_GUIDE.md`, `SECURITY_HARDENING_REPORT.md`, `FULL_REGRESSION_TEST_REPORT.md`.
- **Acceptance:** every finding carries one of the five classifications and a command/file/evidence reference.

## 2. Order of execution

1. Categories + tests (unblocks seller/buyer workflows and YOLO component mapping).
2. Production auth/demo gate + security tests.
3. YOLO end-to-end.
4. Provider/storage/AV/notification/anchoring adapters with honest status.
5. OCR/LLM/model labeling.
6. CI/Docker/Playwright.
7. Hydration audit.
8. Live regression + reports.

## 3. Definition of done

A phase is done only when its code is present, its tests pass, its UI/API states are real, its data persists after refresh, and its report states what was actually executed. External credentials/assets that are absent are reported as BLOCKED or NOT IMPLEMENTED, never simulated.
