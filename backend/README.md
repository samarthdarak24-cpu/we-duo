# TrustDrive Intelligence Service

Additive Python runtime that **shares the same database** as the Next.js app.
It owns document intelligence, fraud/anomaly detection, the 12-node
investigation agent, deterministic trust-score explanation and background jobs.
It does **not** replace the Next.js REST API, authentication or portals.

## Run locally (no daemons required)

```bash
python -m pip install -r services/intelligence/requirements.txt
python -m uvicorn app.main:app --app-dir services/intelligence --host 127.0.0.1 --port 8000
```

- Health: `http://127.0.0.1:8000/health`
- OpenAPI: `http://127.0.0.1:8000/docs` and `/openapi.json`
- Worker: `cd services/intelligence && python -m app.worker`

`app/config.py` loads the repo-root `.env` / `.env.local` via `python-dotenv`
(fallback: dependency-free parser) for **every** entrypoint, including
`npm run intel:serve` and the worker. Process environment always wins. To make
the in-app assistant actually use the grounded LLM, set both
`TD_INTELLIGENCE_URL=http://127.0.0.1:8000` (Next.js side) and
`TD_LLM_PROVIDER=local` (this service); see `.env.example` and
`docs/API_SPECIFICATION.md` §5.1–5.2. `GET /health` reports the active LLM.

The default database is `../../.data/trustdrive.db` (the same SQLite file the
Next.js app uses). Override with `TD_DB_URL`; setting a Postgres URL switches
both runtimes when the Next.js side is configured likewise.

## Full backend surface (`/api/backend/*`)

Beyond intelligence, the service exposes the complete backend for every
checklist feature category over the **same database**, authenticated with the
**same scrypt + HS256 credentials** as the Next.js app (one user row, one token).
The Next.js `/api/v1/*` routes remain the public cookie-session surface.

| Category | Prefix / examples |
| --- | --- |
| Authentication | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/me`, `/auth/sessions`, `/auth/change-password`, `/auth/forgot-password`, `/auth/reset-password` |
| Users | `GET/PATCH /users/me`, `/users/me/activity`, `GET /users`, `GET /users/{id}`, `PATCH /users/{id}/kyc` |
| Vehicles | `GET/POST /vehicles`, `GET/PATCH /vehicles/{id}`, `POST /vehicles/{id}/archive` |
| Documents | `GET/POST /vehicles/{id}/documents`, `/vehicles/{id}/documents/completeness` |
| History | `GET/POST /vehicles/{id}/history`, `POST /vehicles/{id}/history/{eventId}/correction` (append-only) |
| Mileage | `GET/POST /vehicles/{id}/mileage` (auto-flags rollbacks + creates a finding) |
| Verification | `GET /vehicles/{id}/verification`, `POST /vehicles/{id}/verify`, `GET /vehicles/{id}/trust`, `POST /verification/lookup`, `GET /verify/{token}` |
| AI analysis | `GET /vehicles/{id}/ai`, `POST /intelligence/investigate`, `POST /intelligence/chat` |
| Damage / inspections | `GET/POST /vehicles/{id}/damage`, `/inspections`, `/accidents`, `/photos` |
| Listings | `GET /marketplace/listings`, `GET/POST/PATCH /seller/listings`, `POST /seller/listings/{id}/{action}`, `/listings/{id}/stats`, `/listings/{id}/share` |
| Search | `POST /marketplace/search` (brand, price, year, km, location, fuel, transmission, verified-only, sort, pagination) |
| Saved | `GET/POST /saved`, `DELETE /saved/{listingId}`, `GET/POST /saved-searches` |
| Comparisons | `POST /compare` (2–4 vehicles) |
| Inquiries | `GET/POST /inquiries`, `GET /inquiries/{id}`, `POST /inquiries/{id}/messages`, `PATCH /inquiries/{id}/status` |
| Reports | `GET/POST /reports`, `GET /reports/{id}`, `GET /reports/{id}/download` (**real PDF, hash re-verified**) |
| QR verification | `POST/DELETE /listings/{id}/share`, `GET /verify/{token}` |
| Notifications | `GET /notifications`, `POST /notifications/{id}/read`, `/notifications/read-all` |
| Audit / admin | `GET /audit`, `GET /jobs`, `POST /jobs/{id}/retry`, `GET /admin/queue`, `/admin/disputes`, `POST /admin/listings/{id}/suspend` |

**Grounded chat:** `POST /api/intelligence/chat` `{vehicle_id?, question}` →
`{answer, provider, model, grounded, citations, llm_rejected, deterministic}`.
The in-app assistant proxies here; rejected or unavailable LLM output falls back
to a deterministic, source-cited answer.

Index: `GET /api/backend`. OpenAPI: `/openapi.json` (**138 paths**: 54 `/api/v1`,
68 `/api/backend`, 13 `/api/intelligence`).
Writes are schema-adaptive and respect CHECK constraints; `chain_records`,
`audit_logs` and `trust_scores` are append-only. History corrections append a
superseding event and never overwrite a verified row.

## Honest adapter policy

Every response names its **active** engine and method:

| Capability | Active locally | Adapter / production target |
| --- | --- | --- |
| OCR | **PaddleOCR 3.7 + RapidOCR (ONNX)** for images; PDF text layer (PyMuPDF); OpenCV preprocessing | pgvector |
| LLM | **local Qwen2.5-0.5B / SmolLM2-360M** with 4 output gates (`TD_LLM_PROVIDER=local`); deterministic answer is primary | OpenAI-compatible HTTP via `TD_LLM_*` |
| Anomaly ML | deterministic rules; Isolation Forest + LOF; **XGBoost synthetic-demo model** (not used by findings) | XGBoost on a real labelled corpus |
| Damage CV | **YOLO11m (MIT, 6 classes) + OpenCV signals** + inspector validation | severity verdicts (never produced) |
| Agent | sequential fallback running the same 12 nodes | LangGraph + checkpointer when installed |
| Jobs | DB-backed `background_jobs` worker | Celery + Redis when `TD_BROKER_URL` is set |
| Storage | `.data/uploads` | S3/MinIO via `TD_S3_*` |

A PDF text layer is never labelled as OCR. A missing provider never produces a
fabricated conclusion. A matching SHA-256 hash proves the stored file is
unchanged — **not** that the original document was genuine.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | DB, adapters, graph, worker status |
| GET | `/api/intelligence/capabilities` | versions, weights, entity counts |
| POST | `/api/intelligence/documents/process` | 18-step document workflow (sync or queued) |
| POST/GET | `/api/intelligence/fraud/detect`, `/fraud/{vehicleId}` | mileage + document findings |
| POST | `/api/intelligence/investigate` | 12-node investigator |
| GET | `/api/intelligence/trust-score/{vehicleId}` | additive explainable score |
| GET/POST | `/api/intelligence/jobs` | queue + status |
| POST | `/api/intelligence/jobs/run-one` | process one job |
| GET | `/api/intelligence/review` | human-in-the-loop queue |
| POST | `/api/intelligence/review/{id}/resolve` | inspector decision + audit log |
| GET | `/api/intelligence/integrity/{vehicleId}` | SHA-256 drift detection |
| GET | `/api/intelligence/damage/{vehicleId}` | DB-backed damage evidence |

Internal endpoints accept `X-Service-Token` when `TD_SERVICE_TOKEN` is set;
end-user authentication and RBAC stay in the Next.js app.

## Tests

```bash
cd services/intelligence
python -m pytest -q
```

Tests use an isolated temporary SQLite database with seeded negative examples
(mileage rollback, duplicate document hash, VIN mismatch). See `tests/conftest.py`.

## Migrations

```bash
cd services/intelligence
alembic upgrade head
```

The migration is **additive only**: it creates intelligence tables if missing
and never drops or alters an existing table.
