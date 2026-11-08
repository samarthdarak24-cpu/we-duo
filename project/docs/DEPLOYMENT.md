# TrustDrive — Deployment

## 1. Local (default, zero daemons)

| Requirement | Version | Why |
| --- | --- | --- |
| Node.js | **22.5+** | `node:sqlite` (`DatabaseSync`) is built-in and is the shared DB driver |
| Python | 3.12+ | intelligence service |
| npm | 10+ | `npm ci` |

```bash
npm ci
npm run seed:reset
npm run dev                 # http://localhost:3000
```

Optional intelligence service in a second terminal:

```bash
python -m pip install -r services/intelligence/requirements.txt
npm run intel:migrate        # additive only; no-op on the shipped schema
npm run intel:serve          # http://127.0.0.1:8000/docs
npm run intel:worker         # background_jobs worker
```

Environment variables are listed in `.env.example` (names only, no secrets).
Copy to `.env.local` / `.env` before filling values. The Python service loads
`.env` from the repository root automatically (existing environment variables
always win); `.env` is gitignored.

> **Do not run `next dev` and `next start` against the same `.next` directory.**
> That corrupts manifests and makes AI requests 500. Use
> `NEXT_DIST_DIR=.next_verify npm run build` for isolated verification builds.

## 2. Docker Compose

```bash
docker compose up --build            # web + api + worker, shared SQLite volume
```

Services: `web` (:3000), `api` (:8000), `worker`. The `td-data` volume holds
`.data/trustdrive.db` and uploads so **both runtimes share one database**.

Production profile adds Postgres + Redis:

```bash
docker compose --profile production up --build
```

Then set in `.env`:

```
TD_DB_URL=postgresql+psycopg://trustdrive:change-me@postgres:5432/trustdrive
TD_BROKER_URL=redis://redis:6379/0
```

and configure the Next.js side to the same Postgres database. Celery tasks in
`services/intelligence/app/tasks.py` activate only when `TD_BROKER_URL` is set;
otherwise the DB-backed worker runs the same handlers.

### Health endpoints

| Runtime | Path | Checks |
| --- | --- | --- |
| Web | `/` (and `/api/v1/ai/health`) | app + DB reachability |
| Intelligence | `/health` | DB, OCR adapters, LLM, agent graph, worker |

Compose declares a `HEALTHCHECK` for both containers.

## 3. Database

- Schema owner: **Next.js** (`lib/server/seed.ts` / `lib/server/db.ts`), `SCHEMA_VERSION = 3`, `PRAGMA user_version = 3`.
- 51 tables, 30 indexes, 11 immutability triggers, 5 canonical entity views.
- Regenerate the ER document from the live schema: `npm run schema:dump` → `docs/ERD.md`.
- Alembic (`services/intelligence/alembic/`) is **additive only**: it creates
  intelligence tables if missing and never drops or alters existing ones.
- Reset demo data (destructive to demo data only): `npm run seed:reset`.

### Backup and restore

```bash
# Backup (SQLite WAL mode — copy all three files together)
cp .data/trustdrive.db    backups/trustdrive-$(date +%Y%m%d).db
cp .data/trustdrive.db-wal backups/trustdrive-$(date +%Y%m%d).db-wal
cp .data/trustdrive.db-shm backups/trustdrive-$(date +%Y%m%d).db-shm
cp -r .data/uploads        backups/uploads-$(date +%Y%m%d)

# Restore: stop BOTH runtimes, replace .data/trustdrive.db* and .data/uploads,
# restart, then verify /health and one vehicle report.
```

For Postgres use `pg_dump` / `pg_restore`; document the restore point before
every migration. Backups must be encrypted at rest and access-controlled —
they contain private seller documents.

## 4. CI / CD

`.github/workflows/ci.yml` runs on push/PR:

1. **web** — `npm ci`, `npx tsc --noEmit`, `npm test`, `npm run build`.
2. **intelligence** — pip install, `pytest`, OpenAPI import smoke test.
3. **e2e** — `workflow_dispatch` only: seeds the DB, starts the service, runs
   the 21-step Playwright flow (`npm run test:e2e -- --project=chromium-1920`).

Production build: `npm run build && npm run start`. Never point two servers at
one `.next` directory.

## 5. Secrets and configuration

| Variable | Purpose |
| --- | --- |
| `JWT_SECRET` | session signing (must be long and random in production) |
| `TD_SERVICE_TOKEN` | internal web ↔ intelligence auth (`X-Service-Token`) |
| `TD_DB_URL` | shared SQLAlchemy database URL |
| `TD_INTELLIGENCE_URL` | **Next.js → intelligence service**; unset means the in-app assistant stays deterministic even when an LLM is active. Local: `http://127.0.0.1:8000`; compose: `http://api:8000` |
| `TD_INTELLIGENCE_TIMEOUT_MS` | assistant → chat fetch timeout (default 90 000 ms, clamped 1–120 s). Local CPU inference needs 13–25 s plus a ~65 s cold model load |
| `TD_LLM_PROVIDER` | `local` = on-device model; `none` = deterministic answer only; any HTTP provider via `TD_LLM_BASE_URL`/`TD_LLM_API_KEY` |
| `TD_LLM_MODEL` | local model id (default `Qwen/Qwen2.5-0.5B-Instruct`) |
| `TD_MODEL_DIR` | model directory (default `models/`; YOLO weights, XGBoost) |
| `TD_BROKER_URL` | optional Celery/Redis broker |
| `TD_S3_*` | optional S3/MinIO object storage |
| `TD_UPLOAD_DIR` | private upload root (never served publicly) |

Never commit `.env`, `.env.local` or real credentials. Rotate tokens on staff
changes. See `SECURITY.md`.

Both runtimes read the repo-root `.env` / `.env.local`: Next.js via `@next/env`,
the Python service via `python-dotenv` in `app/config.py` (with a dependency-free
fallback), so `npm run intel:serve` and `npm run intel:worker` pick up the same
`TD_LLM_PROVIDER` as the web app. Process environment always wins. Check the
active engine with `GET http://127.0.0.1:8000/health` → `llm.active`. In
production leave `TD_LLM_PROVIDER=none` unless a vetted model is deployed; the
deterministic evidence-only answer is then returned and no conclusion is
fabricated.

## 6. Honest local limitations

- Docker daemon is not required locally; Postgres/Redis are production targets.
- No hosted error monitoring / OpenTelemetry SaaS is wired in: they need
  external accounts. Structured JSON logs and health endpoints are in place and
  are the contract those systems would consume.
- Blockchain anchoring is intentionally **not** implemented. SHA-256 hashes and
  immutable audit events are local.
