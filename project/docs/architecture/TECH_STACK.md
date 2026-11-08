# TrustDrive — Tech Stack & Compatibility Audit

> **Last updated:** 2026-11-05 · Phase 0 deliverable.
> Every item below is either (a) already installed and used, (b) added in this
> effort with a stated reason, or (c) deliberately **not** installed because the
> checklist's own rule applies: *"Never install every library simply for the sake
> of using it."*

## 1. Frontend — required vs actual

| Checklist item | Status | Evidence / decision |
| --- | --- | --- |
| Next.js App Router | ✅ installed | `next@14.2.35`, 48 routes under `app/` |
| React | ✅ installed | `react@18`, RSC + client components |
| TypeScript | ✅ installed | `typescript@5`, `strict: true`, `npx tsc --noEmit` clean |
| Tailwind CSS | ✅ installed | `tailwindcss@3.4`, token map in `tailwind.config.ts` |
| Lucide React icons | ✅ installed | `lucide-react@1.68`, wrapped by `components/shared/Icon.tsx` |
| GSAP + ScrollTrigger | ✅ installed | 291-frame pinned hero, `CinematicCarScrollytelling.tsx` |
| Three.js / R3F / Drei | ✅ installed | `three@0.169`, `@react-three/fiber@8`, `@react-three/drei@9` |
| Zustand | ✅ installed | `zustand@5`, client stores (theme, viewer state) |
| Zod | ✅ installed | `zod@4`, request + form validation |
| Recharts | ✅ installed | `recharts@3`, dashboard charts |
| Playwright | 🔜 added | E2E in `e2e/` — see §4 |
| shadcn/ui + Radix UI | ⚠️ **not adopted** | The design system is token-driven and bespoke (black/champagne-gold, `rounded-pill`, `.portal-canvas` theming). Radix primitives would add a second, conflicting component vocabulary and a large dependency surface for dialogs/popovers already implemented in `components/shared/`. Adopted instead: **headless-a11y conventions** (focus rings, roles, `aria-*`) on the existing primitives. |
| Framer Motion | ⚠️ **not adopted** | GSAP + ScrollTrigger already own animation and are load-bearing for the pinned hero. Running two animation engines on one element causes layout-thrash conflicts. |
| TanStack Query | ⚠️ **not adopted** | Portals are server-rendered (RSC) and read the DB directly; the handful of client mutations use plain `fetch` with explicit busy/error state. A cache layer would add invalidation risk without removing a request. |
| React Hook Form | ⚠️ **not adopted** | Forms are small and already validated with Zod on **both** sides (`lib/server/validate.ts` + component checks). RHF would duplicate that rather than replace it. |

## 2. Backend — required vs actual

| Checklist item | Status | Evidence / decision |
| --- | --- | --- |
| Python | ✅ | `3.12.10` |
| FastAPI | ✅ | `0.115.0` → `services/intelligence/app/main.py` |
| Pydantic | ✅ | `2.13.5` (v2) |
| SQLAlchemy 2.x | ✅ | `2.0.36`, declarative models for every shared entity |
| Alembic | ✅ | `1.13.2`, additive migrations for the intelligence entities |
| PostgreSQL | ⚙️ production target | Local runs use the shared SQLite file (`node:sqlite` + SQLAlchemy) so one database serves both runtimes with no daemon. `TD_DB_URL=postgresql+psycopg://…` switches both apps to Postgres; `docker-compose.yml` provides it. |
| Redis | ⚙️ production target | `TD_BROKER_URL`; local default is the DB-backed `background_jobs` queue + `python -m app.worker`. |
| Celery | 🔜 wired, optional | `celery` is **not installed by default**: a Celery app that cannot reach a broker is a silent failure mode. `app/tasks.py` defines the real task bodies and a Celery app is created only when `TD_BROKER_URL` is set; otherwise the same functions run on the DB-backed worker. Installing `celery redis` is documented in `docs/DEPLOYMENT.md`. |
| REST APIs | ✅ | Next.js `app/api/v1/*` (86 route files) + FastAPI `/api/*` |
| OpenAPI | ✅ | FastAPI auto `/openapi.json`, `/docs`; the Next.js surface is documented by hand in `docs/API_SPECIFICATION.md` (Next 14 has no built-in generator). |
| S3/MinIO | ⚙️ production target | `lib/server/files.ts` stores under `.data/uploads` behind a key interface; `TD_S3_*` selects the S3 adapter. |

## 3. AI / ML

| Checklist item | Status | Decision |
| --- | --- | --- |
| LangGraph | ✅ `1.2.14` | 15/16-node conditional investigator (EV adds `EVBatteryAnalysisNode`) with checkpointer + human-in-the-loop interrupt |
| LangChain | ⚠️ **not installed** | LangGraph 1.x + a thin provider adapter covers everything needed; LangChain would add ~40 packages for no capability gain. |
| LLM provider adapter | ✅ | `services/intelligence/app/llm.py` — OpenAI/Anthropic-compatible HTTP through `TD_LLM_*`; offline it returns *no conclusion* rather than a fabricated one. `anthropic@2.3.0` is already present in the environment. |
| PaddleOCR | ⚠️ adapter | `app/ocr.py` exposes `OcrBackend`. `PaddleOcrBackend` activates when `paddleocr`+`paddlepaddle` import; otherwise `PdfTextBackend` (PyMuPDF, real text layer) and `OpenCVPreprocessBackend` run. Output always carries `method` and `engine` so a fallback is never presented as OCR. |
| OpenCV | ✅ `opencv-python-headless 5.0` | Deskew, denoise, adaptive threshold, contour/table heuristics, image-comparison signals |
| PyMuPDF | ✅ `2.0` | PDF text + metadata extraction |
| Scikit-learn | ✅ `1.9.1` | Isolation Forest + Local Outlier Factor on mileage/feature matrices |
| XGBoost | ⚠️ **not installed** | Rule: "when suitable training data exists". There is no labelled fraud corpus in the repo, so a gradient-boosted classifier would be theatre. The estimator interface (`app/detectors/base.py`) is ready for one. |
| YOLO (ultralytics) | ⚠️ **not installed** | No trained damage weights and no torch in this environment. Damage intelligence ships as validated OpenCV signals (edge/gradient anomalies, duplicate-image hashing) + human inspector confirmation; the `DamageDetector` slot accepts a YOLO backend when weights exist. |
| Sentence Transformers / pgvector | ⚠️ **not installed** | Evidence retrieval is a relational, permission-filtered query set — small, exact and auditable. Embedding search would add an unexplainable similarity hop to fraud evidence. |
| SHAP | ⚠️ **not installed** | The scoring models are additive and linear by construction, so per-feature contributions are computed exactly (`app/explain.py`). SHAP is for opaque models; the exact attribution is strictly better here. |

**Why this matters:** the checklist's Definition of Done says *"For unavailable
external APIs, implement an adapter and clearly label demo data instead of
claiming real verification."* Every optional ML dependency above follows that
rule — the adapter exists, the active backend is reported in the payload, and
nothing is asserted that the running code cannot compute.

## 4. Testing & tooling

| Tool | Status | Scope |
| --- | --- | --- |
| Vitest | ✅ `1.6` | `tests/engine`, `tests/chain`, `tests/api.readonly`, `tests/public-site` + new suites |
| React Testing Library | 🔜 added | Component behaviour: forms, filters, action bar, states |
| Playwright | 🔜 added | 15-step seller→buyer E2E on persisted data |
| Pytest + HTTPX | ✅ installed | FastAPI TestClient, pipeline + detector + agent tests |
| GitHub Actions | 🔜 | `.github/workflows/ci.yml`: typecheck, vitest, build, pytest, Playwright |

## 5. Infrastructure

Docker + Docker Compose (`frontend`, `api`, `worker`, `postgres`, `redis`),
structured JSON logs (`app/logging.py` + Next.js request logging), health
endpoints on both runtimes, environment-specific config (`.env.example`),
backup/restore scripts and `docs/{DEPLOYMENT,SECURITY,API_SPECIFICATION,TESTING}.md`.
OpenTelemetry and a hosted error-monitoring SaaS are **not** wired into a local
demo: they require external accounts. The log/health contract they consume is in
place and documented.

## 6. Compatibility verdict

No dependency in the current graph conflicts with anything added. The two real
constraints discovered during the audit are **runtime**, not package, related:

1. `node:sqlite` requires **Node 22.5+** (this machine: v24.19.0) and is the only
   database driver usable without a daemon — which is exactly why it is the local
   shared store for both runtimes.
2. Two Next.js servers cannot share one `.next` directory (see `ARCHITECTURE.md` §10).
