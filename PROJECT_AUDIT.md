# Project Audit — TrustDrive

Audit date: **2026-11-05**. Every finding below was checked against the actual
files, the running services and the live database — not against the docs.

## 1. Actual structure (not the target template)

The repository is **one Next.js application at the root** plus **one FastAPI
service** in `services/intelligence`. They share one SQLite database and one
upload directory.

```text
/                         Next.js 14 App Router (system of record, node:sqlite)
├── app/                  51 pages + 102 API route handlers
├── components/           89 React components (public/seller/buyer/admin/ui)
├── lib/server/           DB, auth, engine, evidence, AI, storage, scan, signing
├── services/intelligence FastAPI (55 modules): OCR, detectors, agent, worker
├── models/               YOLO11m (MIT), XGBoost, model register
├── data/                 sample image + training CSV
├── scripts/              seed, fetch, train, eval, start-render
├── docs/                 architecture, API, ERD, testing, deployment
├── infrastructure/       README map for Docker/Render artifacts
├── ai-services/          README map (AI is internal to FastAPI)
├── public/               images, models (GLB), frames, videos, fonts
├── Dockerfile            web-only image
├── Dockerfile.render     combined web+api+worker image (Render)
├── docker-compose.yml    local web/api/worker + optional Postgres/Redis
└── render.yaml           one web service + persistent disk
```

**Why the template's `frontend/` and `backend/` folders were not created:** the
Next.js app owns 102 route handlers and imports `@/lib/server/*` from the root;
moving it would rewrite hundreds of imports and break the build. The FastAPI
service is already isolated under `services/intelligence`. The logical mapping
is documented in `ARCHITECTURE.md`; physical moves were limited to generated
artifacts (see §4).

## 2. Inventory

| Item | Count |
| --- | --- |
| Pages | 51 |
| API route files | 102 |
| React components | 89 |
| Python modules | 55 |
| Database tables | 51 |
| Pytest | 88 passed |
| Vitest | 69 passed (10 files) |
| TypeScript | exit 0 |
| Next build | exit 0 |

## 3. Deployment findings

| # | Finding | Severity | Resolution |
| --- | --- | --- | --- |
| D1 | Next.js uses `node:sqlite`; the FastAPI service reads the same file. Two Render services cannot share a disk. | **Blocker for split deploy** | Single combined service + 10 GB disk (`render.yaml`, `Dockerfile.render`). Split requires a Next→Postgres migration (documented, not done). |
| D2 | DB, uploads and JWT-secret paths were hardcoded to `.data/`. | High | `TD_DB_FILE`, `TD_UPLOAD_DIR`, `TD_DATA_DIR` are now honoured. |
| D3 | First boot seeded published demo accounts (`demo1234`) in any environment. | High | `TD_SEED_DEMO=0` in production; optional `ADMIN_EMAIL`/`ADMIN_PASSWORD` bootstrap. |
| D4 | `requirements.txt` pulls torch, ultralytics and paddle (multi-GB). | High | `requirements-render.txt` slim runtime (RapidOCR + OpenCV + XGBoost); heavy adapters stay inactive and report so. |
| D5 | `.dockerignore` did not exclude `.env` or `.data`. | High | Fixed; secrets and local DB never enter the image. |
| D6 | `docker-compose.yml` “production” Postgres profile is **not wired to Next.js**. | Medium | Documented explicitly; only the FastAPI service can use Postgres today. |
| D7 | Node must be ≥ 22.5 for `node:sqlite`. | Medium | Docker uses `node:22-bookworm-slim`; README states the requirement. |
| D8 | `render.yaml` cannot use separate frontend/backend services without D1. | Medium | Blueprint is single-service; scale-out path documented. |

## 4. Duplicate / unused / broken

| # | Finding | Resolution |
| --- | --- | --- |
| U1 | `deploy/static` — 246 MB stale static export with broken imports (`@/components/public/StaticShowcaseNotice` missing), which made `tsc` fail. | Archived to `.data/archive/deploy-static`; `deploy` added to `tsconfig.exclude`, `.gitignore`, `.dockerignore`. Regenerate with `scripts/sync-static-deploy.mjs` if needed. |
| U2 | `precedent/frontend` — a separate Vite reference app (374 KB). | Archived to `.data/archive/precedent`. |
| U3 | Nine `.next_verify*` build directories (~1.5 GB). | Removed; they are generated and gitignored. |
| U4 | `components/shared/Viewer3D.tsx`, `VehicleViewer3D.tsx`, `public/ThreeCarViewer.tsx` overlap. | All three are referenced (8/4/3 files). Kept; consolidating would be a visual regression risk. |
| U5 | Two AI implementations: deterministic `lib/server/ai.ts` and the Python 12-node agent. | Intentional: TS assistant is the always-available fallback; Python agent adds evidence review. Documented in `AI_ARCHITECTURE.md`. |
| U6 | `POST /api/v1/alerts/evaluate` and `GET /api/v1/verification-cases/:id` had no UI. | Case page added (`/verification-cases/[id]`); alerts evaluate remains an internal hook. |
| U7 | No hardcoded `localhost:8000` in `app/`, `lib/`, `components/`. | Confirmed (0 matches); URLs come from `TD_INTELLIGENCE_URL`. |
| U8 | `.env` was not ignored in early `.gitignore` revisions. | `.env`, `.env.*` ignored with `!.env.example`. |

## 5. Functional findings

| # | Finding | Status |
| --- | --- | --- |
| F1 | Login inputs had labels but no `htmlFor`/`id`; E2E could not find them. | Fixed; toggle renamed to “Reveal characters” to remove the strict-mode clash. |
| F2 | Login has a “Sign In” tab and a “SIGN IN” submit button; the E2E selector matched both. | Test now targets `form button[type="submit"]`. |
| F3 | Provider checks and AI investigations had backend routes but no UI. | Added `ProviderChecksPanel`, `InvestigationPanel`, `/admin/users`. |
| F4 | Soft delete had no UI. | Document Delete + account Danger Zone. |
| F5 | Malware scanning was “not configured” by default. | Local EICAR/heuristic scan (`local-signature-v1`) is active; external AV optional. |
| F6 | Verification cases had no page. | `/verification-cases/[id]` added. |

## 6. Secrets and configuration

- No API keys or passwords are hardcoded in `app/`, `lib/`, `components/`,
  `services/intelligence/app/`.
- `JWT_SECRET` wins; otherwise a random per-install secret is persisted at
  `TD_DATA_DIR/jwt-secret`. Production **requires** `JWT_SECRET`.
- `TD_SERVICE_TOKEN`, `DOWNLOAD_SIGNING_SECRET`, `QR_SIGNING_SECRET`,
  `TD_SHARE_SECRET` must be set in production (Render generates the first three).
- `.env` is gitignored; `.env.example` contains placeholders only.

## 7. Remaining blockers (deployment)

1. **D1 scale-out** — split services require the Next data layer on Postgres.
2. **External credentials** — RTO/insurer provider, full AV, S3, LLM API key.
3. **Real labelled fraud corpus** — XGBoost is synthetic-demo.
4. **Docker build not executed here** — the Docker daemon is unavailable in this
   sandbox. The image is built in CI (`.github/workflows/ci.yml`, `docker` job).
5. **Playwright** — Chromium installed and the spec runs; selector fixes applied,
   see `docs/TESTING.md` for the latest result.
