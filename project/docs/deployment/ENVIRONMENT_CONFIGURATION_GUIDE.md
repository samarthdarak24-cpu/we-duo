# TrustDrive — Environment Configuration Guide

**Date:** 2026-11-08

## Overview

TrustDrive uses a single shared SQLite database (`.data/trustdrive.db`) accessed by both the Next.js frontend and the FastAPI intelligence service. All configuration is via environment variables. `.env.example` contains safe placeholders only — never commit real secrets.

## Required Environment Variables

| Variable | Purpose | Production Required? | Example |
|----------|---------|---------------------|---------|
| `TD_ENV` | Runtime environment (`local` \| `production`) | Yes | `production` |
| `NODE_ENV` | Node build mode | Yes | `production` |
| `PORT` | Next.js port | No | `3000` |
| `TD_DATA_DIR` | Data directory | No | `.data` |
| `TD_DB_FILE` | SQLite database path | No | `.data/trustdrive.db` |
| `TD_UPLOAD_DIR` | Upload storage directory | No | `.data/uploads` |

## Authentication / Session Secrets (REQUIRED in production)

All secrets must be ≥16 characters and not match placeholder patterns (`replace-with`). Secrets are NEVER logged.

| Variable | Purpose | Production Required? |
|----------|---------|---------------------|
| `JWT_SECRET` | HS256 JWT signing (shared with FastAPI) | Yes |
| `SESSION_TTL_HOURS` | Session TTL | No |
| `TD_SERVICE_TOKEN` | Next.js → FastAPI service token | Yes |
| `DOWNLOAD_SIGNING_SECRET` | Signed download URLs | Yes |
| `QR_SIGNING_SECRET` | QR code signing | Yes |
| `TD_SHARE_SECRET` | Share-link signing | Yes |
| `TD_RATE_LIMIT_AUTH` | Auth rate limit | No |
| `TD_RATE_LIMIT_WINDOW` | Rate limit window (seconds) | No |

Generate: `openssl rand -hex 32`

## Seed / Bootstrap

| Variable | Purpose | Production Value |
|----------|---------|-----------------|
| `TD_SEED_DEMO` | `1` = demo accounts; `0` = production | `0` |
| `ADMIN_EMAIL` | Admin bootstrap email (when `TD_SEED_DEMO=0`) | Required |
| `ADMIN_PASSWORD` | Admin bootstrap password (≥8 chars) | Required |

**Critical:** `TD_SEED_DEMO=0` prevents demo accounts (`samarth@trustdrive.dev`, etc.) from being created. In production, always set `TD_SEED_DEMO=0` and provide `ADMIN_EMAIL`/`ADMIN_PASSWORD`.

## Storage

| Variable | Purpose |
|----------|---------|
| `TD_S3_ENDPOINT` | S3-compatible endpoint (MinIO, etc.) |
| `TD_S3_BUCKET` | S3 bucket name |
| `TD_S3_REGION` | S3 region (default: `us-east-1`) |
| `TD_S3_ACCESS_KEY_ID` | S3 access key |
| `TD_S3_SECRET_ACCESS_KEY` | S3 secret key |

Without all S3 variables, local filesystem storage is used (`TD_UPLOAD_DIR`).

## Antivirus

| Variable | Purpose |
|----------|---------|
| `TD_MALWARE_SCAN_URL` | External ClamAV/hosted scanner URL |
| `TD_MALWARE_SCAN_TOKEN` | Scanner auth token |

Without these, local signature/heuristic scan is used.

## Notifications

| Variable | Purpose |
|----------|---------|
| `TD_SMTP_HOST` | SMTP host |
| `TD_SMTP_PORT` | SMTP port |
| `TD_SMTP_USER` | SMTP username |
| `TD_SMTP_PASS` | SMTP password |
| `TD_NOTIFICATION_URL` | HTTP webhook URL |
| `TD_NOTIFICATION_TOKEN` | Webhook bearer token |

Without these, in-app notifications only (provider: `disabled` for external delivery).

## LLM

| Variable | Purpose |
|----------|---------|
| `TD_LLM_PROVIDER` | `none` (deterministic), `local`, or remote endpoint |
| `TD_LLM_MODEL` | Model name |
| `TD_LLM_BASE_URL` | Remote API base URL |
| `TD_LLM_API_KEY` | Remote API key |
| `TD_LLM_MAX_NEW_TOKENS` | Max tokens (default: 220) |

With `TD_LLM_PROVIDER=none`, deterministic evidence-only narrative is used.

## Blockchain Anchoring

| Variable | Purpose |
|----------|---------|
| `TD_CHAIN_RPC_URL` | EVM RPC URL |
| `TD_CHAIN_CONTRACT` | Contract address |

Without these, local SHA-256 chain is the only integrity claim.

## External Registry (VAHAN / Insurer / Theft)

| Variable | Purpose |
|----------|---------|
| `TD_PROVIDER_URL` / `TD_PROVIDER_TOKEN` | Vehicle registry provider |
| `TD_INSURER_URL` / `TD_INSURER_TOKEN` | Insurance provider |
| `TD_THEFT_URL` / `TD_THEFT_TOKEN` | Theft registry provider |

Without these, all providers report `unavailable`.

## Intelligence Service

| Variable | Purpose |
|----------|---------|
| `TD_INTELLIGENCE_URL` | FastAPI base URL (default: `http://127.0.0.1:8000`) |
| `TD_INTELLIGENCE_TIMEOUT_MS` | Request timeout (default: 90000) |
| `TD_CHECKPOINT_BACKEND` | `sqlite` (durable) or `memory` |
| `TD_CHECKPOINT_DB` | Checkpoint database path |
| `TD_MODEL_DIR` | Model weights directory |
| `TD_LLM_WARM_START` | Warm LLM on startup |

## Production Startup Validation

When `TD_ENV=production`, the Next.js app refuses to start if:
- Any required secret is missing, <16 chars, or a placeholder
- The data directory is not writable
- `TD_SEED_DEMO` is not `0` (forced to `0` with a warning)

## Local Development

Copy `.env.example` to `.env` and adjust as needed. Default `TD_SEED_DEMO=1` creates demo accounts (password `demo1234`).

## Verification Commands

```powershell
# Frontend
cd frontend
npx tsc --noEmit
npm test -- --run

# Backend
cd backend
.\.venv\Scripts\python.exe -m pytest tests -q

# Build (isolated)
cd frontend
$env:NEXT_DIST_DIR='.next_verify'
npm run build
```
