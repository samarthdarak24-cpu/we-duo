# TrustDrive — Project Audit (Phase 0)

> Performed **2026-11-05** against the working repository, not a README.
> Every claim below was verified by reading code, querying the live database or
> running a command.

## 1. What existed before this pass

| Area | Verified state |
| --- | --- |
| Frontend | Next.js `14.2.35` App Router, React `18`, TypeScript `5`, Tailwind `3.4`; **50 pages** |
| Backend (web) | Next.js route handlers under `app/api/v1/*`; **88 `route.ts` files at audit time** (96 after this pass) |
| Database | `node:sqlite` (`DatabaseSync`), `SCHEMA_VERSION=3`, **42 tables at audit time** (51 after the additive `ensure*` tables), 30 indexes, 11 immutability triggers, 5 canonical views |
| Seed data | **13 vehicles**, 7 users, 80 documents, 35 mileage readings, 25 history events, 111 chain records |
| Auth | scrypt (`salt:hex`, 64-byte key) + HS256 JWT in httpOnly cookies; RBAC in `lib/server/http.ts` |
| 3D | `components/shared/Viewer3D.tsx` built the car from **`<boxGeometry>` primitives**; `public/models/` was empty |
| AI/OCR | Deterministic grounded assistant only; no Python runtime, no OCR, no ML, no agent |
| Tests | 4 Vitest files; no RTL, no Playwright, no Pytest |
| Docs | `ARCHITECTURE.md`, `TECH_STACK.md`, `IMPLEMENTATION_STATUS.md` (stale), `BUGS_AND_GAPS.md`, `design.md`, `newdesign (3).md`, `docs/ERD.md` |

**Important finding:** the previous `IMPLEMENTATION_STATUS.md` was materially
wrong — it claimed 3 seeded vehicles and "no Python service" while the database
actually held 13 vehicles and a 42-table schema. The status file was rewritten.

## 2. Defects found and fixed

| # | Defect | Resolution |
| --- | --- | --- |
| 1 | `app/buyer/saved/page.tsx` intermittently failed `tsc` with `Cannot find name 'Icon'` during a concurrent build | import verified; `tsc --noEmit` now exits 0 |
| 2 | `next.config.mjs` had lost its `distDir` override, so isolated verification builds collided with `.next` | restored `distDir: process.env.NEXT_DIST_DIR \|\| '.next'` |
| 3 | Primitive 3D car (explicitly forbidden by the checklist) | real GLB loaded via `GLTFLoader`; primitive kept only as load-error fallback |
| 4 | Vitest collected the Playwright spec (`test.describe` crash) | Vitest scoped to `tests/**/*.test.{ts,tsx}` |
| 5 | RTL had no automatic cleanup (Vitest globals off) → duplicate-element failures | explicit `cleanup()` in `afterEach` |
| 6 | JSX ran in classic mode under Vitest (`React is not defined`) | `esbuild.jsx = "automatic"` |
| 7 | Trust score gave full "mileage consistency" points when **no readings existed** | missing data now scores 0 as `unverified`, never as a pass |
| 8 | Python writes used status/kind vocabularies that violated live CHECK constraints | aligned to `queued/succeeded`, `open/resolved`, `document/agent`, `awaiting_review` |

## 3. What was missing versus the checklist

- No Python/FastAPI backend for document AI, fraud ML, the LangGraph agent or jobs.
- No `/api/v1` contract surface in the Python runtime (the Next.js app has one).
- No real GLB, no full-screen/presets/WebGL fallback, no hotspot→DB mapping test.
- No RTL, Playwright, Pytest, security tests or rate limiting.
- No Dockerfile, Compose, CI, `.env.example`, or the required delivery docs.

## 4. Commands run during the audit

```bash
node -v                       # v22.22.2  (node:sqlite requires >= 22.5)
python --version              # 3.13.14
# live schema + row counts
node -e "…PRAGMA table_info / sqlite_master…"
npx tsc --noEmit              # exit 0
npm test                      # 7 files / 53 tests
NEXT_DIST_DIR=.next_verify7 npm run build   # exit 0, BUILD_ID RqjjHR4Lk9TMrQc0OQGxP
python -m pytest -q           # 88 passed
```

## 5. Architecture decision taken

**Additive, not destructive.** The Next.js application remains the system of
record for portals, the public REST API and the relational database. A Python
FastAPI service was added beside it, sharing the same database, for document
intelligence, fraud detection, the 12-node investigator and background jobs.
One database, two runtimes, no removed feature. See
`docs/CURRENT_ARCHITECTURE.md` and `docs/TECH_STACK_DECISIONS.md`.
