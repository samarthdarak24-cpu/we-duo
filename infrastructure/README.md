# Infrastructure

Deployment artifacts are intentionally kept at the **repository root** because
Render Blueprints expect `render.yaml` at the root and Docker builds use the root
as context. Moving them into this folder would break those paths. This file is
the index of what lives where.

## Files

| Artifact | Path | Purpose |
| --- | --- | --- |
| Web image | `Dockerfile` | Next.js-only image used by `docker-compose.yml` |
| Combined image | `Dockerfile.render` | Next.js + FastAPI + worker; used by Render |
| Backend image | `services/intelligence/Dockerfile` | FastAPI-only image used by compose |
| Compose | `docker-compose.yml` | local web/api/worker + optional Postgres/Redis profiles |
| Blueprint | `render.yaml` | one Render web service + 10 GB disk |
| Supervisor | `scripts/start-render.sh` | starts web → API → worker; exits on child failure |
| Slim deps | `services/intelligence/requirements-render.txt` | runtime without torch/paddle/ultralytics |
| CI | `.github/workflows/ci.yml` | typecheck, tests, build, image, YAML validation |
| Ignore rules | `.dockerignore`, `.gitignore` | keep secrets, local DB and generated builds out |

## Local commands

```bash
docker compose up --build
docker compose --profile production up --build   # + Postgres/Redis (see caveat)
docker build -f Dockerfile.render -t trustdrive:render .
```

The `production` Postgres profile is **not** wired to the Next.js data layer;
only the FastAPI service can consume `TD_DB_URL` today. See
`SETUP_AND_DEPLOYMENT.md` §J for the scale-out path.

## Render commands (local verification of the same start path)

```bash
npm run build                 # uses NEXT_OUTPUT=standalone in Docker
bash scripts/start-render.sh  # expects /app layout inside the image
python -m uvicorn app.main:app --app-dir services/intelligence --host 0.0.0.0 --port 8000
python -m app.worker          # from services/intelligence
```

Health endpoints: `/api/v1/health/live`, `/api/v1/health/ready` (web),
`/health` (FastAPI).

## Validation status

- `render.yaml`, `docker-compose.yml`, `.github/workflows/ci.yml` — YAML parsed.
- `Dockerfile.render` — built in CI; **not built in this sandbox** because the
  Docker daemon is not running here.
- `npm run build`, `npx tsc --noEmit`, `npm test`, `pytest` — all pass locally.
