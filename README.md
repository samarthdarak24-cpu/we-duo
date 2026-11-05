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

## Quick start (local, no Docker daemon)

Requirements: **Node 22.5+** (`node:sqlite` is built-in), Python 3.12+, npm.

```bash
# 1. Frontend (Next.js — lives in frontend/)
cd frontend
npm ci
npm run seed:reset                 # 13 demo vehicles + 3 required negative examples
npm run dev                        # http://localhost:3000

# 2. Backend (FastAPI — lives in backend/), optional second terminal
cd ../backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd ..
npm run intel:migrate              # Alembic baseline for the Python-owned tables
npm run intel:serve                # http://127.0.0.1:8000/docs
npm run intel:worker               # DB-backed background jobs
```

The repository **root is a thin workspace wrapper**: `npm run dev`, `npm run build`,
`npm run intel:*` and `npm run test:e2e` all delegate into `frontend/` or `backend/`.
You can also `cd` straight into either folder and run the commands there.

The web app runs fine without the Python service; every integration degrades
with an explicit status rather than a fake result.

---

## Repository layout

```
trustdrive/
├── frontend/          # Next.js 14 App Router — system of record, UI, REST API
│   ├── app/           # routes + app/api/v1 REST endpoints
│   ├── components/    # React + React-Three-Fiber components
│   ├── lib/           # server domain/data layer, auth, RBAC
│   ├── public/        # static assets incl. 3D GLB models
│   ├── e2e/           # Playwright end-to-end specs
│   ├── scripts/       # seed, schema dump, build helpers
│   └── package.json   # frontend deps + scripts
├── backend/           # FastAPI intelligence service + DB-backed worker
│   ├── app/           # routers, detectors, investigator agent, worker
│   ├── alembic/       # additive-only migrations
│   ├── scripts/       # eval_llm, fetch_models, training helpers
│   └── requirements*.txt
├── ai-services/       # shared ML assets (kept out of both code trees)
│   └── shared/
│       ├── models/    # car_damage.pt, mileage_xgb.json, MODEL_REGISTER.json
│       └── data/      # datasets, eval logs
├── infrastructure/    # deploy glue (start-render.sh supervisor)
├── docs/              # detailed design, API, RBAC, ERD, deployment docs
├── docker-compose.yml # local: web + api + worker (+ optional Postgres/Redis)
├── Dockerfile.render  # combined Render image (Next + FastAPI + worker)
├── render.yaml        # Render Blueprint (one web service, 10 GB disk)
└── package.json       # root workspace wrapper (delegates to frontend/backend)
```

Both runtimes share one SQLite file at `.data/trustdrive.db` and one `.env` at
the repository root, so the web app and the Python service never drift apart.

### Demo logins (password `demo1234` for all)

| Role | Email |
| --- | --- |
| Admin | `admin@trustdrive.dev` |
| Seller | `samarth@trustdrive.dev`, `aditya@trustdrive.dev` |
| Buyer | `rohan@trustdrive.dev`, `priya@trustdrive.dev`, `arjun@trustdrive.dev` |

---

## Architecture

```
Next.js 14 App Router (51 pages, 102 REST routes)   <- system of record
  app/api/v1/*        REST + Zod validation + JWT/scrypt auth + RBAC
  lib/server/data.ts  domain layer over the shared DB
  .data/trustdrive.db node:sqlite, SCHEMA_VERSION 3, 51 tables
        ^ shared file, two runtimes, no removed feature
Python FastAPI backend (backend/)
  /api/backend/*       auth, users, vehicles, documents, history, mileage,
                       verification, AI, damage, listings, search, saved,
                       compare, inquiries, reports (real PDF), QR, notifications,
                       audit/admin — same scrypt+HS256 users as Next.js
  /api/intelligence/*  OCR pipeline, fraud detectors, 12-node investigator,
                       trust score, background_jobs worker, integrity drift
  SQLAlchemy 2.x reflects the live schema; Alembic migrations are additive only
```

Frontend: React 18, TypeScript, Tailwind 3.4, GSAP/ScrollTrigger,
three 0.169 + React Three Fiber + Drei (**real GLB** at `public/models/car.glb`),
Recharts, Zustand, Zod, lucide-react, qrcode.

### Design system

Day mode is the original graphite + champagne-gold UI. Night mode is a premium
blue-and-white portal theme. Both are scoped CSS variables; neither changes
business logic. See `design.md` and `newdesign (3).md`.

---

## Feature map

| Area | Seller | Buyer |
| --- | --- | --- |
| Overview | 4 KPIs, alerts, document completeness, listing readiness | explored, saved, recently viewed, trust score, insights, price estimate |
| Vehicles | add wizard, my vehicles, detail, archive | explore, search + filters, detail, verification |
| Evidence | documents, history, verification center, fraud analysis | history, mileage analysis, AI risk, theft checks |
| 3D | component selection + DB-backed damage hotspots | rotate, presets, full-screen, damage/repair evidence |
| Marketplace | listings editor, **8-action Listing Features bar**, inquiries | compare (2–4), saved, inquiries, suspicious-listing report |
| Reports | verification report, PDF, QR share link | full report, PDF download, QR verification |
| Account | settings, notifications, KYC, 2FA, sessions | settings, notifications, profile |

---

## Required negative demo examples (seeded)

| Example | Where |
| --- | --- |
| Suspicious mileage (rollback / flagged reading) | mileage history + `/seller/fraud`, `/buyer/risk` |
| Duplicate document (identical SHA-256) | documents + duplicate detector |
| VIN mismatch | findings + identity-mismatch detector |

---

## Verification commands

```bash
npm run typecheck       # TypeScript (cd frontend && tsc --noEmit)
npm test                # Vitest: engine, chain, DB intelligence, validation, RTL component
npm run build           # Next.js production build
npm run intel:test      # Pytest: FastAPI, detectors, agent, worker, 18-step workflow
npm run test:e2e        # Playwright 15-step E2E (needs a running seeded app)
npm run schema:dump     # regenerate docs/ERD.md from the live schema
```

---

## Documentation map

| File | Contents |
| --- | --- |
| `newdesign (3).md` | Master UI/feature specification + 16 coding-agent rules |
| `design.md` | Design tokens, component rules, agent operating rules |
| `ARCHITECTURE.md` | Actual stack, directory layout, route map, schema, auth |
| `TECH_STACK.md` | Compatibility audit: installed vs deliberately not installed |
| `docs/ERD.md`, `docs/ER_DIAGRAM.md` | Live-schema entity relationships (51 tables) |
| `docs/API_SPECIFICATION.md` | Actual REST endpoints, schemas, auth, errors |
| `docs/RBAC_MATRIX.md` | Exact seller / buyer / admin permissions |
| `docs/DEPLOYMENT.md` | Local, Docker Compose, production, backup/restore |
| `docs/SECURITY.md` | Controls, threat model, known limitations |
| `docs/TESTING.md` | Commands, scenarios, latest results |
| `IMPLEMENTATION_STATUS.md` | Phase-by-phase completion tracker |
| `BUGS_AND_GAPS.md` | Verified defects, fixes and residual gaps |
| `IMPLEMENTATION_REPORT.md` | §20 final report: done / pending / blockers |
| `AGENTS.md` | Mandatory rules for coding agents |

---

## Known, explicitly-labelled limitations

- PaddleOCR, YOLO, XGBoost, LangGraph, Celery/Redis, Postgres and S3 are
  **adapter slots / production targets**, not active local integrations. Each
  response names the active backend. See `TECH_STACK.md`.
- There is no labelled fraud corpus, so no supervised classifier is fitted.
- No external India vehicle registry is called; VIN/registration checks are
  against the local database only (MoRTH data-sharing constraints).
- A SHA-256 match proves a stored file is unchanged, **not** that the original
  document was genuine. Blockchain anchoring is intentionally not claimed.
- The GLB is a generic vehicle asset, not a scan of a specific car. Separate
  named sub-meshes are not present in the supplied model, so an exploded view
  is omitted (the checklist allows this when the model lacks separated parts).
