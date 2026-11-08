# TrustDrive — Bugs Fixed

**Run ID:** `LIVE-MW6DOO1A` · **Date:** 2026-11-07 · **Audit:** complete live frontend + backend functionality audit
**Outcome:** 7 issues found and fixed (2 application-side, 5 test-harness/regression-side) → clean rerun **272/272 checks, `EXIT=0`**.

> No business-logic source file was changed to make a failing feature pass. All six implemented categories passed their functional checks on the first full run; the failures were configuration, a false-positive React warning, and defects **in the audit harness itself**. Fixing the harness rather than "fixing" the assertion is what kept the audit honest. This report supersedes the 2026-11-05 edition; those earlier fixes are preserved in the appendix.

---

## F1 — Local LLM stalled every investigation and forced deterministic fallback (application config)

- **Symptom:** Seller Fraud-page investigations returned `source: "next-deterministic-fallback"` instead of the real Python agent. Backend log showed `POST /api/intelligence/investigate` completing in **201,495 ms**, **676,802 ms** and **520,954 ms**.
- **Root cause:** `.env` had `TD_LLM_PROVIDER=local` with `Qwen/Qwen2.5-1.5B-Instruct`. `backend/app/llm.py` loads that 1.5B CPU model **synchronously inside the request path**. The frontend `ai-investigations` route uses `{ timeout: 150_000 }` and `intelligence.ts` clamps `TD_INTELLIGENCE_TIMEOUT_MS` to at most 180,000 ms, so every UI call timed out and fell back.
- **Fix:** set `TD_LLM_PROVIDER=none` in the root `.env`, with an inline comment documenting the measured latency, that the LLM only rewrites narrative (never findings or trust score), and that the 15/16-node conditional LangGraph investigator always runs in Python. Restarted Uvicorn with the new config.
- **Verification:** `/health` now reports `llm.active=false`, `provider="none"`, `agent.orchestrator="langgraph"`, `node_registry_count=16`. A direct 16-node `electric_car` investigation returned `HTTP 200` in **3,263 ms** (`qa/probe-fast.json`). All six live UI investigations reported `python-intelligence` / `langgraph`.
- **Residual (disclosed):** narrative LLM rewriting is disabled; the verification graph, findings, trust score and persistence are fully active. Re-enabling requires a non-blocking inference path plus a raised timeout.

## F2 — React hydration warning on the Buyer dashboard search input (application source)

- **Symptom:** one unexpected browser console error: `Warning: Extra attributes from the server: style` on the `Topbar` search `<input>`.
- **Diagnosis:** `qa/probe_hydration.mjs` compared the SSR HTML and the hydrated live DOM. Both showed `<input type="search" … value="">` with `style: null`; the component never emits a `style` attribute. The extra attribute is injected before hydration by browser autofill / accessibility extensions — a false positive.
- **Fix:** added `suppressHydrationWarning` to **that single input only** in `frontend/components/shared/Topbar.tsx`, with an explanatory comment. No styling, layout or visual design changed.
- **Verification:** final run captured 12 console errors, **all 12 expected HTTP rejections** from negative tests, **0 unexpected**.

## F3 — Harness label assertion for "Engine number" (false failure, diagnostic run)

- **Symptom:** the single-category `TD_ONLY=petrol_motorcycle` smoke run reported `22/23`; the only failure was the harness's label regex, not the UI.
- **Fix:** corrected the assertion to match the real wizard label. Full run then reported `23/23` for both combustion two-wheelers.

## F4 — Harness sent the wrong damage-request field names (false failure)

- **Symptom:** `FAIL [buyer] damage record created for hotspot :: HTTP 400`, which also cascaded into the 3D hotspot check.
- **Root cause:** `POST /api/v1/vehicles/:id/damage` expects `zoneId / description / severity / repairStatus`; the harness had sent a differently named payload.
- **Fix:** in `qa/live_e2e.mjs` use `{ zoneId: "front_bumper", description, severity: "Moderate", repairStatus: "Repaired" }`.
- **Verification:** final run → `HTTP 201` and a visible 3D hotspot (`SCREENSHOTS/buyer-car-3d-hotspot.png`).

## F5 — Harness read Playwright `Response.status` as a property (3 false failures)

- **Symptom:** `FAIL … :: HTTP status() { return this._initializer.status; } id=rep-…` for the PDF report, inquiry and seller-reply checks — the function object was being interpolated instead of called.
- **Fix:** changed `pdfRes.status`, `inqRes.status`, `replyRes.status` to `pdfRes?.status()`, `inqRes?.status()`, `replyRes?.status()` in both the assertion and the detail string.
- **Verification:** final run → PDF `HTTP 201`, inquiry `HTTP 201`, seller reply `HTTP 201`; buyer read back 2 messages.

## F6 — Hardcoded 10-character frame fixture collided with prior runs (false failure)

- **Symptom:** `FAIL [edge] 2W 10-char frame number is ACCEPTED :: HTTP 409 {"code":"DUPLICATE_VIN", …}`. The shared SQLite DB persists between runs, so the fixed `ME4JC259E8` value was already registered — a legitimate 409 masking the rule under test.
- **Fix:** added `uniqueShortFrame()` to `qa/live_e2e.mjs`, generating a run-unique 10-character alphanumeric frame checked against `SELECT id FROM vehicles WHERE vin = ?`. All audit fixtures (registrations, primary identifiers, short frame) are now run-unique.
- **Verification:** final run → `frame=F054427822 (10 chars) HTTP 201` for the two-wheeler and `HTTP 400 VALIDATION_FAILED` for the same value used as a car VIN.

## F7 — New regression suite had 4 incorrect initial assertions

- **Symptom:** first Vitest run of `frontend/tests/live-audit-regressions.test.ts` reported 4 failures.
- **Root causes / fixes:** imported a nonexistent `primaryDocumentTypeForCategory` (replaced with `documentsForCategory()` + `getCategory()?.identity.primaryLabel`); expected 5 publish-gate blockers instead of 4; and a 2W asset-note regex that did not match the real taxonomy wording (relaxed to `/no car model/i` and `/no primitive placeholder is substituted/i`).
- **Verification:** `51/51` pass in that file; full `npm test` → **179/179**.

---

## What was deliberately NOT changed

- **Business logic for the six implemented categories.** No category-aware engine, validator, publish gate, 3D policy, OCR bridge or LangGraph node was altered to obtain a PASS — they were already correct under live testing.
- **Visual design.** The only UI source change is a non-visual `suppressHydrationWarning` attribute. The public `/vehicle/[id]` header's "Sign in" link (shown even for a logged-in buyer) was left as-is and documented as a cosmetic observation in `LIVE_TESTING_REPORT.md` and `FEATURE_IMPLEMENTATION_AUDIT.md`, because changing it would alter the existing design without being part of this functional audit.
- **Planned categories.** Mopeds, three-wheelers, SUV/hatchback/MUV, hybrids and commercial vehicles remain planned-only and non-selectable; no half-implemented taxonomy was added.

---

## Verification after all fixes

| Command | Result |
|---|---|
| `npm run qa:live` (`node qa/live_e2e.mjs`) | **272/272 checks, 11/11 feature groups, `EXIT=0`** |
| Browser console | **12 expected HTTP rejections, 0 unexpected** |
| `npm test` (Vitest) | **13 files, 179/179 passed** (incl. 51 new regression tests) |
| `npm run intel:test` (Pytest) | **126 passed**, 1 harmless `fitz` deprecation warning |
| `npm run typecheck` | **0 errors** |
| Backend `/health` | `ok`, `llm.active=false`, LangGraph 16-node registry, shared SQLite 55 tables |
| Screenshots | 29 canonical + 2 visual verification (`SCREENSHOTS/`) |

**Before → after:** first full run `266/272` with 6 failures (5 harness, 1 fixture collision) → clean rerun `272/272`, `EXIT=0`.

---

## Appendix — prior pass (2026-11-05), retained for continuity

- **P1** — Removed a stale `tsconfig.tsbuildinfo`; `npx tsc --noEmit` then returned 0 errors. Tooling hygiene only, no source edit.
- **P2** — Rewrote `qa/fastapi_live_proof.py` to send the login body correctly and parse FastAPI's direct `{items,total}` responses instead of assuming the Next.js `{data}` wrapper; produced an accurate 11/12 live proof (the single "fail" was a test assumption about snapshot persistence, not an app defect).
- Deliberately not changed at that time: application source for exercised paths (they passed), and test-DB isolation (documented as a recommendation, `BUGS_FOUND B2`).
- Verification then: `tsc --noEmit` 0 errors; `npm test` 84 passed; `npm run intel:test` 99 passed / 1 skipped; live FastAPI proof 11/12.
