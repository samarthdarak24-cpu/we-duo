# TrustDrive — Tech Stack Decisions

> Every row states what actually runs, and why an alternative was not adopted.
> Rule from the checklist: "Do not add both Celery and another queue, multiple
> ORMs, multiple UI kits, or multiple agent frameworks without a documented
> reason." This file is that documentation.

## 1. Runtime decisions

| Responsibility | Chosen | Not chosen | Reason |
| --- | --- | --- | --- |
| Web app | Next.js 14 App Router + React 18 + TS 5 | Vite SPA | Server components + route handlers already implemented; rewriting removes working functionality |
| Public REST | Next.js route handlers (`/api/v1`) | separate Node API | One deployable, one auth layer, 88 working routes |
| Backend API | FastAPI (`/api/v1` + `/api/backend`) | Django/Flask | FastAPI + Pydantic v2 gives typed schemas and OpenAPI for free |
| ORM | SQLAlchemy 2.x **reflection** over the shared DB | Prisma/Drizzle (second ORM) | The Next.js seed owns the schema; a second declarative model set would drift |
| Migrations | Alembic (additive) | Alembic owning the whole schema | Rewriting the live 51-table schema risks data loss |
| DB local | `node:sqlite` (built-in) | Postgres daemon | No daemon required; Node 22.5+ ships the driver |
| DB prod | PostgreSQL via `TD_DB_URL` | — | Documented production target |
| Queue | `background_jobs` table + Python worker | Redis/Celery by default | A Celery app without a broker is a silent failure; Celery activates only with `TD_BROKER_URL` |
| Storage | `.data/uploads` behind `settings.upload_dir` | S3 SDK by default | Local demo needs no credentials; `TD_S3_*` is the adapter target |
| Auth | scrypt + HS256, implemented identically in TS and Python | two auth systems | One `users` table and one token format across both runtimes |

## 2. UI decisions

| Responsibility | Chosen | Not chosen | Reason |
| --- | --- | --- | --- |
| Styling | Tailwind 3.4 + bespoke token system | shadcn/ui + Radix | The design is token-driven (`.portal-canvas`, gold accents); Radix adds a second component vocabulary |
| Motion | GSAP + ScrollTrigger | Framer Motion | Two animation engines on one element cause layout thrash; GSAP already owns the hero |
| Server state | RSC + plain `fetch` with busy/error state | TanStack Query | Portals are server-rendered; a cache layer adds invalidation risk without removing a request |
| Forms | Zod on both sides | React Hook Form | Forms are small; Zod already validates server-side and in components |
| Icons | lucide-react via `components/ui/Icon.tsx` | mixed icon sets | One stroke weight, one import surface |
| Charts | Recharts 3 | custom SVG | Accessible defaults, small API |

## 3. AI / ML decisions

| Capability | Chosen | Not chosen | Reason |
| --- | --- | --- | --- |
| OCR | PyMuPDF text layer + OpenCV preprocessing; **PaddleOCR adapter** | PaddleOCR mandatory | Heavy install; the adapter activates when present and the payload names the active engine |
| Anomaly ML | scikit-learn Isolation Forest + LOF | XGBoost | No labelled fraud corpus exists; a supervised model would be theatre |
| Explainability | exact additive attribution (`app/explain.py`) | SHAP | The score is linear/additive, so per-feature contributions are exact |
| Agent | LangGraph 15/16 conditional nodes with checkpointer; sequential fallback | LangChain chains | LangGraph gives explicit state + interrupt; LangChain would add ~40 packages |
| LLM | provider adapter; offline = **no conclusion** | always-on LLM | Never fabricate a verification; offline returns a deterministic evidence-only answer |
| Retrieval | relational, permission-filtered queries | pgvector | Evidence is small and exact; embeddings would add an unexplainable similarity hop |
| Damage CV | OpenCV signals + inspector confirmation | YOLO mandatory | No trained weights; YOLO is an adapter slot |
| Trust score | deterministic, versioned, additive | ML score | Must be explainable and auditable; no LLM may set it |

**Activation on this host (verified 2026-11-05):** PyMuPDF, OpenCV, **RapidOCR**
(real image OCR), scikit-learn (IForest/LOF), **XGBoost** (synthetic-demo model,
not used by findings), LangGraph and the keyword retrieval backend are **active**.
PaddleOCR, YOLO damage weights, sentence-transformers and a live LLM are **not
installed/configured**, so those adapters report `available: false` and the
fallback runs. `langgraph 1.2.20` is **active** with a `MemorySaver` checkpointer
(`orchestrator: "langgraph"`, `checkpointing: true`); the sequential executor is
retained only for hosts where the dependency fails to load, and any load error
is surfaced as `agent.error`. No weights are bundled; see
`docs/MODEL_ASSETS.md` and `ASSET_REGISTER.md`.

## 4. Testing decisions

| Level | Tool | Scope |
| --- | --- | --- |
| Unit/component | Vitest + React Testing Library + jsdom | engine, chain, schema, validation, formatting, action bar |
| Backend | Pytest + FastAPI TestClient | API, detectors, agent, worker, 18-step pipeline, backend contract, security |
| E2E | Playwright (opt-in) | 15-step seller→buyer + RBAC |
| CI | GitHub Actions | typecheck, Vitest, build, Pytest; E2E on `workflow_dispatch` |

## 5. Deliberately not installed

`shadcn/ui`, Radix, Framer Motion, TanStack Query, React Hook Form, Prisma,
Drizzle, XGBoost, ultralytics/YOLO, pgvector, sentence-transformers, SHAP,
PaddleOCR (default), Celery/Redis (default), hosted error monitoring.

Each is either replaced by an existing implementation, gated behind an adapter,
or unjustified without data/credentials. See `TECH_STACK.md` for the version
audit and `docs/AI_ML_ARCHITECTURE.md` for the model rationale.
