# TrustDrive — Security Test Report

**Run ID:** `LIVE-MW6DOO1A` · **Date:** 2026-11-07 · **Result: PASS (12/12 live negative checks; residual gaps disclosed)**
**Scope:** running Next.js `:3000` + FastAPI `:8000` + shared SQLite, real Chromium, real sessions.
**Evidence:** `qa/live_e2e.log` (security section), `qa/live-e2e-summary.json`, `frontend/lib/server/*`, `backend/app/*`.

> This report supersedes the 2026-11-05 edition. Findings from that earlier pass are preserved in the appendix and remain valid.

---

## 1. Live negative testing — 12/12 PASS

Every check below issued a real request against the running stack; the observed status/body was captured, not inferred.

| # | Test | Expected | Observed | Result |
|---:|---|---|---|---|
| 1 | Seller navigates to `/admin` | blocked | `http://127.0.0.1:3000/login?next=admin` | PASS |
| 2 | Buyer reads a seller-only vehicle endpoint | 403 | **HTTP 403** | PASS |
| 3 | Buyer creates a seller vehicle | 403 | **HTTP 403** | PASS |
| 4 | Buyer publishes a seller listing | 403 | **HTTP 403** | PASS |
| 5 | Anonymous `POST /api/intelligence/investigate` (no `X-Service-Token`) | 401 | **HTTP 401** | PASS |
| 6 | Duplicate registration number | 409 | **HTTP 409 `DUPLICATE_REG`** (+ `existingId`) | PASS |
| 7 | 10-character frame number for a two-wheeler | accepted | **HTTP 201**, `frame=F054427822 (10 chars)` | PASS |
| 8 | Same 10-character value used as a car VIN | rejected | **HTTP 400 `VALIDATION_FAILED`** | PASS |
| 9 | EV draft sent with `engine_number` / `engine_cc` in `specs` | not converted to combustion | **HTTP 201**, stays `Electric` / `electric_scooter` | PASS |
| 10 | Malformed / injection-style registration | rejected | **HTTP 400**, no row created | PASS |
| 11 | Wizard offers exactly the six implemented categories | 6 | `petrol_motorcycle, petrol_scooter, electric_scooter, electric_motorcycle, passenger_car, electric_car` | PASS |
| 12 | Planned categories are not selectable | absent | same six only | PASS |

Also observed as positive-path controls: publish of an unsatisfied draft → **422 `PUBLISH_BLOCKED`** on all six categories; all 12 browser console errors captured in the run were the deliberate `400/403/409/422` rejections above — **0 unexpected errors**.

---

## 2. Authentication and session controls

| Control | Implementation | Verification |
|---|---|---|
| Password hashing / token | scrypt + HS256 bearer/JWT; `current_user` re-reads the live user row and rejects token/role drift | Real form login → 200 + session; earlier live proof (appendix) |
| Session cookie | `httpOnly`, `sameSite: "lax"`, `secure` in production | Session persisted across buyer/seller flows; `sessions` rows in SQLite |
| Protected routes | `requireRole()` + `assert_owner` server-side on every `/api/v1/*` route | 4 live RBAC checks above |
| Soft delete | `users.deleted_at`, `documents.deleted_at`; login/sessions/reads exclude deleted rows | Suite-covered; `document_extractions` retains evidence history |
| Logout / refresh / sessions | `/auth/logout`, `/auth/refresh`, `/me/sessions` | Suite-covered by 187 Vitest / 127 Pytest tests |
| Idempotency | `Idempotency-Key` header optional; absent → handler runs once (`idempotency.ts`) | No replay anomaly in the run |

---

## 3. Service-to-service authentication

`frontend/lib/server/intelligence.ts` sends `X-Service-Token` (from root `.env`) to the Python service; `frontend/lib/server/document-ocr.ts` does the same for `/api/intelligence/documents/process`.

- Anonymous investigation call → **401** (live).
- With token → **200** on all six categories (live), with real 15/16-node LangGraph execution.
- No service credential is exposed to the browser: all Python calls are made from Next.js server routes.

---

## 4. Input validation and business-rule integrity

| Rule | Where enforced | Live proof |
|---|---|---|
| Two-wheeler chassis/frame `^[A-Z0-9]{8,22}$` | `validateIdentity()` | 10-char frame → 201 |
| Car VIN `^[A-HJ-NPR-Z0-9]{17}$` | `validateIdentity()` | same 10-char value → 400 |
| No universal VIN rule | category profile + OCR `CHASSIS_RE` | both checks in the same run; RC OCR compares `chassis_number` for 2W and `vin` for cars |
| Registration format | `createVehicleDraft()` | malformed/injection-style → 400, no row |
| Duplicate `reg_no` / `vin` | DB + `DUPLICATE*` codes → 409 | 409 with `existingId` |
| Publish gate | `publishGate()` | 422 → 200 transition on six categories |
| EV powertrain integrity | `fieldsForCategory()` / `createVehicleDraft()` | injected petrol specs do not change `fuel` or `categoryId` |
| Taxonomy boundary | `implementedCategories` in `vehicle-categories.json` | planned categories not offered |

SQL injection: all queries use parameterised `db.read`/`list_rows`/SQLAlchemy bound parameters; no string concatenation of user input was found. The injection-style registration returned 400 with no row created.

XSS: React escapes by default; no `dangerouslySetInnerHTML` on untrusted content. CSRF: `sameSite=lax` cookies plus same-origin fetch.

---

## 5. Upload, file and output controls

| Control | Detail | Verification |
|---|---|---|
| Magic-byte sniffing | Uploads validated by real content, not just extension | 18 real PNG uploads accepted (3 photos ×6) + 6 RC images |
| Malware scan | `lib/server/scan.ts` local signature + heuristics (EICAR, PDF JS/Launch, Office macros, MZ), reports `local-signature-v1`; external AV only when `TD_MALWARE_SCAN_URL` set | Suite-covered |
| Private storage + SHA-256 | `documents.sha256`, `workflow` step 2 private path, step 3 digest | Read back from SQLite for all six RCs |
| Consent filter | `documents.consent = 1`; workflow step 17 "consent-filtered summary only; source file stays private" | Read back from SQLite |
| Signed download URLs | HMAC scope + id + exp (`lib/server/signed.ts`); **fails closed** without a configured secret in production; local `TD_ENV=local` keeps the demo working | PDF download returned real `%PDF` bytes (42,804); `signed.test.ts` tamper/expiry coverage |
| QR token revocation | `vehicles.qr_token`; public `/verify/:token` honours revocation | Suite-covered |
| Rate limiting | `LIMITS`: auth 12/min, read 120/min, write 45/min, report 12/min; **shared `rate_limit_hits` sliding window** with in-memory fallback; FastAPI `enforce_auth_limit` | `ratelimit.test.ts` 3/3; live 13th login returns 429 with `Retry-After` |
| Audit trail | `audit_logs` (198 rows), `sessions` (413), `idempotency_keys` (6) | SQLite read-back |

---

## 6. Honest degradation — no fabricated conclusions

- When the Python agent is unreachable or times out, the app returns `source: "next-deterministic-fallback"`, `orchestrator: "deterministic-next"`, `graph: "deterministic-evidence-review"`, `nodes: []` — **never** disguised as the real agent.
- With `TD_LLM_PROVIDER=none`, `backend/app/llm.py` returns an evidence-only answer with the explicit reason: *"No conclusion was fabricated."* Findings and trust score come from the deterministic 15/16-node LangGraph graph, not an LLM.
- OCR results carry the disclaimer: *"Extracted values are machine-read text, not proof that the document is genuine. OCR extraction is not verification of authenticity."*
- The car 3D model is labelled `generic-reference` / `vehicleSpecific: false`; two-wheelers report `unavailable` rather than silently substituting the sedan GLB.

These are security-relevant honesty controls: the system never presents a simulated result as a verified one.

---

## 7. Residual gaps (disclosed, not defects in exercised scope)

1. **Rate limiting is shared through SQLite inside one deployment.** A split PostgreSQL/PostgREST deployment must move `rate_limit_hits` to Redis or the gateway; the contract does not change. (Previously “in-process only”, now fixed for the shared-DB deployment.)
2. **Download signing is fail-closed.** `DOWNLOAD_SIGNING_SECRET`/`QR_SIGNING_SECRET` must be configured in production; the local demo explicitly runs with `TD_ENV=local`. Rotation: deploy the new secret everywhere, keep the old one only for the 15-minute token TTL, then remove it.
3. **External integrations are demo/local adapters** — vehicle registry, insurance, theft/provider checks, blockchain anchoring. No live third-party verification or anchoring is claimed.
4. **LLM narration disabled** (`TD_LLM_PROVIDER=none`) because the local 1.5B CPU model took 201–676 s per request. The verification graph still runs fully; only narrative rewriting is off. See `BUGS_FIXED.md` F1.
5. **Not re-exercised live in this run:** 2FA, KYC, password reset, admin dispute resolution, notification endpoints, saved-search permissions. Covered by the 187 Vitest / 127 Pytest suites, but not claimed as live security verification here.
6. **Fixed in the independent retest:** the public `/vehicle/[id]` header showed "Sign in" to an already authenticated buyer; it now shows "My workspace". No authorisation impact, visual design preserved (`BUGS_FIXED_AND_RETESTED.md` B2).
7. **Anonymous demo-workspace shells:** `lib/server/session.ts` falls back to seeded demo accounts when no session cookie exists, so anonymous visitors can view portal shells scoped to the demo user; the “demo workspace” label now renders only while `TD_SEED_DEMO` is active. Every write API still returns 401. Disable demo fallback in production (`TD_SEED_DEMO=0`).

---

## 8. Verdict

**PASS.** Server-side RBAC, service-token gating, input validation, duplicate/malformed-input rejection, category-specific identity rules, upload controls and honest fallback labelling were all proven against live requests. No broken authentication, IDOR, missing authorisation, SQL-injection sink or fabricated verification result was found in the exercised paths.

---

## 9. Final focused + independent retest (2026-11-07)

### Focused RBAC / consent — 13/13 PASS (`qa/live-browser/security_results.json`)

| Check | Observed |
|---|---|
| Anonymous seller API | 401 |
| Buyer blocked from seller APIs, vehicle create, publish | 403 |
| Unpublished document list | 403 |
| Buyer document view | consented only (11 items, 0 unconsented) |
| Second seller document access | 403 |
| Raw document bytes | 403 for buyer/other seller |
| Consented metadata | 200 |
| Other seller extraction | 403 |
| Other buyer inquiry | 403 |
| SQL metacharacter search | safe, treated as text |

### Independent security — 10/10 PASS (`qa/indep-results.json`)

Seller A cannot read/mutate Seller B's vehicle (404/403), own vehicle 200; buyer cannot create a vehicle or read admin audit (403); anonymous private-document URL 403; anonymous buyer overview 401; Buyer B cannot read Buyer A's inquiry 403.

### API auth probe — 15/15 PASS (`qa/indep-api.json`)

`/health` 200; service-token endpoints 401 anonymous / 200 authenticated; protected Next APIs 401; private report download 403; public demo PDF 200 with demo headers.

**Final security verdict: PASS** for exercised paths. Remaining risks are deployment hardening (split-deployment rate-limit store, demo fallback, external providers), not broken authorization.

---

## 10. Final hardening security retest (2026-11-07)

| Control | Change | Evidence |
|---|---|---|
| Shared rate limiter | `rate_limit_hits` table; `BEGIN IMMEDIATE` count/insert; bounded cleanup; memory fallback only on DB failure | `ratelimit.test.ts` 3/3 (429, `Retry-After`, persisted rows, bucket/IP isolation) |
| Signed downloads | Production lockout without a secret; dev fallback needs `TD_ENV=local`; constant-time signature compare | `signed.test.ts` 4/4 (round-trip, tamper, malformed, expiry) |
| Trust integrity | Snapshots are immutable and deduplicated; `computed_by` recorded; no client/LLM value accepted | `db-intelligence.test.ts` update/delete triggers still abort |
| Test isolation | Tests no longer read or write the live `.data/trustdrive.db` | `tests/setup-db.ts`; 187/187 deterministic rerun |
| Fresh-database integrity | FK rebuild drops/recreates views; orphan inserts now fail | fresh seeded DB; `FOREIGN KEY constraint failed` |

---

## Appendix — prior pass (2026-11-05), retained for continuity

- scrypt + HS256 auth; live valid login → 200 + token; missing token → 401; buyer on seller-only `POST /api/v1/vehicles` → 403.
- Non-owner inquiry access → 403; buyers cannot see another seller's drafts (`leaked = 0`).
- Parameterised SQL, React escaping, `httpOnly`/`sameSite=lax` cookies, soft deletes, rate limits on 13 Next routes, HMAC-signed download URLs, local malware scanning, magic-byte validation, QR revocation.
- Verdict then: server-side permission enforcement is real; no broken auth, IDOR or missing RBAC in exercised paths.
