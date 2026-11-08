# TrustDrive — Render Deployment Guide

**One file. Everything you need to deploy TrustDrive (frontend + FastAPI backend + AI services) to Render.**

TrustDrive keeps **one shared database**. The Next.js app is the system of record (portals, REST API, relational DB via `node:sqlite`). The Python FastAPI service is additive beside it, reading the same `.data/trustdrive.db`. On Render both runtimes live in **one web service** with a persistent disk at `/data` (two Render services cannot share a disk). Docker builds a combined image (`Dockerfile.render`) running Next + FastAPI + the DB-backed worker under one supervisor.

---

## 1. Repository layout (what gets deployed)

```
frontend/          # Next.js app (system of record)
  app/             # API routes + pages
  lib/server/      # db.ts (SQLite schema), files.ts (S3/local), scan.ts (clamav), mailer.ts, ...
  public/models/   # GLB 3D assets (trustdrive-sedan.glb, scooter.glb)
  tests/           # Vitest suites
  package.json     # Node deps (+ @aws-sdk, nodemailer, pg types)
backend/           # FastAPI intelligence service
  app/             # ocr.py (rapidocr+paddleocr), detectors, agents, worker
  scripts/         # train_mileage_xgb.py, build_mileage_dataset.py, eval_mileage_xgb.py
  ai-services/shared/models/   # mileage_xgb.json + meta (XGBoost, EXPERIMENTAL)
qa/                # Local test stand-ins (smtp sink, sms sink, clamd stub, evm-rpc stub)
render.yaml        # Render blueprint (web service, healthCheckPath, /data disk)
Dockerfile.render  # Combined Render image (Next standalone + Python venv + worker)
docker-compose.yml # Local dev (SQLite default; Postgres+Redis behind --profile production)
.env.example       # All env var names (copy to .env, never commit real .env)
```

### Shared database (SQLite, dev + Render default)
- Path: `.data/trustdrive.db` (rendered to `/data/trustdrive.db` on Render via `TD_DATA_DIR=/data`).
- 55 tables, `SCHEMA_VERSION=3`, WAL mode, `integrity_check=ok`, 0 FK violations.
- Preserved for development; do not delete until Postgres migration is verified.

---

## 2. Deploy to Render (recommended: single web service)

### Option A — Render Blueprint (`render.yaml`)
Render can provision this from the repo. `render.yaml` defines:
- **Service:** `web`, type `web`, health check path `/api/v1/health/ready`, disk mount `/data`.
- **Build command:** `npm ci --prefix frontend && npm run build --prefix frontend` (then Python deps).
- **Start command:** `bash infrastructure/scripts/start-render.sh` (Next + FastAPI + worker).

### Option B — Manual web service + persistent disk
1. Create a **Web Service** on Render, connect this repo.
2. **Runtime:** Node (or use the Docker image via `Dockerfile.render`).
3. **Build command:** `cd frontend && npm ci && npm run build`
4. **Start command:** `cd frontend && npm start` (serves Next; FastAPI proxied via `TD_INTELLIGENCE_URL`) — *or deploy the combined Docker image instead*.
5. **Add a persistent disk:** mount path `/data`, size ≥ 1 GB.
6. **Set environment variables** (section 3 below) — **never hardcode secrets**.

### Docker image (CI-buildable)
`Dockerfile.render` is a multi-stage image:
- Stage 1 (`node-build`): `npm ci` + `npm run build` → Next standalone output.
- Stage 2 (`runtime`): Node + Python venv, installs `requirements-render.txt`, copies backend, copies standalone Next output.
- `start-render.sh` launches Next + FastAPI + worker under one supervisor.
- `HEALTHCHECK` hits `http://127.0.0.1:10000/api/v1/health/ready`.

Build: `docker build -f Dockerfile.render -t trustdrive:ci .` (runs in CI; Docker daemon unavailable on this local Windows machine).

---

## 3. Environment variables (copy `.env.example` → `.env`, set real values in Render)

**Required in production (fail-closed if missing):**
| Variable | Purpose |
|----------|---------|
| `NODE_ENV=production` | Enables secret validation |
| `JWT_SECRET` | `openssl rand -hex 32` — identical for Next.js + FastAPI |
| `SESSION_TTL_HOURS=24` | |
| `DOWNLOAD_SIGNING_SECRET` | Signed downloads fail closed without it |
| `QR_SIGNING_SECRET` | QR signing |
| `TD_SHARE_SECRET` | Share links |
| `TD_SERVICE_TOKEN` | Internal service JWT (optional: short-lived signed JWT if unset) |

**Storage (default local disk /data):**
| Variable | Purpose |
|----------|---------|
| `TD_DATA_DIR=/data` | Persistent disk mount on Render |
| `TD_DB_FILE=/data/trustdrive.db` | Shared SQLite (both runtimes) |
| `TD_UPLOAD_DIR=/data/uploads` | |
| `TD_STORAGE_PROVIDER=local` | `local` (default) or `s3` |
| `TD_QUARANTINE_DIR=/data/quarantine` | Infected files, outside servable root |

**S3 (optional — only set all three if using S3):**
`TD_S3_ENDPOINT`, `TD_S3_BUCKET`, `TD_S3_REGION`, `TD_S3_ACCESS_KEY_ID`, `TD_S3_SECRET_ACCESS_KEY`, `TD_S3_FORCE_PATH_STYLE=1` (for moto/MinIO). Credentials are server-only; never in frontend.

**Malware scanning (optional):**
`TD_CLAMAV_HOST`, `TD_CLAMAV_PORT=3310`, `TD_CLAMAV_TIMEOUT_MS=15000` — or `TD_MALWARE_SCAN_URL` + `TD_MALWARE_SCAN_TOKEN` for an HTTP scanner. Without these, local signature scan runs (honestly labelled, not a full AV).

**Email (SMTP — optional):**
`TD_SMTP_HOST`, `TD_SMTP_PORT`, `TD_SMTP_USER`, `TD_SMTP_PASSWORD`, `TD_SMTP_FROM`, `TD_SMTP_MAX_ATTEMPTS=3`. Without `TD_SMTP_HOST`, sends report `not_configured` (never fake success).

**SMS (HTTP gateway — optional):**
`TD_SMS_URL`, `TD_SMS_TOKEN`, `TD_SMS_FROM`, `TD_SMS_MAX_ATTEMPTS=3`.

**Intelligence service:**
`TD_INTELLIGENCE_URL=http://127.0.0.1:8000` (FastAPI, proxied; browser never calls it directly).

**LLM (optional):**
`TD_LLM_PROVIDER=none` (default, deterministic evidence-only). Or a provider name + `TD_LLM_BASE_URL` + `TD_LLM_API_KEY` + `TD_LLM_MODEL`.

**OCR:**
`TD_OCR_PROVIDER=auto` (default = RapidOCR). Options: `paddleocr`, `rapidocr`, `text-layer`, `none`. PaddleOCR installed but slower; RapidOCR remains default.

**XGBoost (EXPERIMENTAL):**
`TD_MODEL_DIR=ai-services/shared/models`. Model trained on synthetic-demo-600; not production fraud detection.

**Blockchain (NOT implemented / NOT claimed):**
`TD_CHAIN_RPC_URL`, `TD_CHAIN_CONTRACT`, `TD_CHAIN_PRIVATE_KEY` — only if you configure a funded EVM testnet. Local SHA-256 chain is the only integrity claim.

**Seed:**
`TD_SEED_DEMO=1` (demo accounts). Set `TD_SEED_DEMO=0` in production (no demo accounts).

**Rate limiting:** `TD_RATE_LIMIT_AUTH=10`, `TD_RATE_LIMIT_WINDOW=60`.

---

## 4. Local development

```powershell
# Terminal 1 — FastAPI intelligence service
cd backend
python -m uvicorn app.main:app --app-dir . --host 127.0.0.1 --port 8000

# Terminal 2 — Next.js
cd frontend
npm run dev        # port 3000

# Seed demo data (creates accounts: samarth@trustdrive.dev, rohan@trustdrive.dev, admin@trustdrive.dev, all pw demo1234)
cd frontend
npm run seed:reset
```

Demo logins (password `demo1234`): `samarth@trustdrive.dev`, `weduo@trustdrive.dev` (seller); `rohan@trustdrive.dev`, `aditya@trustdrive.dev` (buyer); `admin@trustdrive.dev` (admin).

---

## 5. Verification commands

```powershell
# Frontend typecheck + tests
cd frontend
npx tsc --noEmit
npm test                      # 363 tests pass

# Backend tests
cd ../backend
python -m pytest -q           # 182 tests pass

# Production-style build (isolated dist dir — never share .next between dev/start)
cd frontend
$env:NEXT_DIST_DIR='.next_verify'
npm run build
```

**Never** run `next dev` and `next start` against the same `.next` directory. Do not delete `.workbuddy-ai/` (project data, not cache).

---

## 6. Feature status (honest classifications)

| Feature | Status | Notes |
|---------|--------|-------|
| S3-compatible storage (local default / S3 optional) | PASS | Tested against local moto server; presigned URLs after consent/RBAC |
| SMTP email with retry + delivery evidence | PASS | Tested against local aiosmtpd sink; `not_configured` when no host |
| SMS HTTP gateway with retry + delivery evidence | PASS | Tested against local HTTP sink |
| ClamAV clamd INSTREAM scanning + quarantine + fail-closed 503 | PASS | Tested against local clamd stub; local signature scan fallback |
| OCR provider selection (RapidOCR default, PaddleOCR optional) | PASS | RapidOCR faster + more accurate here; PaddleOCR installed |
| LLM narrative provider (deterministic fallback) | PASS | 8-case stub testing; `TD_LLM_PROVIDER=none` default |
| XGBoost mileage model | EXPERIMENTAL | Synthetic-demo-600 only; not production fraud detection |
| Blockchain EVM anchoring | NOT IMPLEMENTED | Adapter written, tested against local stub; no real chain/funds |
| VAHAN / insurer / theft adapters | NOT IMPLEMENTED | Interfaces written; `unavailable` without credentials; never `verified` |
| Licensed non-car 3D GLB assets | NOT IMPLEMENTED | Sedan GLB (CC BY 4.0, generic reference) for cars only; two-wheelers etc. show labelled schematic |
| PostgreSQL split | BLOCKED | `TD_DB_URL` interface ready; no local Postgres server to migrate against |
| Docker build | BLOCKED locally | No Docker daemon on this machine; CI builds `Dockerfile.render` |
| Full Playwright E2E | PARTIAL / ENV | S1–S3 pass; deeper workflows need Linux CI runner + seeded DB |

**Nothing unavailable is claimed as working.** Local SHA-256 chain proves file integrity, not document authenticity. Demo credentials (`demo1234`) are labelled demo only; `TD_SEED_DEMO=0` in production.

---

## 7. Security checklist (production)

- [ ] `NODE_ENV=production`
- [ ] Real `JWT_SECRET` (same for both runtimes)
- [ ] Real `DOWNLOAD_SIGNING_SECRET`
- [ ] `TD_SEED_DEMO=0`
- [ ] Signed downloads fail closed without `DOWNLOAD_SIGNING_SECRET`
- [ ] Uploads scanned before exposure (clamd/local); infected quarantined outside servable root
- [ ] Private documents consent-gated; buyer sees consented docs of published listings only
- [ ] Server-side RBAC on every endpoint (`requireRole`)
- [ ] HTTPS at the Render layer (Render manages certs)
- [ ] No hardcoded API keys/secrets in repo
- [ ] Persistent disk at `/data` for SQLite + uploads

---

## 8. What was removed

The 15 per-phase report MD files were consolidated into this single `DEPLOYMENT.md`. The master tracker remains `IMPLEMENTATION_STATUS.md` at the repo root.
