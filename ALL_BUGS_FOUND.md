# TrustDrive — Complete Bug Register (All Passes)

**Created:** 2026-11-07 · **Scope:** every defect, test-harness failure, residual risk and blocked capability found across the full audit programme (2026-11-05 → 2026-11-07).
**Method:** real Chromium browser sessions, real API requests, read-only SQLite assertions, Vitest/Pytest, `tsc --noEmit` and a production build. No bug below was hidden with a mock, an empty success response or a hardcoded status.

> This is the consolidated bug list requested before any other report work. The detailed per-pass reports remain available in `BUGS_FIXED.md`, `BUGS_FOUND_AND_FIXED.md`, `BUGS_FIXED_AND_RETESTED.md`, `BUGS_FOUND.md` and `BUGS_AND_GAPS.md`.

---

## 1. Summary

| Classification | Count |
|---|---:|
| Product/application defects found and fixed | **47** |
| Cosmetic false positive investigated (not reproducible, not an app defect) | **1** |
| Test-harness / test-suite / tooling defects fixed | **18** |
| Residual open risks (not release-blocking for a single-host demo) | **6** |
| Blocked external integrations / deliberately unimplemented capabilities | **13** |
| **Total items recorded** | **85** |

**Zero known product defects remain open from the exercised paths.** The blocked and residual items are disclosed, labelled and never presented as working. The final hardening pass additionally closed the trust-history, rate-limit, signed-download, fresh-database and demo-labelling gaps and made LangGraph checkpoints durable.

---

## 2. Product/application defects found and fixed (38)

| # | Defect | Severity | Area | Status | Retest evidence |
|---:|---|---|---|---|---|
| 1 | Homepage used a looping video hero instead of the required pinned scrollytelling sequence | Medium (design mismatch) | Public UI | FIXED | Page render inspection |
| 2 | Contact form presented a fake success with no backend write | Critical (fake result) | Public UI / API | FIXED | `POST /api/v1/contact` + `contact_messages` rows |
| 3 | Newsletter form faked a subscription | Critical (fake result) | Public UI / API | FIXED | `POST /api/v1/newsletter` + idempotent `newsletter_subscribers` |
| 4 | `/admin/notifications` and `/admin/settings` were dead links | Medium | Admin UI | FIXED | Both pages render on `PortalShell portal="admin"` |
| 5 | Sidebar promo CTA pointed at `/buyer/verify` → 404 | Medium (broken action) | Buyer UI | FIXED | Corrected to `/buyer/verification` |
| 6 | Buyer history defaulted to a zero-event vehicle | Low (misleading empty state) | Buyer UI | FIXED | Defaults to first listing with stored events |
| 7 | AI endpoints returned HTTP 500 because `next dev` and `next start` shared one `.next`; later two `next dev` processes corrupted the webpack manifest (missing `lucide-react.js`, 404 client chunks, 500 on `/vehicle/[id]` and `/print/report/[id]`) | Critical | Build/runtime | FIXED | One server + isolated `NEXT_DIST_DIR`; 40/40 authenticated pages 200, 0 JS exceptions |
| 8 | `tsc` failed with ~31 errors from the co-located `precedent/` Vite app | Medium (build) | Tooling | FIXED | `"exclude": ["node_modules", "precedent"]`; `tsc --noEmit` clean |
| 9 | Seller Listing Features action bar exposed only 3 of 8 required actions | Medium (incomplete UI) | Seller UI | FIXED | All 8 actions wired; RTL test `listing-action-bar.test.tsx` |
| 10 | 9 of 24 required data entities were missing | High (schema gap) | Database | FIXED | 51 tables at that pass, now 55 tables + 5 views, real FKs/triggers |
| 11 | No ER diagram and no Alembic migration baseline | Low (delivery) | Documentation/DB | FIXED | `docs/ERD.md`, `docs/ER_DIAGRAM.md`, Alembic baseline |
| 12 | Document intelligence was only 3 steps deep — uploads were hashed but never read | Critical (fake verification risk) | OCR pipeline | FIXED | Real 18-step workflow with OCR, extraction, duplicate/expiry/confidence/review persistence |
| 13 | No ML anomaly detector or explainability object | Medium (missing capability) | Intelligence | FIXED | Deterministic rules + Isolation Forest/LOF; findings carry method, version, confidence, evidence |
| 14 | No LangGraph agent, no checkpointing, no human-in-the-loop queue | High (missing capability) | Intelligence | FIXED | LangGraph 0.4.10, 15/16-node conditional graph, human review; durable checkpoints still blocked |
| 15 | Vehicle 3D viewer used a primitive `<boxGeometry>` car, explicitly forbidden | High (design rule 13) | 3D viewer | FIXED | Real licensed GLB loaded via GLTFLoader |
| 16 | Only 3 vehicles seeded and no reset command | Low (demo readiness) | Seed | FIXED | 13 seeded vehicles then full demo inventory; `npm run seed:reset` |
| 17 | No drift-detection endpoint for stored file hashes | Medium (integrity) | Intelligence/API | FIXED | `GET /api/intelligence/integrity/:vehicleId`; missing files reported unavailable |
| 18 | No background job infrastructure | Medium (operations) | Worker | FIXED | DB-backed `background_jobs` worker with retries, timeouts, idempotency, progress |
| 19 | No Python runtime, FastAPI service or OpenAPI schema | High (missing runtime) | Backend | FIXED | FastAPI + Pydantic v2 + SQLAlchemy + Alembic + `/openapi.json` |
| 20 | Only 4 Vitest files; no RTL, Playwright or Pytest coverage | Medium (test gap) | Tests | FIXED | RTL component tests, Playwright spec, 10 Pytest modules; final 179 Vitest + 126 Pytest |
| 21 | No Dockerfile, Compose file or CI workflow | Medium (delivery) | DevOps | FIXED (files) | Files added; Docker build not executed because the daemon was unavailable |
| 22 | `IMPLEMENTATION_STATUS.md` was stale and factually wrong | Low (documentation honesty) | Docs | FIXED | Rewritten against the live schema and final test evidence |
| 23 | Python service exposed intelligence only, not the required backend route families | High (backend coverage) | Backend | FIXED | Full `/api/v1/*` + `/api/backend/*` route families; 137 OpenAPI paths at that pass |
| 24 | Local 1.5B LLM loaded synchronously inside the request path: investigations took 201 s / 676 s / 520 s and always timed out into fallback | High (latency + honesty) | AI investigation | FIXED | `TD_LLM_PROVIDER=none`; direct investigation 3,263 ms; `orchestrator=langgraph`; narrative LLM remains blocked |
| 25 | React hydration warning on the Buyer dashboard `Topbar` search input | Low (cosmetic) | Frontend | FIXED | `suppressHydrationWarning` on that input only; broad run 0 unexpected console errors |
| 26 | Document upload wrote `pending` but never ran OCR; the UI implied verification was queued | Critical (fake-success risk) | Seller documents / OCR | FIXED | Real `document-ocr.ts` → FastAPI bridge; 8–9 extraction rows persisted; focused 11/11; 6/6 categories |
| 27 | AI investigation always returned the Next deterministic fallback even when Python was healthy | High (unused real agent) | AI investigation | FIXED | Python-first route, persisted `ai_runs`; 9/9 focused; 6/6 categories; honest fallback label only on failure |
| 28 | A demo-labelled theft row was treated as a clean provider check | High (false assurance) | Verification/honesty | FIXED | Demo sources ignored; missing checks `unavailable`/`pending`; theft never `verified` without a real provider |
| 29 | Marketplace `q` search did not match registration number, VIN or TrustDrive ID | Medium (search gap) | Marketplace | FIXED | Search by `MH12QA7132` returns the listing; SQL metacharacters treated as text |
| 30 | Buyer/other seller could see private document metadata; raw bytes were not consistently owner/admin-only | High (authorisation) | Documents/RBAC | FIXED | Buyer sees only consented docs of a published listing; other seller 403; raw bytes owner/admin only; 13/13 security checks |
| 31 | Duplicate RC uploads were re-verified with no duplicate marker | Medium (data quality) | OCR/documents | FIXED | Hash/history duplicate detection → `needs_correction`, `duplicate_of` set; negative suite 10/10 |
| 32 | 3D viewer used the sedan GLB for every category, including scooters and motorcycles | High (design rule 13) | 3D viewer | FIXED | `assetUrl:null` for 2W; labelled schematic; interactions disabled; 4/4 2W live checks |
| 33 | `app/vehicle/[id]/page.tsx` passed an invalid `style` prop to `Icon` | Medium (typecheck) | Frontend | FIXED | Invalid prop removed; `tsc --noEmit` clean |
| 34 | 3D hotspot buttons lacked accessible names and model/damage fetches could race | Medium (a11y/correctness) | 3D viewer | FIXED | `aria-label` with damage count; viewer waits for DB hotspots; live hotspot click verified |
| 35 | Public “Download Real PDF” CTA returned `403 JSON` instead of a PDF | High (broken visible action) | Public marketing | FIXED | Public demo-only sample-report endpoint; 200, real 106,834-byte `%PDF`, demo headers; private report still 403 anonymous |
| 36 | Public vehicle page showed “Sign in” to an already authenticated buyer | Medium (session UX) | Public header | FIXED | Shows “My workspace” when a session exists; visual design preserved |
| 37 | Offline “Live stack” section showed 7 green “active” dots while the intelligence service was unreachable | High (evidence honesty) | Public technology page | FIXED | Offline rows `off`, labelled “documented build, not live status”; 0 green dots |
| 38 | Seller `publish()` read `listingId` from a stale React closure immediately after setting it, so a fresh draft could fail to publish on first click | Medium (latent) | Seller wizard | FIXED | Local id assigned before publish; server gate authoritative; typecheck + wizard regression |
| 39 | Hydration warning on the `DocumentsManager` file input (“Extra attributes from the server: style”) | Cosmetic | Seller documents | NOT REPRODUCIBLE | SSR source emits no `style` attribute; browser autofill/extension injects it pre-hydration; not counted as an app defect |

### 2b. Defects found and fixed in the final hardening pass (40–48)

| # | Defect | Severity | Area | Status | Retest evidence |
|---:|---|---|---|---|---|
| 40 | Trust score was computed on read but never persisted, so `trust_scores` (append-only history) stayed empty for normal vehicles | Medium (missing persistence) | Trust / database | FIXED | `ensureTrustScoreSnapshot()` writes a deduplicated immutable row from the trust route and after every verification run; `computed_by` recorded; history returned by the API; unit test proves append + dedupe + immutability |
| 41 | Per-IP rate limiting lived only in a process-local `Map`, so a restart or a second Next.js process doubled every allowance | Medium (security hardening) | API / database | FIXED | Shared `rate_limit_hits` table with an atomic `BEGIN IMMEDIATE` sliding window; in-memory fallback only when the DB is unavailable; `ratelimit.test.ts` proves 429, `Retry-After` and persisted rows |
| 42 | Signed download tokens silently fell back to a public development secret, so a production deployment without `DOWNLOAD_SIGNING_SECRET` accepted forgeable tokens | High (security) | Reports / files | FIXED | Fail closed unless a secret is configured (local `TD_ENV=local` keeps the demo working); `downloadSigningConfigured()` + `signed.test.ts` round-trip, tamper and expiry coverage |
| 43 | Fresh-database boot aborted the foreign-key rebuild with `no such table: main.documents` / `error in view …`, leaving core tables without FKs | High (fresh install / integrity) | Database schema | FIXED | `schema-fk.ts` drops and recreates every view around the 12-step table rebuild; fresh seeded DB now rebuilds all 29 tables and enforces `FOREIGN KEY constraint failed` |
| 44 | The sidebar/topbar always printed “demo workspace”, even when `TD_SEED_DEMO=0` produced a non-demo deployment | Low (honesty/labelling) | Shared UI | FIXED | `PortalShell` passes `demo={process.env.TD_SEED_DEMO !== "0"}`; label only renders while demo seeding is active |
| 45 | Root `.env` contained `TD_INTELLIGENCE_URL` twice | Low (configuration hygiene) | Configuration | FIXED | Single key at line 12; duplicate-key scan over all lines returns no duplicates |
| 46 | `POST /api/v1/reports/vehicle/:id` mapped every failure to HTTP 404, so an invalid report type returned `VALIDATION_FAILED` with a Not-Found status | Low (API contract) | Reports | FIXED | Failure map `NOT_FOUND→404, FORBIDDEN→403, else 400`; live check returns **400** for `"type":"full"` and **201** for a valid type |
| 47 | FastAPI failed to boot after the lazy-signing-secret refactor: `routers/marketplace.py` and `test_security_regression.py` still imported the removed `SECRET` constant (`ImportError: cannot import name 'SECRET'`) | High (startup) | Intelligence boot | FIXED | `security.py` exposes a public `signing_secret()` accessor; marketplace and tests updated; `import app.main` succeeds and live `/health` returns 200; backend suite **127/127** |
| 48 | An expired, tampered or wrong-scope report download token returned `403 FORBIDDEN — "This report belongs to another account"`, misdiagnosing a broken link as an ownership problem | Low (honesty/UX) | Reports / files | FIXED | A presented-but-invalid `token` now returns `403 DOWNLOAD_LINK_INVALID — "This download link is invalid or has expired. Request a new link."`; no-token anonymous access keeps the ownership message |

---

## 3. Test-harness, test-suite and tooling defects fixed (15)

These were **false failures or environment problems**, not product defects. They were corrected by fixing the harness rather than weakening an assertion.

| # | Harness/test defect | Effect | Fix | Retest |
|---:|---|---|---|---|
| H1 | Label regex did not match the real “Engine number” wizard label | 22/23 false failure in a single-category smoke run | Corrected the assertion to the real label | 23/23 |
| H2 | Damage request sent wrong field names | 400 false failure and cascading 3D failure | Use `zoneId / description / severity / repairStatus` | 201 + visible hotspot |
| H3 | Playwright `Response.status` read as a property, not called | 3 false failures (PDF, inquiry, reply) | `pdfRes?.status()` etc. | All 201 |
| H4 | Hardcoded 10-character frame fixture collided with an earlier run | 409 `DUPLICATE_VIN` masked the rule under test | Run-unique `uniqueShortFrame()` | Frame accepted 201 for 2W, 400 as car VIN |
| H5 | Four incorrect initial assertions in the new regression suite | 4 failures in `live-audit-regressions.test.ts` | Correct import, blocker count and asset-note regex | 51/51, full 179/179 |
| H6 | Multicategory test assumed the default 12-item page covered all two-wheelers | 1 failure after the live DB reached 18 two-wheelers | Request `pageSize: 48`; assertion unchanged | 179/179 |
| H7 | Evidence collector read `documents.uploaded_at`, which does not exist | Harness error while collecting evidence | Use real `created_at` | Evidence summary regenerated |
| H8 | Independent harness used a buyer account as “seller2” | Cross-seller security setup failed | Use real second seller `weduo@trustdrive.dev` | Security 10/10 |
| H9 | Independent harness read `documents.storage_key`, which does not exist | Harness error in security phase | Use real `file_key` column | Security 10/10 |
| H10 | Submit clicked before React hydrated caused a native form GET | Login phase 10/13 | `hydrate()` waits for a React fiber + real `waitForResponse` | Auth 13/13 |
| H11 | “Sign out” clicked while inside a collapsed `<details>` menu | Logout false failure | Open `details > summary` first, then assert backend logout/cookie/401 | Auth 13/13 |
| H12 | API probe expected service-token endpoints to be public | False failures on `/capabilities` and `/categories` | Assert anonymous 401 **and** authenticated 200 | API probe 15/15 |
| H13 | CTA locator still searched for `/download` after the public-PDF fix | Probe could not find the new CTA | Locate by accessible name `/sample PDF/i` | 15/15 |
| H14 | Stale committed `tsconfig.tsbuildinfo` produced spurious type errors | Misleading `tsc` failures | Delete cache; keep `*.tsbuildinfo` gitignored | 0 errors |
| H15 | Playwright browsers missing / Next server not kept resident in an earlier sandbox | Live suite could not run | Installed Chromium; one resident server with isolated dist dir | Broad 272/272, focused 49/49 |
| H16 | Vitest database suites wrote into the live `.data/trustdrive.db`, so test rows leaked into the QA inventory and created non-deterministic collisions | Random 401/409 failures on reruns | `tests/setup-db.ts` redirects `TD_DB_FILE` before any module import and defaults to a fresh seeded database; `TD_TEST_SNAPSHOT_LIVE=1` opts into a `VACUUM INTO` snapshot | 187/187, clean rerun |
| H17 | Backend checkpoint tests would have written the durable thread into the developer's live checkpoint file | Test isolation | `conftest.py` sets `TD_CHECKPOINT_DB`/`TD_CHECKPOINT_BACKEND` inside the per-run temp directory | 127/127, checkpoint tables created under `%TEMP%` |
| H18 | Trust-history assertion compared a paginated 20-row response with the full count | False failure in `db-intelligence.test.ts` | Request the explicit `1000` limit used by the assertion | 17/17 in that file |

---

## 4. Residual open risks (10)

| # | Risk | Status | Impact / recommendation |
|---:|---|---|---|
| R5 | Malware scanning is local signature + heuristics, not a full antivirus engine | OPEN | `local-signature-v1`; external AV only when `TD_MALWARE_SCAN_URL` is configured. |
| R6 | Exploded/reassembly 3D view is limited by merged-mesh GLBs | OPEN (asset limitation) | Component highlighting uses stable hotspot IDs mapped to DB damage records. |
| R7 | Anonymous demo-workspace fallback renders portal shells | OPEN (must disable in production) | Scoped to seeded demo user and labelled “demo workspace” only while `TD_SEED_DEMO` is active. Set `TD_SEED_DEMO=0` for production. |
| R9 | Docker build was not executed | NOT RUN | Docker daemon unavailable in this environment; CI should own the image build. |
| R10 | Playwright browser binaries are not guaranteed in CI | OPEN (CI) | CI must run `npx playwright install --with-deps chromium` before live tests. |

**Closed in the final hardening pass:** R1 (global test-DB isolation), R2 (persisted trust snapshots), R3 (DB-backed rate limiting with memory fallback), R4 (fail-closed signing + documented rotation), R8 (duplicate `.env` key). See defects 40–47 and H16–H18.

---

## 5. Remaining blocked integrations and deliberately unimplemented capabilities (13)

These are **not hidden bugs**. They are missing credentials, infrastructure or licensed assets, and every affected screen/payload is labelled honestly.

| # | Capability | Status | Honest behaviour |
|---:|---|---|---|
| B1 | Government / VAHAN registry lookup | BLOCKED | No authorised credentials/adapter; result `unavailable`, never “verified”. |
| B2 | Insurer claim lookup | BLOCKED | No provider credentials; demo source ignored. |
| B3 | Theft registry lookup | BLOCKED | No provider credentials; missing data shown as unverified coverage, not fraud. |
| B4 | Blockchain anchoring | BLOCKED | Not implemented; local SHA-256 proves file integrity only, not authenticity or on-chain existence. |
| B5 | YOLO photo-damage detection end-to-end | BLOCKED | Adapter/weights present, but the upload→detection flow is not wired/tested; damage records are human-entered. |
| B6 | Production XGBoost fraud classifier | BLOCKED | Model trained on `synthetic-demo` data; demo-labelled, not production fraud detection. |
| B7 | LLM narrative generation | BLOCKED | `TD_LLM_PROVIDER=none`; deterministic evidence-only output; no invented conclusion. |
| B8 | S3-compatible object storage / external antivirus | BLOCKED | Local private disk + local signature scan only. |
| B9 | Email / SMS delivery | BLOCKED | In-app notifications only; no provider configured. |
| B10 | PostgreSQL split deployment | BLOCKED | Next.js and FastAPI share one SQLite file; migration not performed. |
| B12 | PaddleOCR engine | BLOCKED | Not installed; `/health` reports `paddleocr=false`; RapidOCR is active and labelled. |
| B13 | Moped, electric bike, three-wheeler, SUV/hatchback/MUV, hybrid and commercial categories | NOT IMPLEMENTED | Not selectable in the wizard; no taxonomy profile or half-built rows. |
| B14 | Vehicle-specific 3D scan geometry | NOT IMPLEMENTED | Cars use a labelled generic GLB; two-wheelers use a labelled schematic, never a fake car model. |

**B11 (durable LangGraph checkpoints) is now implemented, not blocked.** `langgraph-checkpoint-sqlite` persists each investigation thread to `.data/langgraph-checkpoints.db` (tables `checkpoints`/`writes`), and `/health` plus every investigation payload truthfully reports `checkpoint_backend: "sqlite"` and `durable_checkpointing: true`. A slim deployment without the package reports `memory` and `durable_checkpointing: false` instead of claiming durability.

---

## 6. Critical bug details (the ones that mattered most)

### 6.1 OCR was not actually connected (product defect #26)

**Before:** the upload route stored the file and set `documents.status="pending"`; no OCR job ran, while the UI implied verification was in progress.
**Root cause:** there was no Next → Python OCR bridge in the upload path.
**Fix:** `frontend/lib/server/document-ocr.ts` calls FastAPI `POST /api/intelligence/documents/process` with the service token, persists `documents.extracted`, `documents.status`, `verified_at` and `document_extractions`, and returns `engine` / `method` / `confidence` / `flags`.
**Failure behaviour:** if the service is unavailable, the document stays `pending` with a real `status_reason`; it is never auto-verified.
**Retest:** focused OCR 11/11; six categories 6/6; negative inputs 10/10 (`qa/live-browser/ocr_negative_results.json`).

### 6.2 AI investigation ignored the real agent (product defect #27)

**Before:** the Next route returned only its deterministic review even when Python was healthy.
**Fix:** Python-first call; response carries `orchestrator`, `nodes`, `human_review`, `model_versions`, `limitations`; fallback is explicitly labelled `next-deterministic-fallback` / `deterministic-next`.
**Retest:** 9/9 focused; 6/6 categories; `ai_runs.graph=langgraph-conditional`; 15 combustion / 16 EV nodes.

### 6.3 Private documents were over-exposed (product defect #30)

**Before:** a buyer or another seller could list document metadata and raw bytes were not consistently owner/admin-only.
**Fix:** buyer sees only consented documents of a published listing; other seller 403; owner/admin full list; raw bytes owner/admin only.
**Retest:** focused security 13/13 and independent security 10/10, including 0 unconsented items and 403 on raw bytes.

### 6.4 Fake 3D vehicle for two-wheelers (product defect #32)

**Before:** every category loaded the sedan GLB.
**Fix:** category asset policy returns `url:null` for two-wheelers; the viewer renders a labelled schematic and disables interactions. Cars keep the real GLB with a `generic-reference` provenance label.
**Retest:** all six category pages; 4/4 two-wheeler checks; no car geometry or car text on two-wheeler pages.

### 6.5 Corrupted Next.js build manifest (product defect #7)

**Before:** two `next dev` processes wrote the same `.next`; the `lucide-react` vendor chunk disappeared; `/vehicle/[id]` and `/print/report/[id]` returned 500 and all client chunks 404'd.
**Root cause:** exactly the failure mode prohibited by `AGENTS.md` §6.
**Fix:** one server, isolated `NEXT_DIST_DIR` directories (`.next_qa`, `.next_independent`, `.next_verify`); corrupted cache archived, not silently deleted.
**Retest:** 40/40 authenticated pages 200, 0 JS exceptions, 0 unexpected console errors.

### 6.6 Demo theft treated as a clean check (product defect #28)

**Before:** a demo-labelled theft row counted as a clean provider check.
**Fix:** demo/mock/sample sources are ignored for conclusions; missing checks are `unavailable`/`pending`; theft can never be `verified` without a real provider.
**Retest:** honesty checks in the live run, insights and alert tests.

### 6.7 Trust history was computed but never stored (product defect #40)

**Before:** `GET /api/v1/vehicles/[id]/trust` computed the deterministic score on every request; `trust_scores` stayed empty unless a test inserted a row, so “score history” had no real product history.
**Fix:** `ensureTrustScoreSnapshot()` writes an append-only row with the trust version, category weights, finding breakdown, unverified document list, coverage, method and `computed_by`. Identical re-computations deduplicate; a real evidence change appends a new immutable row (UPDATE/DELETE triggers still abort).
**Retest:** `db-intelligence.test.ts` proves create → dedupe → history length, the trust route returns `snapshot` + `history`, and a verification run persists the resulting score.

### 6.8 A production download secret could be forged (product defect #42)

**Before:** `signed.ts` fell back to the committed development string whenever `DOWNLOAD_SIGNING_SECRET`/`QR_SIGNING_SECRET` were absent — including under `next start` production.
**Fix:** the module now fails closed in production (no token minted or accepted, `downloadSigningConfigured()` false); the development fallback is allowed only when `NODE_ENV !== "production"` or `TD_ENV=local` is explicitly set. Rotation procedure: issue the new secret, deploy it to every Next.js instance, keep the old value only for the token TTL (15 min), then remove it; tokens are stateless HMACs, so no stored data is re-encrypted.
**Retest:** `signed.test.ts` covers round-trip, tamper, malformed, expiry and path encoding; live report download still returns a real PDF under the local demo configuration.

### 6.9 Rate limits could be doubled by a restart (product defect #41)

**Before:** the sliding window lived in a module-level `Map`; a restart or a second process reset every allowance.
**Fix:** hits are counted in the shared `rate_limit_hits` table inside `BEGIN IMMEDIATE`, with bounded cleanup and the same 429/`Retry-After` contract. The in-memory map remains only as a fallback when the database is unavailable; a split PostgreSQL deployment must move the table to Redis/gateway.
**Retest:** `ratelimit.test.ts` proves the 429 boundary, header, persisted row count and bucket/IP independence; the live login bucket is verified below.

---

## 7. Evidence index

| Evidence | Path |
|---|---|
| Broad live run — 272/272 checks, 6/6 categories | `qa/live-e2e-summary.json`, `qa/live_e2e.log` |
| Focused six-feature run — 49/49 checks | `qa/live-browser/six_features_results.json` |
| OCR negative paths — 10/10 | `qa/live-browser/ocr_negative_results.json` |
| Focused RBAC/consent — 13/13 | `qa/live-browser/security_results.json` |
| Independent security — 10/10 | `qa/indep-results.json` |
| Independent API probe — 15/15 | `qa/indep-api.json` |
| Auth / page / responsive / persistence | `qa/indep-results-full-pass1.json`, `qa/indep-results-retest2.json`, `qa/indep-pages.json`, `qa/indep-responsive.json` |
| Browser screenshots | `SCREENSHOTS/` (69 PNG files + `README.md`) |
| Per-pass bug reports | `BUGS_FIXED.md`, `BUGS_FOUND_AND_FIXED.md`, `BUGS_FIXED_AND_RETESTED.md`, `BUGS_FOUND.md`, `BUGS_AND_GAPS.md` |
| Feature-level verdicts | `FEATURE_BY_FEATURE_AUDIT.md` |
| Final consolidated verdict | `FINAL_COMPLETION_REPORT.md` |

---

## 8. Final verification after all fixes

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` (from `frontend/`) | **0 errors** |
| Frontend tests | `npm test -- --run` (from `frontend/`) | **187 / 187 passed** (15 files, fresh seeded DB per run) |
| Backend tests | `npm run intel:test` | **127 / 127 passed** (includes durable-checkpoint test) |
| Production build | `NEXT_DIST_DIR=.next_verify npm run build` (from `frontend/`) | **52 / 52 pages**, 109 API routes |
| Broad live browser audit | `node qa/live_e2e.mjs` | **272 / 272 checks**, 6/6 categories |
| Focused six features | `node qa/live-browser/prove_six.mjs` | **49 / 49 checks** |
| OCR negative paths | `node qa/live-browser/ocr_negative.mjs` | **10 / 10 checks** |
| Security / RBAC | `node qa/live-browser/security.mjs` | **13 / 13 checks** |
| Database | read-only SQL | `integrity_check=ok`, 0 FK violations, 55 tables, schema v3 |

**Final-hardening retests (2026-11-08, after defects 40–48 / H16–H18):**

| Check | Evidence |
|---|---|
| Trust snapshots persist and dedupe | `db-intelligence.test.ts` 17/17; live trust route returns `snapshot.created` and `history`; second call `created=false`, history length 1 |
| Rate limiting is shared | `ratelimit.test.ts` 3/3; live: 13 rapid logins from one IP → 12×400 then **429**, `Retry-After: 43`, 12 persisted `rate_limit_hits` rows |
| Signed downloads fail closed | `signed.test.ts` 4/4; live: report `POST` → signed `downloadUrl`, anonymous fetch **200 `application/pdf` 45,266 bytes `%PDF`**; tampered token **403**; no token **403** |
| Fresh database boot | fresh seeded DB: 55 tables, FK rebuild completed, orphan insert rejected |
| Durable checkpoints | live investigation `airun-5c61dac0…` → `orchestrator=langgraph`, 15 nodes, `checkpointing=true`; `.data/langgraph-checkpoints.db` has **15 checkpoints / 96 writes**; `/health` reports `checkpoint_backend=sqlite` |
| Report API status contract | live: unknown report type → **400 `VALIDATION_FAILED`**, missing vehicle → **404**, valid type → **201** + signed link |
| FastAPI startup | `import app.main` OK after the `SECRET` → `signing_secret()` fix; live `/health` **200**, 55 tables, `durable_checkpointing=true` |
| Demo label is conditional | `TD_SEED_DEMO=0` removes “demo workspace”; default demo mode keeps it |


**Verdict:** every product defect found in the exercised seller/buyer workflows was fixed and retested. No failed feature remains hidden; all blocked and unimplemented capabilities are disclosed above and in `FEATURE_BY_FEATURE_AUDIT.md`.
