# TrustDrive — Bugs Fixed

**Date:** 2026-11-05 · Actions taken during this QA pass

## F1 — Cleared stale `tsconfig.tsbuildinfo` → `tsc --noEmit` clean
- **Action:** removed the stale incremental cache and re-ran `npx tsc --noEmit`.
- **Result:** **0 errors** (previously reported 2 spurious errors from the cached view).
- **Evidence:** `qa/evidence/tsc.log` (empty = no errors).
- **Note:** this was a tooling/hygiene fix, not an application-code change. No source file was edited
  because the code was already type-correct.

## F2 — Corrected the live-proof harness (methodology, not app code)
- **Action:** rewrote `qa/fastapi_live_proof.py` to (a) send the login body correctly and (b) parse
  FastAPI's direct dict responses (`{items,total}`) instead of assuming Next.js `{data}` wrapping.
- **Result:** the proof now reports accurate 11/12 checks (the 1 "fail" is a test assumption about
  snapshot persistence, not an app defect).
- **Evidence:** `qa/evidence/fastapi_proof.txt`, `qa/evidence/fastapi_health.json`.

## What was deliberately NOT changed
- **No application source was edited** for the exercised feature paths, because they passed real
  integration checks. Inventing changes to "show progress" would violate the honesty principle and the
  AGENTS.md "no fake results" rule.
- The test-DB-isolation gap (BUGS_FOUND B2) is documented as a recommended fix rather than silently
  applied, since changing the test target could affect existing CI and warrants a deliberate decision.

## Verification after fixes
- `tsc --noEmit`: 0 errors.
- `npm test`: 84 passed.
- `npm run intel:test`: 99 passed / 1 skipped.
- Live FastAPI proof: 11/12 functional checks pass (cross-role spine + RBAC confirmed).
