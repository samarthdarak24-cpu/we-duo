# TrustDrive — Bugs Found

**Last updated:** 2026-11-07 · This file tracks defects/risks found across the audit passes. Fixed defects are documented in `BUGS_FOUND_AND_FIXED.md` and `BUGS_FIXED_AND_RETESTED.md`.

## Genuine issues discovered and fixed

### B1 — Stale `tsconfig.tsbuildinfo` caused spurious type errors (HYGIENE)
- **Symptom:** fresh `npx tsc --noEmit` reported 2 errors in a test even though the source was valid.
- **Root cause:** stale incremental cache.
- **Status:** FIXED — cache cleared; final `tsc --noEmit` is clean (0 errors).

### B2 — Test suites could touch the live database (DATA-SAFETY RISK) — PARTIALLY FIXED
- **Root cause:** `vitest.config.*` resolves `TD_DB_FILE` to the repo-root DB; Pytest may use the same file.
- **Mitigation:** `tests/multicategory.test.ts` now copies the live DB to a throwaway temp file and sets `TD_DB_FILE` before importing the DB module.
- **Remaining risk:** other suites may still read/write the live seed DB. CI should point every suite at a temp copy.
- **Status:** PARTIALLY FIXED / OPEN for CI isolation.

### B3 — Trust score computed live, not always persisted (MINOR / BY DESIGN)
- **Observation:** `GET /vehicles/{id}/trust` returns a deterministic score even when no `trust_scores` snapshot row exists.
- **Impact:** “score history” may be empty for some vehicles; the current score is still correct and versioned.
- **Status:** DOCUMENTED — not a correctness defect.

### B4 — Corrupted Next.js build manifest from duplicate dev servers (CRITICAL, FIXED)
- **Symptom:** `/vehicle/[id]` and `/print/report/[id]` returned 500; client chunks 404.
- **Root cause:** two `next dev` processes wrote the same `.next` directory.
- **Fix:** one server, isolated `NEXT_DIST_DIR` directories (`.next_qa`, `.next_independent`, `.next_verify`).
- **Status:** FIXED and retested (40/40 pages 200, 0 JS exceptions).

### B5 — Playwright browsers / server availability (ENVIRONMENT, RESOLVED)
- Earlier passes could not keep a Next.js server resident and Playwright browsers were missing.
- This pass: headless Chromium ran the full live suite; server stayed resident on `:3000`; 272/272 broad checks and 49/49 focused checks passed.
- **Status:** RESOLVED in this environment. CI must still install browsers explicitly.

### B6 — Public “Download Real PDF” CTA returned 403 (HIGH, FIXED)
- **Cause:** marketing CTA pointed at a private owner-gated report.
- **Fix:** public demo-only sample-report endpoint generating a real PDF from the fixed seeded demo report; private report download remains 403 for anonymous.
- **Status:** FIXED and retested (200, real `%PDF`, demo headers).

### B7 — “Sign in” shown to an authenticated buyer (MEDIUM, FIXED)
- **Cause:** public vehicle page did not use the available session in the header.
- **Fix:** “My workspace” link when signed in; “Sign in” only for anonymous.
- **Status:** FIXED and retested.

### B8 — Offline “Live stack” claimed engines were active (HIGH, FIXED)
- **Cause:** fallback rows were hardcoded green/active while the intelligence service was unreachable.
- **Fix:** offline rows are `off`, labelled “documented build, not live status”; active/off derives from real `/health` capabilities.
- **Status:** FIXED and retested (0 green dots offline).

### B9 — Fake-pending OCR / unused Python agent / demo theft (CRITICAL/HIGH, FIXED)
- Document upload wrote `pending` but never ran OCR → real OCR bridge and persisted extraction.
- AI investigation always used the Next fallback → Python-first with labelled fallback.
- Demo theft row counted as clean → demo source ignored; missing ≠ verified.
- **Status:** FIXED and retested; details in `BUGS_FOUND_AND_FIXED.md`.

### B10 — Marketplace test pagination assumption (LOW, TEST-ONLY, FIXED)
- **Symptom:** `npm test` failed because `getMarketplace({category:"two_wheeler"})` returned the default 12 items and the demo e-scooter was below the fold.
- **Root cause:** test expected all 18 two-wheelers without requesting a full page; filter logic was correct.
- **Fix:** test requests `pageSize: 48`; assertion unchanged.
- **Status:** FIXED; 179/179 tests pass.

### B11 — Hydration warning on a file input (COSMETIC, NOT REPRODUCIBLE)
- **Symptom:** focused run logged “Extra attributes from the server: style” on `DocumentsManager` file input.
- **Diagnosis:** SSR source emits no `style` attribute; browser autofill/extension injects it before hydration. Same class as the earlier Topbar false positive.
- **Status:** DOCUMENTED cosmetic; broad run had 0 unexpected console errors.

## Honest-labelled integrations (not bugs)

- Government/VAHAN, insurer, theft registry, blockchain anchoring, YOLO end-to-end, production XGBoost, LLM narrative, S3, email/SMS, Postgres, PaddleOCR and durable LangGraph checkpoints are **BLOCKED / missing external configuration**. They are explicitly labelled; none is presented as working.

## Non-issues (checked, working)

- Seller KPIs are DB-derived, not hardcoded.
- No primitive `<boxGeometry>` placeholder as the final vehicle; real GLB for cars and honest schematic for 2W.
- RBAC is enforced server-side (401/403 live-verified).
- Next and FastAPI share one SQLite database (55 tables), not two divergent stores.
- Marketplace `q` searches registration, VIN and TrustDrive ID; SQL metacharacters are treated as text.
- All six implemented categories pass creation → OCR → investigation → publish → buyer detail.
