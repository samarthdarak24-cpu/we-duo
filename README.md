# TrustDrive

**AI-powered vehicle history verification, fraud detection and a transparent used-car marketplace.**

Two roles share **one backend, one vehicle database and one verification engine**:

- **SELLER** — registers vehicles, uploads records, completes verification, publishes listings, manages buyer inquiries.
- **BUYER** — discovers vehicles, investigates history, checks fraud indicators, explores 3D damage records, compares vehicles and contacts sellers.

> **Honesty principle.** Nothing is presented as a real verification unless the
> running code computed it. Missing providers are labelled as adapters; demo
> data is labelled as demo data. AI findings always cite evidence IDs, method
> and version.

---

## Quick start

Requirements: **Node 22.5+** (`node:sqlite` is built-in), Python 3.12+, npm.

```bash
npm ci --prefix frontend          # install frontend dependencies
npm run seed:reset                # 13 demo vehicles + 3 required negative examples
npm run start:all                 # starts FastAPI (127.0.0.1:8000) then Next.js (:3000)
```

`npm run start:all` launches **both runtimes** and shuts them down together. Starting
only `npm start` leaves the Python-backed features (OCR, damage review, AI
investigations, system status) reporting an honest `502`/`409` instead of a result.

Manual alternative:

```bash
npm run intel:serve               # FastAPI  → http://127.0.0.1:8000/docs
npm run intel:worker              # DB-backed background jobs (optional)
npm run dev                       # Next.js  → http://localhost:3000
```

The web app runs fine without the Python service: every integration degrades
with an explicit status rather than a fake result.

---

## Repository layout

```
trustdrive/
├── frontend/                    # Next.js 14 App Router — system of record, UI, REST API
│   ├── app/                     # pages + app/api/v1 REST endpoints (117 routes)
│   ├── components/              # React + React-Three-Fiber components
│   ├── lib/                     # server domain/data layer, auth, RBAC
│   ├── public/                  # static assets incl. real 3D GLB models
│   ├── tests/                   # Vitest unit/component suites (run by this app)
│   ├── e2e/                     # Playwright end-to-end specs
│   └── scripts/                 # seed, schema dump, build helpers
├── backend/                     # FastAPI intelligence service + DB-backed worker
│   ├── app/                     # routers, detectors, investigator agent, worker
│   │   └── intelligence/        # thin re-exports of services/ai (stable import surface)
│   ├── alembic/                 # additive-only migrations
│   ├── scripts/                 # model fetch/train/eval helpers
│   └── tests/                   # Pytest suites (run by this app)
├── services/                    # ALL AI/ML code + assets
│   └── ai/
│       ├── ocr/                 # document OCR adapters (RapidOCR / PaddleOCR / PDF text layer)
│       ├── computer_vision/     # YOLO damage detection
│       ├── xgboost/             # mileage anomaly model
│       ├── fraud_detection/     # fraud model metadata
│       ├── langchain/           # retrieval, rules, scoring helpers
│       ├── llm/                 # evaluation metrics
│       └── shared/              # models/ (weights + register) and data/ (datasets)
├── project/                     # everything that supports the two runtimes
│   ├── docs/                    # architecture, API, RBAC, ERD, deployment, reports
│   ├── qa/                      # live QA harnesses, sinks, evidence, results
│   ├── scripts/                 # start-local, model build, secret scan, deploy helpers
│   ├── tests/                   # cross-cutting QA notes/support
│   ├── infra/
│   │   ├── docker/              # Dockerfile.render + docker-compose.yml
│   │   ├── deployment/          # start-render.sh supervisor
│   │   └── render/              # three-service scale-out blueprint
│   ├── legacy/                  # old static showcase copies (not deployed)
│   └── archive/                 # duplicates / stale builds, staged not deleted
├── render.yaml                  # Render Blueprint (one web service + 10 GB disk)
├── package.json                 # workspace commands (delegate into frontend/backend)
├── .env.example                 # every supported variable, no secrets
└── AGENTS.md                    # mandatory rules for coding agents
```

Both runtimes share one SQLite file at `.data/trustdrive.db` and one `.env` at
the repository root, so the web app and the Python service never drift apart.
`backend/app/config.py` resolves `REPO_ROOT` as `backend/..` and
`frontend/next.config.mjs` resolves it as `frontend/..` — that is why the two
application directories keep their names.

### Demo logins (password `demo1234` for all)

| Role | Email |
| --- | --- |
| Admin | `admin@trustdrive.dev` |
| Seller | `samarth@trustdrive.dev`, `weduo@trustdrive.dev` |
| Buyer | `aditya@trustdrive.dev`, `rohan@trustdrive.dev`, `priya@trustdrive.dev` |

---

## Architecture

```
Next.js 14 App Router (frontend/)                   <- system of record
  app/api/v1/*        REST + Zod validation + JWT/scrypt auth + RBAC
  lib/server/data.ts  domain layer over the shared DB
  .data/trustdrive.db node:sqlite, shared file
        ^ one database, two runtimes, no removed feature
Python FastAPI backend (backend/)
  /api/backend/*       auth, users, vehicles, documents, history, mileage,
                       verification, AI, damage, listings, search, saved,
                       compare, inquiries, reports (real PDF), QR, notifications,
                       audit/admin — same scrypt+HS256 users as Next.js
  /api/intelligence/*  OCR pipeline, fraud detectors, 15/16-node conditional
                       investigator, trust score, background_jobs, integrity drift
  services/ai/*        model adapters (OCR, YOLO, XGBoost, retrieval, LLM metrics)
  SQLAlchemy 2.x reflects the live schema; Alembic migrations are additive only
```

Frontend: React 18, TypeScript, Tailwind 3.4, GSAP/ScrollTrigger,
three 0.169 + React Three Fiber + Drei (**real GLB** at `public/models/`),
Recharts, Zustand, Zod, lucide-react, qrcode, viem.

### Design system

Day mode is the original graphite + champagne-gold UI. Night mode is a premium
blue-and-white portal theme. Both are scoped CSS variables; neither changes
business logic. See `project/docs/project/design.md` and
`project/docs/project/newdesign (3).md`.

---

## Feature map

| Area | Seller | Buyer |
| --- | --- | --- |
| Overview | 4 KPIs, alerts, document completeness, listing readiness | explored, saved, recently viewed, trust score, insights, price estimate |
| Vehicles | add wizard, my vehicles, detail, archive | explore, search + filters, detail, verification |
| Evidence | documents, history, verification center, fraud analysis | history, mileage analysis, AI risk, theft checks |
| 3D | component selection + DB-backed damage hotspots | rotate, presets, full-screen, damage/repair evidence |
| Marketplace | listings editor, 8-action Listing Features bar, inquiries | compare (2–4), saved, inquiries, suspicious-listing report |
| Reports | verification report, PDF, QR share link | full report, PDF download, QR verification |
| Account | settings, notifications, KYC, 2FA, sessions | settings, notifications, profile |

---

## Verification

```bash
npm run typecheck          # TypeScript (frontend)
npm test                   # Vitest unit + component suites
npm run test:integration   # gated S3 / SMTP / SMS / ClamAV suites against real local sinks
npm run test:backend       # Pytest (FastAPI, detectors, agent, worker)
npm run build              # Next.js production build
npm run render:validate    # render.yaml + Dockerfile + compose consistency
npm run test:e2e           # Playwright E2E (needs a running seeded app)
npm run schema:dump        # regenerate project/docs/ERD.md from the live schema
```

`npm run test:integration` needs the sink dependencies once:

```bash
python -m pip install -r project/qa/requirements-test.txt
```

---

## Deploy to Render

`render.yaml` is the deployable blueprint: **one** web service running Next.js +
FastAPI + the job worker from a single image, with a 10 GB persistent disk at
`/data`. This is required because the Next.js layer uses `node:sqlite` and the
FastAPI service reads the same file, and Render cannot mount one disk into
several services.

1. Push the repository to GitHub.
2. Render → **New → Blueprint** → select the repository (it reads `render.yaml`).
3. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the dashboard on first deploy.
4. Health check: `/api/v1/health/ready`.

`project/infra/render/services.yaml` documents the optional three-service
split (`trustdrive-web`, `trustdrive-api`, `trustdrive-ai-worker`). It requires
migrating both runtimes to a managed PostgreSQL first — see the header of that
file and `project/docs/deployment/DEPLOYMENT.md`.

---

## Documentation map

| File | Contents |
| --- | --- |
| `project/docs/project/newdesign (3).md` | Master UI/feature specification + coding-agent rules |
| `project/docs/project/design.md` | Design tokens, component rules, agent operating rules |
| `project/docs/architecture/ARCHITECTURE.md` | Actual stack, directory layout, route map, schema, auth |
| `project/docs/architecture/TECH_STACK.md` | Compatibility audit: installed vs deliberately not installed |
| `project/docs/ERD.md`, `project/docs/ER_DIAGRAM.md` | Live-schema entity relationships |
| `project/docs/api/API_SPECIFICATION.md` | Actual REST endpoints, schemas, auth, errors |
| `project/docs/RBAC_MATRIX.md` | Exact seller / buyer / admin permissions |
| `project/docs/deployment/DEPLOYMENT.md` | Local, Docker Compose, production, backup/restore |
| `project/docs/SECURITY.md` | Controls, threat model, known limitations |
| `project/docs/TESTING.md` | Commands, scenarios, latest results |
| `project/docs/IMPLEMENTATION_STATUS.md` | Phase-by-phase completion tracker |
| `project/REORGANIZATION_PLAN.md` | How this tree was produced (move table + rollback) |
| `AGENTS.md` | Mandatory rules for coding agents |

---

## Known, explicitly-labelled limitations

- PaddleOCR, YOLO, XGBoost, LangGraph, Celery/Redis, Postgres and S3 are
  **adapter slots / production targets**. Each response names the active backend.
  See `project/docs/architecture/TECH_STACK.md`.
- OCR prefers RapidOCR/ONNX (~5 s per image). PaddleOCR is available but its
  first CPU inference measured ~96 s, so it is opt-in via `TD_OCR_PROVIDER`.
- There is no labelled fraud corpus, so no supervised classifier is fitted.
- No external India vehicle registry is called; VIN/registration checks run
  against the local database only (MoRTH data-sharing constraints).
- A SHA-256 match proves a stored file is unchanged, **not** that the original
  document was genuine. Blockchain anchoring is intentionally not claimed.
- The GLB is a generic vehicle asset, not a scan of a specific car.
