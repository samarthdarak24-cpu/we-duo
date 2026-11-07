# TrustDrive — Backend / API Test Report

**Date:** 2026-11-07 · **Result: PASS** (all executed API tests passed; external providers remain BLOCKED)
**Next.js API:** 109 route handlers under `frontend/app/api/v1/` (filesystem count, 2026-11-07)
**Intelligence API:** FastAPI on `http://127.0.0.1:8000`
**Shared database:** `.data/trustdrive.db`, SQLite WAL, 55 tables, `user_version=3`

## 1. Test totals

| Suite / run | Result | Evidence |
|---|---:|---|
| Vitest frontend | **187 passed / 187** (15 files) | `npm test` |
| Pytest backend | **127 passed / 127** | `npm run intel:test` |
| Broad live API/back-end checks | **40 / 40 PASS** | `qa/live-e2e-summary.json` |
| Independent API probe | **15 / 15 PASS** | `qa/indep-api.json` |
| Focused six-feature API/DB checks | **49 / 49 PASS** | `qa/live-browser/six_features_results.json` |
| OCR negative API checks | **10 / 10 PASS** | `qa/live-browser/ocr_negative_results.json` |
| Security/RBAC API checks | **13 / 13 PASS** | `qa/live-browser/security_results.json` |
| Independent security API checks | **10 / 10 PASS** | `qa/indep-results.json` |
| TypeScript | **0 errors** | `npx tsc --noEmit` |
| Production build | **52/52 pages generated** | `NEXT_DIST_DIR=.next_verify npm run build` |

## 2. Key Next.js endpoints exercised live

| Method | Endpoint | Expected | Observed | Result |
|---|---|---|---|---|
| POST | `/api/v1/auth/login` | 200 + session cookie | 200; `/seller` / `/buyer` reached | PASS |
| POST | `/api/v1/auth/logout` | 200 + cookie cleared | 200; protected API then 401 | PASS |
| POST | `/api/v1/seller/vehicles` | 201 + vehicle row | 201, six categories | PASS |
| PATCH | `/api/v1/seller/vehicles/[id]` | 200, ownership enforced | 200 owner; 403/404 non-owner | PASS |
| POST | `/api/v1/vehicles/[id]/documents` | 201 + OCR result | 201; `documents.status=verified`; engine `rapidocr` | PASS |
| GET | `/api/v1/vehicles/[id]/documents` | owner/admin full; buyer consented only | 200; 11 items / 0 unconsented for buyer | PASS |
| GET | `/api/v1/documents/[id]` (raw bytes) | owner/admin only | 403 for buyer and other seller | PASS |
| POST | `/api/v1/vehicles/[id]/mileage` | 201 + rollback flag | 201 `{flagged:true}`; `ODOMETER_ROLLBACK` finding | PASS |
| POST | `/api/v1/vehicles/[id]/ai-investigations` | 200, Python agent | 200; `source=python-intelligence`, `orchestrator=langgraph`, 15 nodes, 2 findings / 6 citations | PASS |
| POST | `/api/v1/vehicles/[id]/damage` | 201 + component zone | 201; `front_bumper`; hotspot rendered | PASS |
| POST | `/api/v1/seller/listings` | 200/201 draft | 200; `l-1793989218038` | PASS |
| POST | `/api/v1/seller/listings/[id]/publish` | 422 bare draft; 200 satisfied | 422→200 after photos+verified RC | PASS |
| GET | `/api/v1/marketplace/listings?q=MH12QA7132` | 200 matching listing | 1 item | PASS |
| GET | `/api/v1/vehicles/[id]/3d-model` | category-correct asset | car: `available`, GLB; 2W: `unavailable`, `url=null` | PASS |
| POST | `/api/v1/inquiries` | 201 buyer inquiry | 201; row persisted | PASS |
| POST | `/api/v1/inquiries/[id]/messages` | 201 seller reply | 201; buyer sees 2 messages | PASS |
| POST | `/api/v1/reports/vehicle/[id]` | 201 report row | 201; `status=ready` | PASS |
| GET | `/api/v1/reports/[id]/download` | real PDF | 200 `application/pdf`, 45,266 bytes, `%PDF` | PASS |
| GET | `/api/v1/categories` | 200 six categories | 200, 6 implemented | PASS |
| GET | `/api/v1/public/sample-report` | 200 real demo PDF | 200, 106,834 bytes, demo headers | PASS |

## 3. Python intelligence endpoints

| Method | Endpoint | Auth | Observed | Result |
|---|---|---|---|---|
| GET | `/health` | public | 200 `status=ok`, 55 tables, `shared_with_nextjs=true`, `agent.orchestrator=langgraph`, 16-node registry | PASS |
| GET | `/api/intelligence/capabilities` | service token | anonymous 401; token 200 | PASS |
| GET | `/api/intelligence/categories` | service token | anonymous 401; token 200, 6 categories | PASS |
| POST | `/api/intelligence/investigate` | service token | anonymous 401; token 200 for all six categories, 15/16 conditional nodes | PASS |
| POST | `/api/intelligence/documents/process` | service token | synchronous OCR; RapidOCR / PyMuPDF / OpenCV; real extraction | PASS |

`TD_SERVICE_TOKEN` is sent from Next.js server code only (`frontend/lib/server/intelligence.ts`, `frontend/lib/server/document-ocr.ts`). No service credential is exposed to the browser.

## 4. Validation and business rules

| Rule | Observed |
|---|---|
| Two-wheeler frame `^[A-Z0-9]{8,22}$` | 10-char frame accepted (201) |
| Car VIN `^[A-HJ-NPR-Z0-9]{17}$` | Same 10-char value rejected (400) |
| Duplicate registration | 409 `DUPLICATE_REG` + `existingId`, no duplicate row |
| Malformed/injection-style registration | 400 `VALIDATION_FAILED`, no row |
| EV petrol-field injection | stays `Electric` / EV category; no petrol spec persisted |
| Publish gate | 422 `PUBLISH_BLOCKED` until 3 photos + verified RC + fields + price |
| Document consent | buyer sees only consented docs on a published listing; raw bytes owner/admin only |
| Document OCR failure | `pending`/`needs_correction` with real `status_reason`; never fake verified |
| SQL search metacharacters | treated as text; no injection |

## 5. Build route audit

The production build listed **109 API route handlers** and **52 pages**. Notable route families: auth, seller vehicles/listings, vehicle documents/mileage/damage/history/trust/findings/AI/3D, marketplace, inquiries/messages, reports/download, saved/compare, notifications, verification, admin. The full build output is the authoritative route list for this report.

## 6. Blocked endpoints / integrations

| Capability | Status | Reason |
|---|---|---|
| Government / VAHAN registry | BLOCKED | no authorised credentials/adapter |
| Insurer / theft registry | BLOCKED | no provider credentials; demo source ignored |
| Blockchain anchoring | BLOCKED | not implemented; SHA-256 only proves integrity |
| YOLO photo damage | BLOCKED | weights not wired to upload path |
| Production XGBoost fraud | BLOCKED | model trained on synthetic demo data |
| LLM narrative | BLOCKED | `TD_LLM_PROVIDER=none`; deterministic output used |
| S3 / external AV | BLOCKED | local disk + local signature scan |
| Email/SMS | BLOCKED | no provider configured |
| Postgres split deployment | BLOCKED | Next and FastAPI share the SQLite file |
| PaddleOCR | BLOCKED | not installed; RapidOCR active and labelled |

**Resolved in the final hardening pass:** durable LangGraph checkpoints are now SQLite-backed (`checkpoint_backend=sqlite`, `durable_checkpointing=true`, tables `checkpoints`/`writes`), the rate limiter is stored in the shared `rate_limit_hits` table, trust snapshots are persisted/deduplicated, and signed downloads fail closed in production.

## 7. Final verdict

Every implemented API path exercised in this pass returned the expected status and persisted the expected row. No endpoint was marked PASS solely because it returned HTTP 200: the report ties each result to a response body, a database row and, where applicable, a browser-visible result.

**API result: PASS — 0 failures in executed tests. External-integration paths: BLOCKED / NOT IMPLEMENTED as disclosed.**
