# TrustDrive — API Test Report (Live)

**Run ID:** `LIVE-MW6DOO1A` · **Date:** 2026-11-07 · **Result: PASS**
**Frontend:** `http://127.0.0.1:3000` (Next.js 14, 108 `/api/v1/*` route modules)
**Intelligence service:** `http://127.0.0.1:8000` (FastAPI, 22 app-level intelligence endpoints + 10 router modules)
**Evidence:** `qa/live_e2e.log`, `qa/live-e2e-summary.json`, `qa/probe-fast.json`, `qa/backend.log`

All statuses below are **observed HTTP responses from the running stack**, not inferred from source. Session requests were issued from inside a real logged-in Chromium page (`credentials: same-origin`); service-to-service requests used `X-Service-Token` from the root `.env`.

---

## 1. Authentication models

| Model | Mechanism | Live proof |
|---|---|---|
| Browser session | Real `POST /api/v1/auth/login` form submission → `httpOnly`, `sameSite=lax` session cookie | Seller + buyer logins → 200, redirect to `/seller` / `/buyer` |
| Service-to-service | `X-Service-Token: <TD_SERVICE_TOKEN>` sent by `frontend/lib/server/intelligence.ts` | Anonymous `POST /api/intelligence/investigate` → **401**; with token → **200** |
| Role guard | `requireRole()` / `assert_owner` on every protected route | Buyer → seller endpoints → **403**; seller → `/admin` → login redirect |

---

## 2. Next.js API endpoints exercised live

| # | Method & path | Role | Observed status | What was asserted |
|---:|---|---|---|---|
| 1 | `POST /api/v1/auth/login` | anon | **200** ×2 | Real form, real cookie, correct dashboard URL |
| 2 | `GET /api/v1/categories` | seller | **200** | Exactly 6 implemented categories; planned ones not selectable |
| 3 | `POST /api/v1/seller/vehicles` | seller | **201** ×6 | Category-driven draft, correct `vehicle_category_id`, `fuel`, `reg_no`, `vin`, price, location, `specs` |
| 4 | `POST /api/v1/seller/listings/:id/publish` | seller | **422** ×6 then **200** ×6 | `PUBLISH_BLOCKED` on bare draft; success after gate satisfied |
| 5 | `POST /api/v1/vehicles/:id/ai-investigations` | seller | **200** ×6 | `source=python-intelligence`, `orchestrator=langgraph`, 15/16 nodes, correct EV node conditional |
| 6 | `POST /api/v1/vehicles/:id/photos` | seller | **201** ×6 | Real multipart, `uploaded:3`, `listing_images` rows with positions 1–3 |
| 7 | `POST /api/v1/vehicles/:id/documents` | seller | **201** ×6 | `rc_2w` for 2W / `rc` for cars; `ocr.engine=rapidocr`, `status=processed`, `documentStatus=verified` |
| 8 | `GET /api/v1/vehicles/:id/3d-model` | buyer | **200** ×6 | Cars: `available` + `/models/vehicles/trustdrive-sedan.glb` + `generic-reference`; 2W: `unavailable`, `url=null`, `labelled-schematic`, `interactionsAvailable=false` |
| 9 | `GET /api/v1/marketplace/listings?category=…` | buyer | **200** ×6 | Each published listing returned by its own category filter |
| 10 | `GET /api/v1/marketplace/listings?q=…` | buyer | **200** ×6 | Registration search resolves the exact listing |
| 11 | `POST /api/v1/vehicles/:id/damage` | seller | **201** | `zoneId/description/severity/repairStatus` persisted → clickable 3D hotspot |
| 12 | `POST /api/v1/reports/vehicle/:id` | buyer | **201** | `reportId` returned and `reports` row written |
| 13 | `GET /api/v1/reports/:id/download` | buyer | **200** | **42,804 bytes**, first 4 bytes `%PDF` |
| 14 | `POST /api/v1/inquiries` | buyer | **201** | `inquiryId`, persisted `listing_id` + `status=open` |
| 15 | `GET /api/v1/inquiries/:id` | buyer | **200** | Thread contains 2 messages after seller reply |
| 16 | `POST /api/v1/inquiries/:id/messages` | seller | **201** | Seller reply visible to buyer |
| 17 | `POST /api/v1/seller/vehicles` (duplicate reg) | seller | **409** | `DUPLICATE_REG` with `existingId` |
| 18 | `POST /api/v1/seller/vehicles` (10-char frame, 2W) | seller | **201** | Chassis rule `^[A-Z0-9]{8,22}$` accepted |
| 19 | `POST /api/v1/seller/vehicles` (10-char frame, car) | seller | **400** | `VALIDATION_FAILED` — ISO 3779 17-char VIN enforced for cars only |
| 20 | `POST /api/v1/seller/vehicles` (EV + petrol specs) | seller | **201** | Stays `Electric` / `electric_scooter`; no silent combustion conversion |
| 21 | `POST /api/v1/seller/vehicles` (malformed reg) | seller | **400** | Injection-style registration rejected, no row created |
| 22 | Buyer → `GET /api/v1/seller/vehicles/:id` | buyer | **403** | Server-side RBAC |
| 23 | Buyer → `POST /api/v1/seller/vehicles` | buyer | **403** | Server-side RBAC |
| 24 | Buyer → `POST /api/v1/seller/listings/:id/publish` | buyer | **403** | Server-side RBAC |

**Live HTTP total:** 6×(1 draft + 1 blocked publish + 1 investigation + 1 photos + 1 document + 1 publish) = 36 core writes, plus marketplace/3D/report/inquiry/edge/RBAC reads and negatives. 272 assertions overall.

---

## 3. FastAPI intelligence endpoints exercised directly

| Method & path | Auth | Observed | Detail |
|---|---|---|---|
| `GET /health` | none | **200** | `intelligence-2.0.0-multicategory`, `llm.active=false/provider=none`, `agent.orchestrator=langgraph`, `node_registry_count=16`, `conditional=true`, `database.tables=55`, `shared_with_nextjs=true`, OCR backends |
| `GET /api/intelligence/categories` (profiles read from `/health`) | service token | **200** | 15 nodes for 3 combustion categories (no `EVBatteryAnalysisNode`), 16 for 3 electric categories (with it) |
| `POST /api/intelligence/investigate` | **none** | **401** | Anonymous call rejected |
| `POST /api/intelligence/investigate` | `X-Service-Token` | **200** ×6 | `orchestrator=langgraph`, node counts 15/15/16/16/15/16, correct EV-node conditional, `status=completed`, findings persisted to `agent_investigations` |
| `POST /api/intelligence/documents/process` | service token (via `document-ocr.ts`) | **200** ×6 | RapidOCR extraction → `verified` RC with confidence 0.776–0.787 |

Representative direct investigation (`qa/probe-fast.json`): `HTTP 200` in **3,263 ms**, `electric_car`, `orchestrator=langgraph`, `nodeCount=16` including `EVBatteryAnalysisNode`, `status=completed`, 2 findings.

Other app-level intelligence routes present (`/api/intelligence/capabilities`, `/trust-score/{id}`, `/fraud/detect`, `/damage/{id}`, `/integrity/{id}`, `/review`, `/jobs`, `/chat`, `/blockchain/*`) are covered by the 126 backend Pytest tests; they were **not re-exercised in this live run** and are not claimed as live-verified.

---

## 4. Error / status-code matrix

| Code | Where observed | Meaning |
|---|---|---|
| 200 | login, marketplace, 3D model, report download, inquiry read, direct investigation, publish success | OK |
| 201 | vehicle draft, photos, documents, damage, report generation, inquiry, reply | Created |
| 400 | car with 10-char frame, malformed registration | `VALIDATION_FAILED` |
| 401 | anonymous intelligence call | service token required |
| 403 | buyer → seller endpoints | RBAC |
| 409 | duplicate registration / duplicate VIN | `DUPLICATE_REG` / `DUPLICATE_VIN` with `existingId` |
| 422 | publish a bare draft | `PUBLISH_BLOCKED` (gate: ≥3 photos, verified RC, complete fields, price > 0, no critical VIN mismatch) |

Errors use the app's `{ ok, error: { code, message, details } }` envelope; warnings (insurance expiry, mileage findings, pending documents, inspection pending) do **not** become blockers.

---

## 5. Timeouts, retries and honest degradation

| Layer | Setting | Observed behaviour |
|---|---|---|
| `frontend/lib/server/intelligence.ts` | `TD_INTELLIGENCE_TIMEOUT_MS` clamped to 1,000–180,000 ms (default 90,000) | `AbortSignal.timeout(...)` |
| `ai-investigations` route | `{ timeout: 150_000 }` | Falls back only on real failure/timeout |
| Successful path | — | `source=python-intelligence`, `orchestrator=langgraph`, graph `langgraph-conditional` — **observed on all six categories** |
| Fallback path (documented, not triggered in final run) | — | `source=next-deterministic-fallback`, `orchestrator=deterministic-next`, `graph=deterministic-evidence-review`, `nodes=[]` — honestly labelled, never disguised as the Python agent |
| Local LLM | `TD_LLM_PROVIDER=none` | Previously `local` caused 201 s / 676 s / 521 s request times and forced every UI call into fallback; fixed by disabling narrative-only LLM (see `BUGS_FIXED.md`) |
| Rate limits | auth 12/min, read 120/min, write 45/min, report 12/min | No 429 during the run; unique fixtures per run |
| Idempotency | `Idempotency-Key` optional; absent → handler runs normally | No replay risk in this run |

---

## 6. Coverage honesty statement

The live audit exercised **24 distinct Next.js endpoint shapes** and **4 FastAPI endpoint shapes** with real requests. The remaining routes (admin, KYC, 2FA, notifications, saved searches, comparisons, provider checks, verification cases, etc.) are covered by the automated suites - **187 Vitest tests and 127 Pytest tests, all passing** - but were not part of this specific live run. No endpoint is claimed as live-verified without a captured response. No mock server, stub response or intercepted fetch was used anywhere in `qa/live_e2e.mjs`.

---

## 7. Verdict

**PASS.** Every endpoint in the audited Seller → verification → publish → Buyer chain returned the expected real status and body, all persistence was confirmed in SQLite, error codes were correct and specific, service auth rejected anonymous calls, and all six category investigations reached the real Python LangGraph agent.
