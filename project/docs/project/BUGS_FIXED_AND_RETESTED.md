# TrustDrive — Bugs Fixed and Retested

**Run ID:** `IND-2026-11-07` · **Date:** 2026-11-07 · **Method:** real headless Chromium against the running Next.js `:3000` + FastAPI `:8000` stack, plus read-only assertions on the shared SQLite file.
**Harness:** `qa/indep_live.mjs` (`TD_PHASES=bugs`), `qa/indep_api_probe.mjs`. Evidence: `qa/indep-results.json`, `qa/indep-full.log`, `qa/indep-api.json`, `SCREENSHOTS/independent/`.

> This report covers defects **found in this independent pass**. It does not overwrite `BUGS_FIXED.md`, which documents the earlier `LIVE-MW6DOO1A` pass. No defect was hidden with fake data, an empty success response or a hardcoded status change; no feature was removed.

---

## Summary

| # | Defect | Severity | Reproduced | Fixed | Retested in browser |
|---|---|---|---|---|---|
| B0 | Two `next dev` processes sharing one `.next` → corrupted webpack manifest → **HTTP 500** on `/vehicle/[id]` and `/print/report/[id]`, plus 404s on all client chunks | Critical | Yes | Yes | Yes (both pages 200, 0 JS exceptions) |
| B1 | Public "Download Real PDF" CTA returned `403 JSON` instead of a PDF | High (broken visible action) | Yes | Yes | Yes (200, real 106,834-byte `%PDF`) |
| B2 | Public vehicle report showed "Sign in" in the sticky header **while a buyer was signed in** | Medium (session/UX) | Yes | Yes | Yes (now "My workspace") |
| B3 | "Live stack" section painted 7 green **"active"** dots when the intelligence service was unreachable | High (evidence honesty, AGENTS.md §2) | Yes | Yes | Yes (0 green dots, labelled "not live") |
| B4 | Seller wizard `publish()` read `listingId` from a stale React closure immediately after setting it, so a freshly created listing could not publish on the first click | Medium (latent) | Code-level | Yes | Typecheck + wizard regression |

Additional harness-only corrections (not product defects) are listed in §6.

---

## B0 — Critical: corrupted Next.js dev manifest (HTTP 500 on two core pages)

**Reproduction (live browser).** Opening `/vehicle/v-bmw` as a signed-in buyer produced a blank page; the browser fired a `pageerror`:

```
Cannot find module './vendor-chunks/lucide-react.js'
Require stack:
- .../frontend/.next/server/webpack-runtime.js
- .../frontend/.next/server/app/vehicle/[id]/page.js
```

`curl` confirmed `GET /vehicle/v-bmw → 500` and `GET /print/report/rep-1 → 500`. The dev log also showed `GET /_next/static/chunks/* → 404` for every client chunk, i.e. hydration was broken across the app.

**Root cause.** Two independent `next dev` processes (PIDs 18536/26548 and 36172/42616, from two separate `cmd.exe /c next dev` shells) were writing into the **same** `frontend/.next` directory at once. This is precisely the failure mode prohibited by `AGENTS.md` §6 ("Never run `next dev` and `next start` against the same `.next` directory — it corrupts manifests"). The shared webpack vendor chunk `lucide-react.js` was missing while `webpack-runtime.js` still referenced it.

**Fix.**
1. Stopped all duplicate `next dev` / `start-server` processes for this workspace.
2. Archived the corrupted build cache instead of deleting it: `frontend/.next` → `.data/_cleanup_root/.next_corrupt_*`.
3. Started **exactly one** dev server with an isolated build directory:
   `NEXT_DIST_DIR=.next_independent npm run dev` (from `frontend/`). `frontend/next.config.mjs` already supports `process.env.NEXT_DIST_DIR || '.next'`, so no source change was needed.

**Retest.** `/`, `/login`, `/register`, `/marketplace`, `/vehicle/v-bmw`, `/print/report/rep-1`, `/seller`, `/buyer`, `/technology`, `/api/v1/public/sample-report` → **all HTTP 200**. Defect probes afterwards reported `jsExceptions=0`, `consoleErrors=0`, `unexpected=0`. The subsequent full page sweep rendered all 40 authenticated pages and 10 public pages with `http=200` and `jsErrors=0`.

---

## B1 — Broken public "Download Real PDF" CTA

**Reproduction.** On `/` (anonymous), `a[href="/api/v1/reports/rep-1/download"]` → `HTTP 403`, `application/json`, body `{"error":{"code":"FORBIDDEN","message":"This report belongs to another account…"}}`. The link was a visible control that could never work for the audience it targeted. `ReportShowcaseSection.tsx:51` and `HowItWorksSection.tsx:356` both pointed at it.

The 403 itself is **correct** — `/api/v1/reports/[id]/download` is owner/signed-token gated. The defect is that the marketing CTA pointed anonymous visitors at a private resource. Simply relaxing that route's RBAC would have created an IDOR, so it was deliberately left untouched.

**Fix.**
- Added `frontend/app/api/v1/public/sample-report/route.ts`: a public, read-only endpoint that generates a **real** PDF with the existing `reportPdf()` generator from the fixed, seeded demo report id `rep-1`. The id is a compile-time constant and no caller-supplied id is read, so it cannot be used to reach a real customer's report. The cover says `DEMO / SAMPLE — Vehicle verification (synthetic data)`, the filename is `trustdrive-DEMO-sample-report.pdf`, and headers carry `X-TrustDrive-Demo-Data: synthetic-seed-data-not-a-real-vehicle-record` plus a real `X-Report-SHA256`. If the demo report is absent it returns an honest `503`, never a fabricated PDF. Rate limited with `LIMITS.report`.
- Repointed both CTAs to `/api/v1/public/sample-report` and renamed them "Download sample PDF (demo)" / "Get sample PDF" so the label no longer claims a real customer document.

**Retest (live browser).** CTA `href=/api/v1/public/sample-report` → `HTTP 200`, `application/pdf`, `106834 bytes`, magic `%PDF`, demo header present. Private `/api/v1/reports/rep-1/download` still `HTTP 403` for anonymous callers. `qa/indep_api_probe.mjs` confirms both.

---

## B2 — "Sign in" shown to an already authenticated buyer

**Reproduction.** Signed in as `rohan@trustdrive.dev` via the real form, opened `/vehicle/v-bmw`; the sticky header read `TrustDrive | Explore | Verify a vehicle | Sign in`. The page already calls `getSessionUser("buyer")` (line 75) for its data, so the session was available but unused by the header.

**Fix.** `frontend/app/vehicle/[id]/page.tsx`: render a "My workspace" link to `/buyer` when `session` exists, keeping the same button tokens/classes; "Sign in" remains only for anonymous visitors. Visual design is otherwise unchanged.

**Retest (live browser).** Header now reads `TrustDrive | Explore | Verify a vehicle | My workspace`. Screenshot: `SCREENSHOTS/independent/bug2-vehicle-report-header-buyer.png`.

---

## B3 — Offline "Live stack" claimed every engine was active

**Reproduction.** Intercepted `/api/v1/ai/stack` to return `connected:false` (intelligence service unreachable) and loaded `/technology`. The page rendered **7 green "active" dots** for OCR, Damage CV, Anomaly ML, Retrieval, Agent, LLM and Integrity — while the section headline promises "A capability is only marked active when its engine and weights are present." That contradicts `AGENTS.md` §2 rules 5–8 (data must be real or clearly labelled; never claim an unavailable integration works).

**Fix.** `frontend/components/public/StackStatus.tsx`:
- The offline `FALLBACK` rows are now all `state: "off"` and their values are prefixed `Documented: … (status unknown)`.
- The status chip reads `live status unavailable · documented build`.
- The disclaimer now explicitly says the list is the **documented build, not live status**, that none of the engines is confirmed running, and that the service must be started to see what is actually available.
- While connected, "Anomaly ML" and "Retrieval" now derive their active/off state from `intel.xgboost.available` / `intel.retrieval.available` instead of being unconditionally `active`.

**Retest (live browser).** With the service unreachable: `greenDots=0`, page text contains "the documented build, not live status — none of these engines is confirmed running". With the service connected, `qa/indep_api_probe.mjs` reports `connected=true` and `/health` reports the real engine inventory.

---

## B4 — Stale React state in the Seller publish action

**Reproduction (code-level).** `frontend/components/seller/AddVehicleStepper.tsx` `publish()` did:

```ts
setListingId(json.data.id);   // async state update
…
const id = listingId;         // still the OLD value (null) in this closure
if (!id) { … setListingId(row.listing.id); return; }   // abort without publishing
```

In the normal wizard path `createVehicleDraft()` returns a `listingId`, so the happy path worked — but any draft created through the `POST /api/v1/seller/listings` branch could never be published on the first click, and the "create then return" behaviour silently required a second click.

**Fix.** Store the id in a local `let id = listingId`, assign the newly created id to it, update React state from the same value, and remove the dead re-fetch branch. The server-side publish gate remains authoritative; `loadGate()` still refreshes the visible blockers.

**Retest.** `npx tsc --noEmit` → 0 errors. Wizard creation + persistence re-exercised in `TD_PHASES=persist` (real POST → SQLite row → browser refresh → row still present).

---

## 6. Harness corrections (NOT product defects)

These were false failures in the independent harness and were corrected rather than "fixed" by weakening an assertion:

1. **Cold-page hydration.** Clicking a submit button before React attached caused a native form GET with no API call (`url=/login?`). Added `hydrate()` which waits for a React fiber on a client element, and added real `waitForResponse` assertions. Auth phase went from 10/13 to **13/13 PASS**.
2. **Logout control.** "Sign out" is inside a collapsed `<details>` menu; the harness clicked it while hidden. Now opens `details > summary` first, then asserts `POST /api/v1/auth/logout → 200`, the `td_token` cookie is gone, and a protected API returns `401`.
3. **Wrong demo account.** `ACCOUNTS.seller2` was `aditya@trustdrive.dev`, which is a **buyer** in this database. Replaced with the real second seller `weduo@trustdrive.dev` (`u-seller2`, 9 vehicles), and `login()` now verifies the final URL matches the expected portal.
4. **Wrong column name.** `documents.storage_key` does not exist; the real column is `file_key`.
5. **API probe assumptions.** `/api/intelligence/capabilities` and `/categories` are service-token gated by design; the probe now asserts both the anonymous `401` and the authenticated `200` rather than expecting them to be public. Result: **15/15 PASS**.
6. **CTA locator.** After the B1 fix the CTA URL no longer contains `/download`; the probe now locates it by accessible name (`/sample PDF/i`).

---

## 7. Deliberate non-changes (honest limitations, recorded not hidden)

- **Demo-mode page rendering (DECISIONS D11).** `lib/server/session.ts` falls back to seeded demo accounts when no session cookie exists, so an anonymous visitor can *view* Seller/Buyer/Admin portal shells. They are scoped to the seeded demo user, and the “demo workspace” label now renders only while `TD_SEED_DEMO` is active; **every write API returns 401**. This is an intentional demo behaviour, not a data leak; it must be disabled for production (`TD_SEED_DEMO=0`, which also removes the label). Recorded in `SECURITY_TEST_REPORT.md`.
- **Public marketing sections** contain illustrative numbers (labelled "Sample Report") but no backend calls. They were left unchanged to preserve the approved design.
- **Two-wheeler 3D models.** No licensed GLB exists; the viewer renders a clearly-labelled category schematic with interactions disabled. No car model is substituted.
- **External providers** (vehicle registry, insurer, theft, blockchain anchoring) remain local/demo adapters returning `UNAVAILABLE` when unconfigured. No live integration is claimed.

---

## 8. Regression evidence

| Check | Before | After |
|---|---|---|
| `/vehicle/v-bmw` | 500 | 200 |
| `/print/report/rep-1` | 500 | 200 |
| Defect probes | 1/4 then 1/3 PASS | **5/5 PASS** |
| Unexpected browser console errors | 1 (the 500) | **0** |
| JS exceptions | 1 | **0** |
| `npx tsc --noEmit` | — | **0 errors** |
| Private report RBAC (anonymous) | 403 | 403 (unchanged) |

---

## 9. Final retest after the last test-suite correction (2026-11-07)

A final `npm test -- --run` exposed one failing assertion in `tests/multicategory.test.ts`:

> `expected [ 'v-1794063587287', …(11) ] to include 'v-demo-escooter'`

**Root cause:** the live QA database now contains **18 published two-wheelers**. The test called `getMarketplace({ category: "two_wheeler" })` without a page size, so the API correctly returned the default first **12** items and the demo e-scooter was on page 2. The category filter itself was correct.

**Fix:** the test now requests `{ category: "two_wheeler", pageSize: 48 }`. The assertions were not weakened or removed; pagination is intended API behaviour.

**Retest:**

```text
Test Files  15 passed (15)
Tests       187 passed (187)
```

Final verification after this change: `npx tsc --noEmit` clean, production build 52/52 pages + 109 API routes, focused live 49/49, broad live 272/272, backend 127/127.

---

## 10. Final hardening pass (2026-11-07, after the independent pass)

| # | Defect | Fix | Evidence |
|---:|---|---|---|
| F1 | Trust history was computed but never stored | `ensureTrustScoreSnapshot()` writes an immutable, deduplicated row from the trust route and after verification; `computed_by` recorded | `db-intelligence.test.ts` 17/17; live route `snapshot` + `history` |
| F2 | Rate limiting was process-local | Shared SQLite `rate_limit_hits` table with atomic sliding window and memory fallback | `ratelimit.test.ts` 3/3; live 429 + `Retry-After` |
| F3 | Download signing fell back to a public dev secret | Fail closed when unconfigured in production; explicit local escape hatch; documented rotation | `signed.test.ts` 4/4; live PDF still 200 |
| F4 | Fresh DB FK rebuild aborted on views | Capture/drop/recreate views around the table rebuild | Fresh seeded DB: all 29 FK tables rebuilt; orphan insert throws |
| F5 | Demo label always shown | Conditional on `TD_SEED_DEMO !== "0"` | Typecheck; `TD_SEED_DEMO=0` visual check |
| F6 | Duplicate `.env` key and non-isolated test DB | Single key; global `setup-db.ts` with fresh seeded default and opt-in live snapshot | Duplicate scan clean; 187/187 deterministic rerun |
| F7 | Durable LangGraph checkpoints were blocked | `langgraph-checkpoint-sqlite` + `TD_CHECKPOINT_BACKEND`/`TD_CHECKPOINT_DB`; honest memory fallback | Backend 127/127; `checkpoint_backend=sqlite`, `durable_checkpointing=true` |
| F8 | Report-type validation returned HTTP 404 for an invalid body on a valid route | Status mapped by code (404/403/400) | Live: invalid type 400, missing vehicle 404, valid 201 |
| F9 | Expired/tampered download tokens reported an ownership error | `DOWNLOAD_LINK_INVALID` message when a token is presented but fails verification | Live: tampered 403 `DOWNLOAD_LINK_INVALID`; no token keeps `FORBIDDEN` |
| F10 | FastAPI would not boot after the lazy signing-secret refactor | Public `signing_secret()` accessor; marketplace + tests updated | `import app.main` OK; live `/health` 200; 127/127 Pytest |
