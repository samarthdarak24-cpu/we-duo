# TrustDrive — Deployment Readiness Report

**Date:** 2026-11-07 · **Verdict: READY for a single-host demo/staging deployment. NOT READY for a public production deployment without the blockers below.**

## 1. Verified build and runtime

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` (from `frontend/`) | **0 errors** |
| Frontend unit/integration | `npm test -- --run` (from `frontend/`) | **187 / 187 passed** (15 files, isolated DB) |
| Backend tests | `npm run intel:test` | **127 / 127 passed** |
| Production build | `NEXT_DIST_DIR=.next_verify npm run build` (from `frontend/`) | **Compiled successfully; 52/52 pages, 109 API routes** |
| Dev server | `npm run dev` | HTTP 200 on `/`, `/login`, `/marketplace`, seller/buyer portals |
| Intelligence service | `npm run intel:serve` | HTTP 200 `/health`, `status=ok` |
| Shared DB | `.data/trustdrive.db` | SQLite WAL, `integrity_check=ok`, 0 FK violations, 55 tables, `user_version=3` |
| Browser automation | Playwright headless Chromium | 272/272 broad checks, 49/49 focused checks, 40/40 page sweep, 44/44 responsive |
| 3D asset | `frontend/public/models/vehicles/trustdrive-sedan.glb` | Present (11.8 MB), real GLB; 2W fallback is labelled schematic |

**Final live runtime checked:** Next.js on `http://127.0.0.1:3000`, FastAPI on `http://127.0.0.1:8000`, shared `.data/trustdrive.db`.

## 2. Required environment variables

The repository already contains `.env` (gitignored) and `frontend/.env.local` (gitignored). Variable **names** verified; values were not printed or committed.

| Variable | Purpose | Present |
|---|---|---|
| `JWT_SECRET` | Next.js session signing | ✅ `frontend/.env.local` |
| `TD_DATA_DIR` | shared data root | ✅ |
| `TD_DB_FILE` | SQLite file used by both runtimes | ✅ |
| `TD_UPLOAD_DIR` | shared private upload root | ✅ |
| `TD_SERVICE_TOKEN` | Next → FastAPI service authentication | ✅ root `.env` |
| `TD_INTELLIGENCE_URL` | `http://127.0.0.1:8000` | ✅ |
| `TD_INTELLIGENCE_TIMEOUT_MS` | Python call budget | ✅ |
| `TD_LLM_PROVIDER` / `TD_LLM_MODEL` | optional LLM adapter | ✅ (`none` in final runtime) |
| `TD_MODEL_DIR` | XGBoost/YOLO asset directory | ✅ |
| `TD_SEED_DEMO` | demo seed gate | ✅ |
| `DOWNLOAD_SIGNING_SECRET` / `QR_SIGNING_SECRET` | signed download/QR tokens; **required in production** (fail closed) | local demo uses `TD_ENV=local` fallback |
| `TD_CHECKPOINT_BACKEND` / `TD_CHECKPOINT_DB` | durable LangGraph checkpoint backend/file | ✅ default `sqlite` + `.data/langgraph-checkpoints.db` |

No secret is exposed to the browser: all Python calls and service-token headers are server-side. `.env` and `.data/` are gitignored.

## 3. Startup commands

From the repository root:

```powershell
# 1) Install (first run only)
cd frontend
npm install
cd ..

# 2) Intelligence service (FastAPI, port 8000)
npm run intel:serve

# 3) Next.js app (dev, port 3000) — separate terminal
npm run dev
```

Production build verification (isolated dist directory, avoids clobbering a running dev server):

```powershell
cd frontend
$env:NEXT_DIST_DIR='.next_verify'
npm run build
```

Optional demo data reset:

```powershell
npm run seed:reset
```

> Do **not** run `next dev` and `next start` against the same `.next` directory. Use a separate `NEXT_DIST_DIR` (as above) for build/start verification.

## 4. Deployment topology

Current system of record:

```text
Browser
  └─ Next.js 14 (server routes + RBAC + SQLite via node:sqlite)
       ├─ .data/trustdrive.db  (shared)
       ├─ .data/uploads/       (private files)
       └─ FastAPI intelligence service (:8000)
            └─ same .data/trustdrive.db
```

This is a **single-host deployment**. Next.js and FastAPI must run on the same host (or share the same mounted volume) because `node:sqlite` and SQLAlchemy open the same file.

## 5. Deployment readiness matrix

| Area | State | Notes |
|---|---|---|
| Application build | ✅ READY | 52 pages, 109 API routes, clean typecheck |
| Tests | ✅ READY | 187 Vitest + 127 Pytest, isolated test DB |
| Database integrity | ✅ READY | integrity/FK checks clean, 55 tables, schema v3; fresh-DB FK rebuild fixed |
| Auth/RBAC | ✅ READY | server-side guards; live 13/13 + 10/10 security checks |
| File uploads | ✅ READY (local disk) | magic-byte validation, private storage, consent gates |
| OCR | ✅ READY (RapidOCR) | real extraction, confidence, duplicate/failure handling |
| AI agent | ✅ READY (LangGraph) | 15/16-node conditional graph, persisted runs, human review |
| Durable checkpoints | ✅ READY (SQLite) | `checkpoints`/`writes` persisted; memory fallback reported honestly |
| Rate limiting | ✅ READY (single shared DB) | DB-backed sliding window; split deployment needs Redis/gateway |
| Trust/reporting | ✅ READY | deterministic score persisted as immutable history; real PDF + QR/verify page |
| Signed downloads | ✅ READY | fail closed without a production secret; documented rotation |
| 3D viewer | ✅ READY | real car GLB; honest 2W schematic |
| External registries | ❌ BLOCKED | no government/insurer/theft credentials |
| Blockchain anchoring | ❌ BLOCKED | not implemented; SHA-256 integrity only |
| YOLO photo damage | ❌ BLOCKED | weights not wired |
| Production fraud ML | ❌ BLOCKED | synthetic demo model only |
| LLM narrative | ❌ BLOCKED | `TD_LLM_PROVIDER=none` |
| S3 / external AV | ❌ BLOCKED | local disk + local signature scan |
| Email/SMS | ❌ BLOCKED | in-app notifications only |
| Postgres | ❌ BLOCKED | split deployment needs migration |
| PaddleOCR | ❌ BLOCKED | not installed; RapidOCR active and labelled |
| Docker image | ⚠️ NOT RUN | Docker daemon unavailable in this environment; CI/Dockerfile review still required |

## 6. Operational risks

1. **SQLite is a single-writer database.** Suitable for a demo/staging single host; not for horizontally scaled production. WAL mode is enabled, but concurrent writes from many workers can still contend.
2. **Rate limiting is shared only inside one SQLite deployment.** The `rate_limit_hits` table makes restarts/second Next.js processes consistent; a Postgres split deployment must move it to Redis or the gateway.
3. **Uploads are on local disk.** Backups must include `.data/uploads/`, `.data/trustdrive.db` (plus WAL sidecars during live operation) and `.data/langgraph-checkpoints.db`.
4. **`TD_SERVICE_TOKEN` is a shared secret.** Rotate it and keep it out of client bundles and logs.
5. **Signed downloads fail closed in production.** Configure `DOWNLOAD_SIGNING_SECRET` (or `QR_SIGNING_SECRET`) before `next start`; local `TD_ENV=local` is the only development escape hatch. Rotate by deploying the new secret everywhere, keeping the old one only for the 15-minute token TTL, then removing it.
6. **External provider status is honest but empty.** Provider checks show `unavailable`/demo labels; do not present them as government verification.
7. **Test database isolation is automatic.** `npm test` now uses a fresh seeded DB; set `TD_TEST_SNAPSHOT_LIVE=1` only when deliberately debugging against a live snapshot.

## 7. Recommendation

- **Demo/staging on one host:** deploy with the commands above; include the SQLite file, uploads and checkpoint volume, start FastAPI first, then Next.js.
- **Public production:** first migrate to Postgres, move uploads to S3-compatible storage, add a shared rate-limit/idempotency store (Redis/gateway), configure Postgres checkpointing for split workers, configure `DOWNLOAD_SIGNING_SECRET`, and add a real LLM/provider adapter (or keep deterministic mode explicitly).
- **Do not claim** government, insurer, theft, blockchain, YOLO or production XGBoost capabilities until their credentials/adapters are configured and retested.
