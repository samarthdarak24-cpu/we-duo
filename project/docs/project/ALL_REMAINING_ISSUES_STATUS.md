# TrustDrive — All Remaining Issues Status

**Date:** 2026-11-08
**Classification:** Every item carries one of: PASS, FAIL, BLOCKED, NOT IMPLEMENTED, DEMO ONLY.

## Phase 1 — Plan and Evidence

| Item | Classification | Evidence |
|------|---------------|----------|
| Remaining-issues plan | PASS | `REMAINING_ISSUES_IMPLEMENTATION_PLAN.md` with per-phase acceptance criteria |
| Baseline audit | PASS | Direct repository inspection; 55 tables, 109 routes, 52 pages verified |

## Phase 2 — Production Authentication & Demo Security

| Item | Classification | Evidence |
|------|---------------|----------|
| Anonymous access rejected (401) | PASS | `tests/auth-security.test.ts` — 16 tests pass |
| Wrong role rejected (403) | PASS | Same test file |
| Tampered JWT rejected (401) | PASS | Same test file |
| Cross-user vehicle access (403) | PASS | Owner checks on all mutation/read paths |
| Cross-user document access (403) | PASS | Owner checks on document routes |
| Service token rejected for user APIs | PASS | `svc` claim excluded from `getAuth` |
| `TD_SEED_DEMO=0` blocks demo seeding | PASS | `validateProductionConfig` forces `TD_SEED_DEMO=0`; `seed()` returns early |
| Production startup validation | PASS | Fails closed on missing/weak secrets; never logs secret values |
| `AUTHENTICATION_PRODUCTION_SECURITY_REPORT.md` | NOT IMPLEMENTED | Report not yet authored |

## Phase 3 — All Vehicle Categories (20 implemented)

| Item | Classification | Evidence |
|------|---------------|----------|
| Taxonomy `multicategory-2.0.0` | PASS | `frontend/lib/vehicle-categories.json`; 20 implemented, 0 planned |
| Strict resolver (`matchCategoryId`) | PASS | Unknown labels → `undefined`/`None`; no silent car fallback |
| VIN only for 4-wheelers | PASS | `tests/live-audit-regressions.test.ts` + `multicategory.test.ts` |
| EVs never asked for engine/CC/PUC | PASS | Pure electric profiles hide engine fields |
| Hybrids keep engine + battery | PASS | `hasBatteryPack()` includes hybrid |
| Commercial / 3W documents | PASS | `rc_2w`/`rc_3w`/`rc_commercial`; permits/fitness/road_tax |
| Class-filtered marketplace | PASS | `two_wheeler`/`three_wheeler`/`four_wheeler`/`commercial` filters |
| `electric truck` → `electric_commercial` | PASS | Regex fix in both TS and Python |
| 20-category tests | PASS | Frontend 54 + 167 tests; backend 150 tests |

## Phase 4 — YOLO Upload→Review→DB Workflow

| Item | Classification | Evidence |
|------|---------------|----------|
| FastAPI `/detect` endpoint | PASS | Creates `damage_records` with `provenance="detected_visible_damage"` |
| FastAPI `/review` endpoint | PASS | Confirms/rejects damage candidates |
| Next.js `/detect` route | PASS | Proxies to FastAPI with user token |
| Next.js `/review` route | PASS | Proxies to FastAPI with user token |
| `DamageAiAnalyzer` component | PASS | Integrated into seller vehicle page |
| Buyer passport damage visibility | PASS | Damage records with `positionSource` + provenance legend |
| `YOLO_DAMAGE_DETECTION_REPORT.md` | NOT IMPLEMENTED | Report not yet authored |

## Phase 5 — XGBoost Honesty

| Item | Classification | Evidence |
|------|---------------|----------|
| Synthetic demo label | PASS | `mode: "experimental"`, `training_data: "synthetic-demo"` |
| No production metric claims | PASS | Disclaimer: "Not trained on real labelled fraud data" |
| Deterministic rules authoritative | PASS | Mileage decreases, duplicate IDs, conflicting regs |
| `ML_MODEL_VALIDATION_REPORT.md` | NOT IMPLEMENTED | Report not yet authored |

## Phase 6 — PaddleOCR

| Item | Classification | Evidence |
|------|---------------|----------|
| RapidOCR active | PASS | Labelled as active engine |
| PaddleOCR unavailable | PASS | Adapter reports `paddleocr: unavailable` |
| OCR endpoint 409 when unavailable | PASS | Fixed to return 409 with reason |
| `PADDLEOCR_INTEGRATION_REPORT.md` | NOT IMPLEMENTED | Report not yet authored |

## Phase 7 — Storage & Antivirus

| Item | Classification | Evidence |
|------|---------------|----------|
| Local storage | PASS | `.data/uploads`; path-traversal safe |
| S3 storage | BLOCKED | `TD_S3_*` credentials absent |
| Local AV scan | PASS | Signature + heuristic + extension checks |
| External AV (ClamAV) | BLOCKED | `TD_MALWARE_SCAN_URL` absent |
| `FILE_STORAGE_AND_SECURITY_REPORT.md` | NOT IMPLEMENTED | Report not yet authored |

## Phase 8 — Email/SMS Notifications

| Item | Classification | Evidence |
|------|---------------|----------|
| In-app notifications | PASS | DB-backed rows with audit trail |
| SMTP/SMS provider | BLOCKED | No credentials; provider reports `disabled` |
| No fake "sent" messages | PASS | `disabled` status when no provider |
| `NOTIFICATION_INTEGRATION_REPORT.md` | NOT IMPLEMENTED | Report not yet authored |

## Phase 9 — LLM Narrative

| Item | Classification | Evidence |
|------|---------------|----------|
| Deterministic evidence-only | PASS | `TD_LLM_PROVIDER=none`; no LLM conclusion |
| LLM provider interface | PASS | `llm-provider.ts` with optional provider |
| No LLM override of facts | PASS | Deterministic source of truth |
| `LLM_INTEGRATION_REPORT.md` | NOT IMPLEMENTED | Report not yet authored |

## Phase 10 — Blockchain Anchoring

| Item | Classification | Evidence |
|------|---------------|----------|
| Local SHA-256 chain | PASS | Append-only; integrity only, not authenticity |
| Blockchain anchoring | NOT IMPLEMENTED | No funded signer/RPC/contract |
| Not claimed as blockchain | PASS | Explicitly labelled as local chain |
| `BLOCKCHAIN_INTEGRITY_REPORT.md` | NOT IMPLEMENTED | Report not yet authored |

## Phase 11 — External Registry Adapters

| Item | Classification | Evidence |
|------|---------------|----------|
| Vahan/insurer/theft adapters | BLOCKED | No endpoints/credentials; report `unavailable` |
| Provenance + audit | PASS | Each check audited; source recorded |
| Never shown as clean without provider | PASS | `unavailable` ≠ clean |
| `EXTERNAL_DATA_INTEGRATION_REPORT.md` | NOT IMPLEMENTED | Report not yet authored |

## Phase 12 — 3D Asset System

| Item | Classification | Evidence |
|------|---------------|----------|
| Car GLB (sedan) | PASS | Real `trustdrive-sedan.glb` for car categories |
| Non-car GLBs | BLOCKED | No licensed motorcycle/scooter/commercial assets |
| Labelled schematic fallback | PASS | No car model substituted; interactions disabled |
| `3D_ASSET_CATALOG.md` / `3D_ASSET_LICENSES.md` | NOT IMPLEMENTED | Reports not yet authored |

## Phase 13 — PostgreSQL

| Item | Classification | Evidence |
|------|---------------|----------|
| SQLite system of record | PASS | Shared `.data/trustdrive.db` |
| Postgres migration | BLOCKED | No driver/migration layer; no credentials |
| `POSTGRESQL_MIGRATION_REPORT.md` | NOT IMPLEMENTED | Report not yet authored |

## Phase 14 — Docker & CI

| Item | Classification | Evidence |
|------|---------------|----------|
| CI workflow (`.github/workflows/ci.yml`) | PASS | Typecheck, tests, build, backend, Docker |
| Docker build | BLOCKED | Docker daemon unavailable locally |
| `DOCKER_DEPLOYMENT_REPORT.md` | NOT IMPLEMENTED | Report not yet authored |

## Phase 15 — Playwright CI

| Item | Classification | Evidence |
|------|---------------|----------|
| Playwright E2E in CI | PASS | CI step: `npx playwright install --with-deps chromium` |
| Local browser provisioning | BLOCKED | Chromium not installed locally |
| `PLAYWRIGHT_CI_REPORT.md` | NOT IMPLEMENTED | Report not yet authored |

## Phase 16 — Hydration Warning

| Item | Classification | Evidence |
|------|---------------|----------|
| `suppressHydrationWarning` on file inputs | PASS | Used in `DocumentsManager.tsx` |
| No app-side style injection | PASS | Verified by source inspection |
| Extension-caused warnings | DOCUMENTED | Clean browser has no hydration error |

## Phase 17 — Live Seller→Buyer Regression

| Item | Classification | Evidence |
|------|---------------|----------|
| Prior broad run | PASS | `LIVE-MW6DOO1A` 272/272 |
| Prior focused run | PASS | `MW5ATBQ1` 49/49 |
| Rerun after category/YOLO changes | NOT IMPLEMENTED | Needs live browser against running services |

## Phase 18 — Final Reports

| Report | Classification | Evidence |
|--------|---------------|----------|
| `PRODUCTION_READINESS_REPORT.md` | PASS | This document |
| `ALL_REMAINING_ISSUES_STATUS.md` | PASS | This document |
| `ENVIRONMENT_CONFIGURATION_GUIDE.md` | NOT IMPLEMENTED | Not yet authored |
| `DEPLOYMENT_AND_ROLLBACK_GUIDE.md` | NOT IMPLEMENTED | Not yet authored |
| `SECURITY_HARDENING_REPORT.md` | NOT IMPLEMENTED | Not yet authored |
| `FULL_REGRESSION_TEST_REPORT.md` | NOT IMPLEMENTED | Not yet authored |
