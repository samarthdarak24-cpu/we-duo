# TrustDrive — Deployment and Rollback Guide

**Date:** 2026-11-08

## Architecture

- **Next.js** (frontend, port 3000) — system of record for portals, REST API, relational DB
- **FastAPI** (intelligence, port 8000) — additive service sharing the same SQLite database
- **Shared DB** — `.data/trustdrive.db` (SQLite, WAL mode, FK enforced)
- **Uploads** — `.data/uploads` (local filesystem; S3 when configured)

## Deployment (Render / Container)

### 1. Provision persistent disk

Mount a persistent disk at `/data` (or `TD_DATA_DIR`). SQLite requires a writable filesystem; ephemeral `/tmp` will lose all audit rows on restart.

### 2. Set environment variables

```
TD_ENV=production
NODE_ENV=production
TD_DATA_DIR=/data
TD_DB_FILE=/data/trustdrive.db
TD_UPLOAD_DIR=/data/uploads
TD_SEED_DEMO=0
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=<change-me-8-plus-chars>
JWT_SECRET=<openssl rand -hex 32>
TD_SERVICE_TOKEN=<openssl rand -hex 32>
DOWNLOAD_SIGNING_SECRET=<openssl rand -hex 32>
QR_SIGNING_SECRET=<openssl rand -hex 32>
TD_SHARE_SECRET=<openssl rand -hex 32>
```

### 3. Start services

**Next.js:**
```powershell
$env:TD_ENV='production'
$env:NEXT_DIST_DIR='.next_verify'
node node_modules/next/dist/bin/next start -p 3000
```

**FastAPI:**
```powershell
$env:TD_CHECKPOINT_BACKEND='sqlite'
$env:TD_CHECKPOINT_DB='.data/langgraph-checkpoints.db'
backend\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### 4. Verify startup

- `GET http://127.0.0.1:3000/api/v1/health/ready` → 200
- `GET http://127.0.0.1:8000/health` → 200
- Login with admin credentials → 200 + session cookie

## Rollback

### Database rollback

1. Stop both services.
2. Restore `.data/trustdrive.db` from the pre-deployment backup.
3. Restore `.data/langgraph-checkpoints.db` if checkpoint rollback is needed.
4. Restart services.

### Code rollback

1. Redeploy the previous container image.
2. Environment variables and database are unchanged — no migration reversal needed.

### Feature rollback (config-driven)

All external integrations are config-gated. To disable:
- S3: unset `TD_S3_BUCKET` → falls back to local storage
- External AV: unset `TD_MALWARE_SCAN_URL` → local signature scan
- SMTP: unset `TD_SMTP_HOST` → in-app notifications only
- LLM: set `TD_LLM_PROVIDER=none` → deterministic narrative
- Blockchain: unset `TD_CHAIN_RPC_URL` → local SHA-256 chain only

## Health Checks

| Endpoint | Expected |
|----------|----------|
| `GET /api/v1/health/ready` (Next) | 200 |
| `GET /health` (FastAPI) | 200 |
| `GET /api/intelligence/capabilities` (FastAPI) | 200 with honest adapter status |

## Backup

```powershell
# SQLite backup (VACUUM INTO for consistency)
sqlite3 .data/trustdrive.db "VACUUM INTO '/data/backups/trustdrive-$(Get-Date -Format 'yyyyMMdd-HHmmss').db'"
```

## What Is NOT Supported

- **Postgres split deployment:** Next.js data layer is SQLite-only. No Postgres driver or migration layer exists.
- **Docker build locally:** Docker daemon unavailable; CI builds the image.
- **External providers without credentials:** S3, SMTP, ClamAV, VAHAN, PaddleOCR, production XGBoost, blockchain anchoring all report `unavailable`/`BLOCKED`.
