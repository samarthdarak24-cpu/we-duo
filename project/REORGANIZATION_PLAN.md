# TrustDrive — Safe Reorganization Plan

Created **before any file was moved**. This is the execute-order and safety
contract for the reorganization. Every move is logged in
`project/MIGRATION_MANIFEST.json` by `project/reorganize.py` and is reversible
from that manifest.

## 1. Architecture as actually found (live inspection, not reports)

| Layer | Runtime | Entry point | Data |
|---|---|---|---|
| `frontend/` | Next.js 14 (Node 22, `node:sqlite`) | `frontend/next.config.mjs` → `app/api/v1/**` (117 routes) | shared SQLite `.data/trustdrive.db` |
| `backend/` | FastAPI (uvicorn :8000) | `backend/app/main.py` (`--app-dir backend`) | **same** SQLite file via SQLAlchemy; `TD_MODEL_DIR` → `services/ai/shared/models` |
| `services/ai/` | model weights + adapter source (OCR / YOLO / XGBoost / LLM / LangChain) | imported by `backend/app/*` | `.json`, `.pt`, `.csv`, `.onnx` |
| `scripts/`, `qa/`, `docs/`, `tests/`, `infra/`, `infrastructure/` | supporting tooling | referenced by root `package.json`, CI, Docker | none |
| `deploy/site/` | published copy of the Next app | `start.sh` → `next start` | own `.data` |

Both app runtimes must keep their **own directory names and internal layout**:
`next.config.mjs` resolves `repoRoot = dirname(frontend)` and
`backend/app/config.py` resolves `REPO_ROOT = parents[2]`. Moving either one
changes the shared `.data` path and breaks the single-database guarantee.

## 2. Defects found in the current tree (must be fixed, not just tidied)

1. `frontend/tests/`, `frontend/e2e/`, `backend/tests/` are **empty** while
   `vitest.config.ts` (`include: tests/**/*`), `playwright.config.ts`
   (`testDir: ./e2e`) and pytest still point there. `npm test` currently exits 1
   with `No test files found`. Test files use relative imports
   (`../lib/server/engine`), so they **must** live under `frontend/tests/`.
2. `render.yaml` → `dockerfilePath: ./Dockerfile.render`, but the file now lives
   at `infra/docker/Dockerfile.render`. Render would fail to build.
3. `infra/docker/Dockerfile.render` → `COPY infrastructure/scripts/start-render.sh`,
   but `infrastructure/scripts/` is empty; the real supervisor is
   `infra/deployment/start-render.sh`. Broken COPY.
4. The Dockerfile never copies `services/`, yet `backend/app/config.py` defaults
   `TD_MODEL_DIR` to `services/ai/shared/models` → models missing in the image.
5. `.env.example` still says `TD_MODEL_DIR=ai-services/shared/models` (stale).
6. `infra/docker/docker-compose.yml` uses `context: ./frontend` relative to its
   own directory → resolves to a non-existent path.
7. CI (`docker build -f Dockerfile.render`) and root `package.json` scripts point
   at paths that will move.
8. `AGENTS.md` was moved to `docs/project/AGENTS.md`, so it is no longer injected
   as repository guidance.

## 3. Target tree

```
ROOT/
├── frontend/          Next.js app (internal layout UNCHANGED; tests restored)
├── backend/           FastAPI app (internal layout UNCHANGED; tests restored)
├── services/          AI/ML: ai/{ocr,llm,computer_vision,fraud_detection,
│                     langchain,xgboost,shared}
├── project/           ALL supporting material
│   ├── docs/          every Markdown report/guide (incl. root *.md except README)
│   ├── qa/            QA harnesses, evidence, results
│   ├── scripts/       build/seed/setup/deploy helper scripts
│   ├── tests/         cross-cutting QA suites (non-runnable copies)
│   ├── infra/
│   │   ├── docker/        Dockerfile.render, docker-compose.yml
│   │   ├── deployment/    start-render.sh, start-server.bat
│   │   └── render/        per-service YAML (frontend / backend / ai)
│   ├── assets/        screenshots and reference images
│   ├── legacy/        old static showcase / deploy copies
│   └── archive/       duplicate + outdated files, staged not deleted
├── render.yaml        deployable combined Render blueprint
├── .env.example, .gitignore, .dockerignore, .gitattributes, .node-version
├── README.md, AGENTS.md, LICENSE, package.json
└── .git/, .github/, .data/, node_modules/, .workbuddy-ai/, .wbapp_*.genie
```

## 4. Protected — NEVER moved or deleted

`.git/`, `.github/`, `.workbuddy-ai/` (project data, not a cache), `.data/`
(live database), `node_modules/`, `backend/.venv/`, `.env`, the `.wbapp_*.genie`
app card, `.kilo/worktrees/` (registered git worktrees — removing them corrupts
git metadata), `frontend/app|components|lib|public|scripts`, `backend/app|alembic`.

## 5. Move table (whole-directory renames where possible)

| From | To | Reason |
|---|---|---|
| `docs/` | `project/docs/` | documentation |
| `qa/` | `project/qa/` | QA harnesses/evidence |
| `scripts/` | `project/scripts/` | helper scripts |
| `tests/frontend/*` | `frontend/tests/` | **restore** runnable Vitest suites |
| `tests/e2e/*` | `frontend/e2e/` | **restore** Playwright specs |
| `tests/backend/*` | `backend/tests/` | **restore** pytest suites |
| `tests/ai`, `tests/fixtures`, `tests/*` root files | `project/tests/` | cross-cutting QA |
| `infra/docker`, `infra/deployment` | `project/infra/` | deployment config |
| `infrastructure/` (empty) | `project/archive/infrastructure/` | obsolete duplicate |
| `deploy/` (static showcase parts) | `project/legacy/deploy/` | obsolete copy; `deploy/site` preserved |
| root `IMPLEMENTATION_STATUS.md`, `PRODUCTION_READINESS_REPORT.md` | `project/docs/` | reports |
| root `*.log`, `verify*.txt`, `test_results.txt` | `project/archive/` | stale outputs |
| `frontend/.next_*` stale builds | `project/archive/builds/` | generated clutter |
| `docs/project/AGENTS.md` | root `AGENTS.md` | essential agent guidance |

Note: **`deploy/site/` stays where it is** — the published app card points at
that exact `localDir`. Moving it would orphan the live application.

## 6. Config rewrites (all path references)

`render.yaml` · `project/infra/docker/Dockerfile.render` ·
`project/infra/docker/docker-compose.yml` · `.github/workflows/ci.yml` ·
root `package.json` · `frontend/vitest.config.ts` ·
`frontend/playwright.config.ts` · `frontend/tsconfig.json` ·
`.env.example` · `.gitignore` · `.dockerignore` ·
`project/scripts/start-local.mjs` · `project/qa/run-integration-tests.mjs` ·
`start-server.bat` (via root npm script).

Also clean `frontend/tsconfig.json`'s long list of stale `.next_*` includes down
to `.next/types/**/*.ts`.

## 7. Deployment YAML for all services

Keep root `render.yaml` as the **deployable combined** blueprint (one web
service, one persistent disk, Next + FastAPI + worker). Render free plan cannot
share a disk between services and the app uses `node:sqlite`, so splitting it
into three live services would break the single-database guarantee.

Add `project/infra/render/services.yaml` describing the three logical
components (`web`, `api`, `ai`) with ports, health checks, commands and env —
valid YAML, clearly marked as the future Postgres-backed split blueprint.

## 8. Verification (must all pass)

1. `npx tsc --noEmit` (frontend)
2. `npm test` — restored Vitest suites
3. `npm run test:integration` — gated S3/SMTP/SMS/ClamAV suites with real sinks
4. `npm run build` — production Next build
5. `python -m pytest -q` (backend) + OpenAPI smoke
6. AI checks: `/health`, `available_backends()`, model dir resolution
7. `alembic upgrade head` against a **throwaway** SQLite file (never the live DB)
8. YAML validation of `render.yaml` + `services.yaml`; verify every Dockerfile
   `COPY` source exists; `docker compose config` if Docker is available
9. Live smoke: `npm run start:all`, then authenticated endpoint probes

## 9. Rollback

`project/MIGRATION_MANIFEST.json` records `(src, dst)` for every move.
`project/reorganize.py --rollback` reverses them in reverse order. Config edits
are committed to git, so `git diff` is the second rollback path.
