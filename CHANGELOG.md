# Changelog

## 2026-11-05 — deployment readiness & audit

### Added
- `Dockerfile.render` — combined Next.js + FastAPI + worker image with a
  `/data` disk, slim Python runtime and health check.
- `scripts/start-render.sh` — supervisor (web → API → worker, exit-on-crash).
- `render.yaml` — one Render web service, 10 GB disk, generated secrets,
  `TD_SEED_DEMO=0`, admin bootstrap via `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
- `services/intelligence/requirements-render.txt` — slim runtime without
  torch/paddle/ultralytics.
- `.github/workflows/ci.yml` — typecheck, Vitest, Pytest, Next build, Docker
  build, `render.yaml` validation; optional Playwright job.
- `PROJECT_AUDIT.md`, `SETUP_AND_DEPLOYMENT.md`, `DATABASE_SCHEMA.md`,
  `AI_ARCHITECTURE.md`, `SECURITY.md`, `CHANGELOG.md`, `LICENSE`.
- `/verification-cases/[id]` page; `InvestigationPanel`, `ProviderChecksPanel`,
  `/admin/users`; live stack panel on `/technology`.
- Local malware scan (`local-signature-v1`) with EICAR/heuristic tests.

### Changed
- `TD_DB_FILE`, `TD_UPLOAD_DIR`, `TD_DATA_DIR` are honoured (containers/disks).
- `TD_SEED_DEMO=0` prevents demo accounts in production; optional admin bootstrap.
- Notifications support offset + keyset pagination; `unread` filters in SQL.
- Soft delete for users/documents with delete endpoints and auth exclusion.
- `.gitignore` / `.dockerignore` hardened (`.env`, data, generated builds).
- `tsconfig.json` excludes `deploy`, `test-results`, `playwright-report`.

### Fixed
- Login inputs now have `htmlFor`/`id`; password toggle renamed to
  “Reveal characters” (E2E strict-mode clash).
- E2E submit selector targets `form button[type="submit"]`.
- Stale 246 MB `deploy/static` export (broken imports) archived; typecheck clean.
- 1.5 GB of `.next_verify*` build artifacts removed.

### Security
- `.dockerignore` no longer ships `.env`/`.data`.
- Soft-deleted users cannot log in or use an unexpired JWT.

## 2026-11-04 — model activation
- YOLO11m MIT weights, PaddleOCR 3.7 (oneDNN off), RapidOCR, XGBoost,
  sentence-transformers and a local Qwen LLM with four output gates.
- `/api/intelligence/chat`, 10-case LLM evaluation (10/10).
