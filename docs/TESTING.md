# TrustDrive — Testing

## Latest results (2026-11-05, full-stack completion pass)

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | ✅ exit 0, zero errors |
| `npm test` | ✅ 10 files, **69 tests passed** |
| `npm run build` | ✅ exit 0, BUILD_ID `n2Zi3X7dEmceONjKyy8Vx`, 51 pages, 102 API routes |
| `npm run intel:test` | ✅ **88 passed** |
| Real-DB smoke (service on a DB copy) | ✅ 51 tables, 18-step PDF extraction, review queue, job lifecycle, persistence |
| `python scripts/eval_llm.py` | ✅ **10/10 passed** — 2 LLM narratives, 8 deterministic fallbacks; no forbidden safety claims |
| `npm run test:e2e` | ⚠️ not run locally (browser binaries absent); spec + CI job ready |

> Environment note: Next's diagnostic trace writer can return `EPERM` on this
> Windows host and abort the build. Verification builds neutralise only that
> trace sink (`NODE_OPTIONS=--require ./scripts/next-build-notrace.cjs`);
> emitted bundles are unchanged. Normal CI needs no workaround.

## Commands

| Command | Scope |
| --- | --- |
| `npx tsc --noEmit` | TypeScript typecheck (excludes the co-located `precedent/` Vite app) |
| `npm test` | Vitest: engine, chain, DB intelligence, validation, formatting, public site, RTL component |
| `npm run build` | Next.js production build (use `NEXT_DIST_DIR=.next_verify` for isolation) |
| `npm run intel:test` | Pytest: FastAPI, 18-step pipeline, detectors, agent, worker, LLM grounding |
| `npm run test:e2e` | Playwright 15-step seller→buyer E2E + RBAC (needs running, seeded app) |
| `npm run schema:dump` | Regenerate `docs/ERD.md` from the live schema |
| `npm run seed:reset` | Reset to the labelled demo dataset (13 vehicles) |

## Test inventory

### Vitest (`tests/`)

| File | Covers |
| --- | --- |
| `engine.test.ts` | Deterministic verification / trust engine |
| `chain.test.ts` | SHA-256 chain + integrity |
| `db-intelligence.test.ts` | 51-table schema, FKs, indexes, triggers, views, entity coverage |
| `validation.test.ts` | Zod request validation |
| `format.test.ts` | INR / km / date formatting |
| `public-site.test.ts` | Contact + newsletter real persistence |
| `component/listing-action-bar.test.tsx` | **React Testing Library**: all 8 actions, real handlers, navigation, loading/error/success states, no fake success |

### Pytest (`services/intelligence/tests/`)

| File | Covers |
| --- | --- |
| `conftest.py` | Isolated temp SQLite DB with seeded negative examples (rollback, duplicate hash, VIN mismatch) |
| `test_api.py` | `/health`, OpenAPI, capabilities, fraud, trust score, 12-node investigation, job lifecycle, human review, integrity, damage, upload validation |
| `test_detectors.py` | Mileage rules, duplicate documents, additive score, missing-data policy, offline LLM, grounding validation, damage adapter |
| `test_pipeline.py` | Field extraction, magic-byte validation, all 18 workflow steps, real PDF text layer, worker idempotency/retry, agent graph + persistence |
| `test_api.py` (chat) | `/api/intelligence/chat`: grounded LLM answer + citations; rejected LLM → deterministic narrative with sources |
| `test_models.py` (Paddle) | PaddleOCR 3.7 reads a rendered plate (oneDNN disabled for this CPU) |
| `test_backend.py` | **16 backend contract tests**: auth (login/register/RBAC), vehicle create + duplicate/VIN validation, mileage rollback flag + finding, listing publish + marketplace browse, saved/unsave, compare, inquiry thread, real PDF report + hash, share → public verify → revoke, owner-scoped notifications, append-only history correction, verification run persistence, admin KYC |

### Playwright (`e2e/trustdrive.spec.ts`)

The checklist's 15 persisted steps: seller registers/adds vehicle/uploads
documents → OCR queued → verification engine → seller resolves issues →
publishes listing → buyer signs in → searches → opens details → investigates
history → 3D damage evidence → compares → contacts seller → downloads report.
Plus a direct-navigation RBAC denial test.

Viewports: `chromium-1920` (1920×1080) and `mobile-390` (390×844).
Screenshot QA targets from the spec: 1920×1080, 1440×900, 1366×768, 390×844.

```bash
npm run seed:reset
npm run dev                    # terminal 1
npm run intel:serve            # terminal 2 (optional)
npx playwright install chromium
npm run test:e2e -- --project=chromium-1920
```

## Demo credentials

All demo accounts use password **`demo1234`**.

| Role | Email |
| --- | --- |
| Admin | `admin@trustdrive.dev` |
| Seller | `samarth@trustdrive.dev`, `aditya@trustdrive.dev` |
| Buyer | `rohan@trustdrive.dev`, `priya@trustdrive.dev`, `arjun@trustdrive.dev` |

Seed data is **explicitly labelled as demo data** in the UI and docs. All demo
numbers come from `lib/seed.ts`, not from hardcoded dashboard statistics.

## Scenario checklist (§20 Definition of Done)

For each feature verify: UI matches design · real backend API · DB operation ·
server-side permission · loading state · empty state · error state · input
validation · tests pass · data persists after refresh · no placeholder action ·
no fake result · related seller/buyer workflow works.

## CI

`.github/workflows/ci.yml` runs typecheck + Vitest + build + Pytest on every
push/PR. The Playwright E2E job is opt-in via `workflow_dispatch` because it
requires a seeded running app and browser binaries; the report is uploaded as
an artifact.

## Known testing gaps (honest)

- Playwright browser binaries are not installed in the local sandbox; the E2E
  spec is provided and CI-ready but has not been executed here.
- Per-IP rate limiting and signed download URLs are implemented (Next.js +
  Python) and covered by `test_security` for the Python limiter; the Next.js
  buckets are typechecked but not E2E-tested here. Malware scanning is an
  adapter and is not claimed to be active without `TD_MALWARE_SCAN_URL`.
- Screenshot-led visual correction at all four viewports requires a running dev
  server and is a manual QA pass documented in `newdesign (3).md` §18.2.
