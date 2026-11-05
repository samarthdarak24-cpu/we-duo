# TrustDrive — Bugs Found

**Date:** 2026-11-05 · Findings from this QA pass (independent re-execution + code reading)

## Genuine issues discovered

### B1 — Stale committed `tsconfig.tsbuildinfo` caused spurious type errors (HYGIENE)
- **Symptom:** a fresh `npx tsc --noEmit` reported 2 errors in `tests/seller-buyer-workflow.test.ts`
  ("`year` missing") even though the file contains `year`.
- **Root cause:** a stale incremental cache (`.tsbuildinfo`) carried an outdated view of the test file.
- **Impact:** misleadingly suggested the typecheck was broken.
- **Status:** FIXED by deleting the cache and re-running → **0 errors**. Recommended: ensure
  `*.tsbuildinfo` stays gitignored and CI runs `tsc --noEmit` on a clean checkout.

### B2 — Test suites bind to the REAL `.data/trustdrive.db` (DATA-SAFETY RISK)
- **Root cause:** `vitest.config.*` resolves `TD_DB_FILE` to the repo-root DB (not an isolated one);
  Pytest uses the same file.
- **Impact:** running tests can mutate or leave artifacts in the production/seed database — directly
  against the rule "never run destructive tests against production data."
- **Status:** OPEN. Fix: point tests at a temp copy (e.g. `TD_DB_FILE=/tmp/trustdrive-test.db` seeded
  from schema) in CI.

### B3 — Trust score computed live, not always persisted on view (MINOR)
- **Observation:** `GET /vehicles/{id}/trust-score` returns a deterministic score even when no
  `trust_scores` snapshot row exists for that vehicle (persistence happens on an explicit recompute).
- **Impact:** "score history" may be empty for some vehicles. Acceptable by design (deterministic,
  versioned) but worth surfacing in UI.
- **Status:** OPEN (documented; not a defect).

### B4 — Next.js server not resident in this sandbox (ENVIRONMENT, not code)
- **Symptom:** `next dev` exits immediately (code 0); `next start` fails ("no production build in
  `.next`").
- **Impact:** no live browser/HTTP proof of the Next.js UI layer this pass.
- **Status:** ENVIRONMENTAL BLOCKER. The Next data layer is proven via Vitest; the API wiring via
  source reading; the backend HTTP layer via the live FastAPI proof.

### B5 — Playwright browsers not installed (ENVIRONMENT)
- **Impact:** no UI/visual/regression automation run.
- **Status:** BLOCKER. `npx playwright install` + `npm run test:e2e` required on a proper host.

### B6 — Honest-labelled external integrations are adapters/demo
- LLM, India vehicle registry, insurance, blockchain are demo/local and never claimed as live.
- **Status:** EXPECTED (per AGENTS.md honesty rule). Not a bug.

## Non-issues (checked, working)
- Seller KPIs are DB-derived, not hardcoded.
- No primitive `<boxGeometry>` 3D placeholder (real GLB).
- RBAC enforced server-side (401/403 live-verified).
- Two `/api/v1` implementations (Next + FastAPI) both return consistent DB-backed data.
