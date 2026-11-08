# TrustDrive — Setup & Deployment

This guide matches the **actual** repository. Read `PROJECT_AUDIT.md` first: the  
app is one Next.js project in `frontend/` plus one FastAPI service in  
`backend/`, sharing one SQLite database. The repository root is a thin workspace  
wrapper (`package.json`) whose scripts delegate into those two folders.

---

## A. Prerequisites

| Tool    | Version                         | Why                                            |
| ------- | ------------------------------- | ---------------------------------------------- |
| Node.js | **≥ 22.5** (22 LTS recommended) | the data layer uses the built-in `node:sqlite` |
| npm     | 10+                             | lockfile is `package-lock.json`                |
| Python  | **3.12** (3.13 works locally)   | FastAPI service                                |
| Git     | any                             | clone/push                                     |
| Docker  | optional                        | compose / image builds                         |
| OpenSSL | optional                        | `openssl rand -hex 32` for secrets             |

No PostgreSQL or Redis is required for local development.

---

## B. Clone

```bash
git clone <your-repo-url> trustdrive
cd trustdrive
```

If you already have the folder, just `cd` into it.

---

## C. Frontend (Next.js — in `frontend/`)

```bash
cp .env.example .env          # Windows: copy .env.example .env
cd frontend
npm ci
npm run dev                   # http://localhost:3000
```

Production build:

```bash
npm run build
npm start                     # serves .next on $PORT (default 3000)
```

Useful scripts: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run test:e2e`.

`next.config.mjs` reads `NEXT_DIST_DIR` (isolated builds) and `NEXT_OUTPUT=standalone`  
(Docker/Render image).

---

## D. Backend (FastAPI)

```bash
cd backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
npm run intel:serve           # http://127.0.0.1:8000/docs
```

Worker (second terminal, same venv):

```bash
npm run intel:worker
```

Slim install (no torch/paddle/ultralytics; OCR still works via RapidOCR):

```bash
pip install -r requirements-render.txt
```

The service loads `.env` from the repository root automatically  
(`app/config.py::_load_dotenv`); real environment variables always win.

---

## E. Database

Local default: SQLite at `.data/trustdrive.db`, created and migrated by the  
Next.js process on first access. Both runtimes point at the **same file**.

```bash
npm run seed:reset            # backs up to .data/backups, then rebuilds demo data
npm run seed:reset -- --uploads
npm run intel:migrate         # Alembic baseline for the Python-owned tables
```

Demo accounts (only when `TD_SEED_DEMO=1`):

| Role   | Email                    | Password   |
| ------ | ------------------------ | ---------- |
| Buyer  | `aditya@trustdrive.dev`  | `demo1234` |
| Seller | `samarth@trustdrive.dev` | `demo1234` |
| Admin  | `admin@trustdrive.dev`   | `demo1234` |

Production: set `TD_SEED_DEMO=0` and provide `ADMIN_EMAIL` / `ADMIN_PASSWORD`  
(≥ 8 chars). The first boot creates exactly one admin; no demo accounts.

Postgres is supported by the **FastAPI service only** today. Do not point the  
two runtimes at different databases — the Next.js data layer is SQLite-only.

### E1. Rate limiting, signed downloads and checkpoints

- Rate limits are stored in the shared `rate_limit_hits` table inside the same
  SQLite file, so a restart or a second Next.js process does not reset the
  allowance. The in-memory map is only a fallback when the DB is unavailable.
  A Postgres split deployment must move this table to Redis/gateway.
- Signed report/document downloads are HMAC tokens. In production
  `DOWNLOAD_SIGNING_SECRET` (or `QR_SIGNING_SECRET`) **must** be set; otherwise
  tokens are refused (fail closed). Local demo runs with `TD_ENV=local`.
  Rotation: deploy the new secret to all instances, keep the old one only for
  the 15-minute token TTL, then remove it.
- LangGraph checkpoints are durable by default:
  `TD_CHECKPOINT_BACKEND=sqlite` and
  `TD_CHECKPOINT_DB=.data/langgraph-checkpoints.db`. Set the backend to
  `memory` for a deliberately non-durable run. A slim install without
  `langgraph-checkpoint-sqlite` reports `durable_checkpointing=false`.

---

## F. Redis and workers

The default worker is **DB-backed** and needs no daemon.

Optional Redis/Celery:

```bash
docker run -d --name td-redis -p 6379:6379 redis:7-alpine
# .env
TD_BROKER_URL=redis://127.0.0.1:6379/0
```

Then restart `npm run intel:serve` and `npm run intel:worker`. If the broker is  
unreachable the worker reports it; jobs stay in the database.

---

## G. AI setup

| Capability   | Default                           | Needs                                                            |
| ------------ | --------------------------------- | ---------------------------------------------------------------- |
| OCR (images) | RapidOCR (active); PaddleOCR optional | `paddleocr`/`paddlepaddle` optional; RapidOCR is in requirements |
| PDF text     | PyMuPDF                           | installed                                                        |
| Damage       | YOLO11m (MIT)                     | `ultralytics` + `models/car_damage.pt`                           |
| Anomaly      | rules + IForest/LOF + XGBoost     | installed                                                        |
| Retrieval    | sentence-transformers (in-memory) | `sentence-transformers`                                          |
| LLM          | local Qwen2.5-0.5B                | `torch` + `transformers`; first call downloads ~1 GB             |
| LLM (hosted) | any OpenAI-compatible API         | `TD_LLM_BASE_URL` + `TD_LLM_API_KEY`                             |

Local LLM:

```env
TD_LLM_PROVIDER=local
TD_LLM_MODEL=Qwen/Qwen2.5-0.5B-Instruct
```

No key is required. The assistant falls back to the deterministic, cited answer  
when the model is unavailable or its output fails the four gates.

Durable investigation threads:

```env
TD_CHECKPOINT_BACKEND=sqlite
TD_CHECKPOINT_DB=.data/langgraph-checkpoints.db
```

`GET /health` confirms the active backend (`checkpoint_backend`,
`durable_checkpointing`). Without the optional `langgraph-checkpoint-sqlite`
package the service reports the memory fallback rather than pretending to be
durable.

Smoke test:

```bash
curl -s http://127.0.0.1:8000/health | python -m json.tool
TD_LLM_PROVIDER=local python backend/scripts/eval_llm.py     # 10 cases
```

---

## H. Docker

```bash
docker compose up --build            # web :3000, api :8000, worker
docker compose --profile production up --build   # + Postgres/Redis (see caveat)
docker compose logs -f web
docker compose down
```

The web and api containers share the `td-data` volume; `TD_DB_FILE` and  
`TD_DB_URL` point at the same SQLite file. The `production` Postgres profile is  
**not wired to Next.js**; it only lets the FastAPI service use Postgres.

Render image (combined):

```bash
docker build -f Dockerfile.render -t trustdrive:render .
docker run --rm -p 10000:10000 -v td-data:/data \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e ADMIN_EMAIL=admin@example.com -e ADMIN_PASSWORD=change-me-123 \
  trustdrive:render
```

> Docker builds were **not executed in this sandbox** (daemon unavailable).  
> CI runs `docker build -f Dockerfile.render` on every push.

---

## I. Run everything locally

1. `npm run dev` — web on 3000.
2. `npm run intel:serve` — API on 8000.
3. `npm run intel:worker` — background jobs.
4. `TD_LLM_PROVIDER=local` in `.env` — assistant uses the local model.
5. Open `/seller`, `/buyer`, `/admin/queue`.

The web server calls the API through `TD_INTELLIGENCE_URL`; the browser never  
needs port 8000.

---

## J. Render deployment

1. Push the repository to GitHub.
2. Render Dashboard → **New → Blueprint** → select the repo.
3. Render reads `render.yaml`: one **web** service (`trustdrive`), Docker runtime,  
   `Dockerfile.render`, 10 GB disk at `/data`, health check  
   `/api/v1/health/ready`.
4. Set the secrets marked `sync: false`:
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` (required on first boot)
   - optional `TD_LLM_BASE_URL`, `TD_LLM_API_KEY`, `TD_LLM_MODEL`
5. `JWT_SECRET`, `TD_SERVICE_TOKEN`, `DOWNLOAD_SIGNING_SECRET` are generated by  
   Render (`generateValue: true`).
6. Create the service. The disk must be attached before first boot (the plan  
   must support disks; `standard` is configured).
7. Wait for the health check. First boot creates the schema and the admin user.
8. Verify:
   - `https://<service>/api/v1/health/ready`
   - sign in as the bootstrap admin
   - upload a document, run verification, open the assistant
9. Logs: Render → service → Logs. Look for `[start] web ready`,  
   `service.started`, and no `EADDRINUSE`.

**Why one service:** see `PROJECT_AUDIT.md` D1. Separate frontend/backend  
services would each get their own SQLite file. The supported scale-out path is:  
migrate `lib/server/db.ts` to Postgres, then split into web + API + worker with  
Render Postgres and Key Value.

---

## K. Troubleshooting

| Symptom                        | Cause                                 | Fix                                                                                             |
| ------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `EADDRINUSE :3000`             | another dev server                    | stop it or `PORT=3001 npm run dev`                                                              |
| `SQLITE_BUSY` / locked         | two writers / stale WAL               | stop extra processes; the app sets `busy_timeout=5000`; never run two web instances on one file |
| `JWT_SECRET is not configured` | production without secret             | set `JWT_SECRET` (32+ chars)                                                                    |
| 401 on every API call          | web and API use different JWT secrets | set the **same** `JWT_SECRET` in both                                                           |
| CORS error                     | calling port 8000 from the browser    | call the Next API instead; CORS only allows localhost:3000                                      |
| `Cannot find module '@/...'`   | stale `deploy/` copy or wrong cwd     | run from repo root; `deploy` is excluded/archived                                               |
| `node:sqlite` not found        | Node < 22.5                           | upgrade Node                                                                                    |
| `paddle` oneDNN crash          | Paddle 3.7 CPU bug                    | code disables oneDNN; RapidOCR remains the fallback                                             |
| Python deps fail               | torch/paddle wheels                   | use `requirements-render.txt` for a slim install                                                |
| Redis connection refused       | `TD_BROKER_URL` set but no Redis      | unset it (DB worker) or start Redis                                                             |
| LLM 500 / slow                 | model not downloaded / low RAM        | first call downloads ~1 GB; use `TD_LLM_PROVIDER=none` on small hosts                           |
| Upload rejected                | type/size or local scan               | PDF/PNG/JPEG/WebP, ≤ 10 MB; EICAR/JS/macro patterns are blocked                                 |
| Missing GLB                    | `frontend/public/models` not deployed | ensure `frontend/public/` is in the image (it is)                                               |
| Migration fails                | Alembic run before schema exists      | start the web app once, then `npm run intel:migrate`                                            |
| Render restarts                | worker/web crash                      | check logs; `start-render.sh` exits if any child dies                                           |
| Disk not mounted               | plan without disks                    | use a paid plan or attach a disk at `/data`                                                     |

---

## L. Verification commands

```bash
npm run typecheck
npm test
npm run build
cd backend && python -m pytest -q
python backend/scripts/eval_llm.py     # 10-case LLM eval
python -c "import yaml; yaml.safe_load(open('render.yaml'))"
```
