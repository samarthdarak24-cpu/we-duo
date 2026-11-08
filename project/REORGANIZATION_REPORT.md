# Reorganization Report

Executed against the real repository. Every move is recorded in
`project/MIGRATION_MANIFEST.json` (111 entries) and can be reversed with
`python project/reorganize.py --rollback`. Nothing was deleted: duplicates and
stale builds were staged under `project/archive/`.

## 1. Final tree

```
trustdrive/
├── frontend/                     Next.js 14 app — system of record (119 API routes)
│   ├── app/  components/  lib/  public/
│   ├── tests/ (27)  e2e/ (3)  scripts/ (12)
│   └── next.config.mjs  tsconfig.json  vitest.config.ts  playwright.config.ts
├── backend/                      FastAPI intelligence service + DB worker
│   ├── app/                      routers, detectors, agent, worker
│   │   └── intelligence/         thin re-exports of services/ai
│   ├── alembic/  scripts/ (6)  tests/ (14)
│   ├── Dockerfile  pytest.ini  requirements*.txt
├── services/                     ALL AI/ML code + assets (27 files)
│   └── ai/{ocr, computer_vision, xgboost, fraud_detection, langchain, llm, shared}
│       └── shared/{models (39 MB weights + register), data (datasets)}
├── project/                      everything supporting the two runtimes
│   ├── docs/ (185)               architecture · api · database · deployment · reports
│   ├── qa/ (2559)                live harnesses, sinks, evidence, results
│   ├── scripts/                  start-local · model build · secret scan · setup/
│   ├── infra/
│   │   ├── docker/               Dockerfile.render · docker-compose.yml
│   │   ├── deployment/           start-render.sh
│   │   └── render/               services.yaml (web · api · ai)
│   ├── tests/                    cross-cutting QA support
│   ├── legacy/                   old static showcase copies
│   ├── archive/                  duplicates, stale builds, old test data
│   ├── MIGRATION_MANIFEST.json   every move, reversible
│   ├── REORGANIZATION_PLAN.md    the plan written before any move
│   └── reorganize.py             the audited mover / rollback tool
├── render.yaml                   deployable Render Blueprint
├── package.json                  workspace commands
├── AGENTS.md  README.md  LICENSE
├── .env.example  .gitignore  .dockerignore  .gitattributes  .node-version
└── .git/  .github/  .data/  node_modules/  .workbuddy-ai/  deploy/site/
```

## 2. What moved

| Category | Count | From → To |
| --- | --- | --- |
| Documentation | 185 | `docs/` → `project/docs/` (+ root reports) |
| QA harnesses | 2559 | `qa/` → `project/qa/` (+ `frontend/qa` → `project/qa/frontend-legacy`) |
| Helper scripts | 6 | `scripts/` → `project/scripts/` |
| Deployment config | 4 | `infra/{docker,deployment}` → `project/infra/` |
| Frontend unit tests | 27 | `tests/frontend/*` → `frontend/tests/` (restored) |
| Playwright specs | 3 | `tests/e2e/*` → `frontend/e2e/` (restored) |
| Backend tests | 14 | `tests/backend/*` → `backend/tests/` (restored) |
| Old static deploy | 15 | `deploy/*` (except `site`) → `project/legacy/deploy/` |
| Stale Next builds | 16 | `frontend/.next_*` → `project/archive/builds/` |
| Test data / caches | 8 | `.data-e2e*`, `.pytest_cache`, `.freebuff`, `.kombai` → `project/archive/` |
| Stray logs | 13 | root + `frontend/playwright-*.log` → `project/archive/logs/` |

## 3. Preserved deliberately

| Path | Why |
| --- | --- |
| `frontend/`, `backend/` (names + internal layout) | `next.config.mjs` resolves the repo root as `frontend/..`; `backend/app/config.py` as `backend/..`. Renaming either breaks the shared `.data` path. |
| `frontend/tests`, `frontend/e2e`, `backend/tests` | Vitest `include`, Playwright `testDir` and pytest `testpaths` point here, and test files use relative imports like `../lib/server/engine`. |
| `.data/` | Live SQLite database (single-database guarantee). |
| `.workbuddy-ai/`, `.kilo/worktrees/`, `.wbapp_*.genie` | Project data, registered git worktrees, published app card. |
| `deploy/site/` | The app card's `localDir` points here; moving it would orphan the published app. |
| `node_modules/`, `backend/.venv/`, `.env` | Local runtime state. |

## 4. Regressions found in the earlier partial reorganization — and fixed

1. **`backend/app/intelligence/` had been moved to `services/ai/`**, leaving
   `from .intelligence import status` and `from ..intelligence.damage import yolo`
   broken (`ModuleNotFoundError`). Rebuilt `backend/app/intelligence/` as thin
   re-export shims (`ocr`, `fraud`, `damage`, `mileage`, `retrieval`, `rules`,
   `scoring`, `evaluation`, `status`) over `services/ai`.
2. **Moved AI modules imported `backend.app.*`** which is not importable under
   `uvicorn --app-dir backend`. Rewrote them to `app.config` / `app.detectors` /
   `app.explain`, and made `services/` a real package (`services/__init__.py`,
   `services/ai/*/__init__.py`). `backend/app/__init__.py` now puts the repo root
   on `sys.path`.
3. **`intelligence/status.py` was lost.** Recreated with the exact 3-key contract
   (`damage`, `xgboost`, `retrieval`) that `/health` and the test suite expect.
4. **Test suites were empty while the runners still pointed at them** — `npm test`
   exited 1 with "No test files found". Restored all 44 files.
5. **`frontend/tests/evm-anchoring.test.ts`** spawned `qa/evm-rpc-stub.mjs`, and
   the stub resolved `../frontend/package.json`; both paths broke after the move.
6. **`render.yaml`** pointed at `./Dockerfile.render` (moved) — Render could not
   build. Now `./project/infra/docker/Dockerfile.render`.
7. **`Dockerfile.render`** copied the empty `infrastructure/scripts/start-render.sh`.
   Now copies `project/infra/deployment/start-render.sh`.
8. **The image never copied `services/`**, so `TD_MODEL_DIR` (default
   `services/ai/shared/models`) resolved to nothing. Added `COPY services ./services`.
9. **`docker-compose.yml`** used `context: ./frontend` relative to its own folder
   and mounted the shared volume at **different paths** for web and api — two
   different database files. Fixed contexts (`../../../`) and unified `/srv/data`.
10. **`.env.example` / `.env`** still said `TD_MODEL_DIR=ai-services/shared/models`.
11. **Alembic baseline failed** with `index ix_ai_analysis_vehicle_id already
    exists`: `op.create_table` already materialises `index=True` columns and the
    explicit `create_index` loop ran again. Removed the duplicate loop.
12. **Root `package.json` / CI** referenced `scripts/…` and `qa/…` that moved.
13. **`start-local.mjs` / `run-integration-tests.mjs`** computed the repo root one
    level short after moving into `project/`.

## 5. Deployment YAML for all services

- `render.yaml` — **the deployable** blueprint: one web service (Next.js +
  FastAPI + worker), 10 GB disk at `/data`, `/api/v1/health/ready`.
- `project/infra/render/services.yaml` — three services:
  `trustdrive-web` (node), `trustdrive-api` (python), `trustdrive-ai-worker`
  (python worker), each with build/start command, health check and env. It is
  explicitly marked as requiring the PostgreSQL migration first, because Render
  cannot share one disk across services and the app uses `node:sqlite`.
- `project/scripts/setup/validate_render.py` — validates both files, every
  Dockerfile `COPY` source, compose build contexts and the shared-volume path.

## 6. Verification results

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npm run typecheck` | **0 errors** |
| Frontend unit/component | `npm test` | **370 passed**, 19 gated (skipped by design) |
| Gated integration (S3/SMTP/SMS/ClamAV) | `npm run test:integration` | **19 passed**, 0 skipped |
| Backend | `npm run test:backend` | **182 passed**, 0 skipped |
| Production build | `npm run build` | **success** |
| Backend import / OpenAPI | `from app.main import app` | **157 paths** |
| Alembic migrations | `alembic upgrade head` on a throwaway DB | **7 tables + 9 indexes**, idempotent |
| Deployment config | `npm run render:validate` | **all checks pass** |
| AI layer | `GET /health` | damage ✅ xgboost ✅ retrieval ✅, 4 OCR backends |
| Live two-runtime start | `npm run start:all` | web 200 / api 200 |
| Live write actions | `project/qa/live_actions.py` | **35/36 2xx**, 0 × 5xx (1 expected duplicate-dispute 409) |
| Live page render | `project/qa/live_pages.py` | **0 hard issues** across 49 pages |

## 7. Remaining issues (honest)

1. **Published app still serves the old build.** Redeploy was rejected with
   `SITES_ACCOUNT_MISMATCH`: app `wbapp_JGdPpSp1s1LVFP1YaC8wtL` belongs to a
   different account. Nothing was published; the existing share link is
   unaffected. Sign in with the original account and redeploy.
2. **The three-service Render split is not deployable yet.** It needs both
   runtimes on one managed PostgreSQL first (`project/infra/render/services.yaml`
   documents the migration steps). Deploying it now would give each service its
   own database.
3. **`deploy/site/` (a full app copy) stays at the root.** It is gitignored, so it
   never reaches Render or the repository, but it must remain for the published
   app card. It is the only top-level directory not part of the four-folder
   structure.
4. **`backend/.venv/` holds the working Python environment.** `npm run intel:*`
   and `npm run test:backend` auto-detect it via `project/scripts/setup/py.mjs`;
   on a fresh machine install `backend/requirements-render.txt` (or
   `requirements.txt`) first.
5. **Integration sinks need one-time Python deps**:
   `python -m pip install -r project/qa/requirements-test.txt`.
6. **`project/archive/` is large** (10 097 files: stale builds, old test DBs,
   legacy copies). It is gitignored and can be deleted at any time once you are
   happy with the tree.
