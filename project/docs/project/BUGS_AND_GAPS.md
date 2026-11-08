# TrustDrive — Bugs & Gaps (claimed vs real)

> Phase 0 deliverable, **updated 2026-11-05**. Every line was verified against
> code, the live 51-table database or a real request — not inferred from a
> README. Fixed items are kept with evidence so nobody re-introduces them.

## A. Fixed in the original audit pass (verified)

| # | Defect | Fix |
| --- | --- | --- |
| 1 | Homepage showed a looping video hero instead of the pinned scrollytelling sequence | `app/page.tsx` mounted `CinematicCarScrollytellingLazy`; later replaced by the simple looping hero at the owner's request (2026-11-05) |
| 2 | Contact form **presented a fake success** | `POST /api/v1/contact` + `contact_messages` table + real `fetch` with validation/error states |
| 3 | Newsletter form faked a subscription | `POST /api/v1/newsletter` + idempotent `newsletter_subscribers` |
| 4 | `/admin/notifications` and `/admin/settings` were dead links | both pages added on `PortalShell portal="admin"` |
| 5 | Sidebar promo CTA pointed at `/buyer/verify` (404) | corrected to `/buyer/verification` |
| 6 | Buyer history defaulted to a zero-event vehicle | defaults to the first listing with stored events |
| 7 | Every AI request 500'd in production (dev + `next start` shared `.next`) | clean rebuild; rule recorded in `ARCHITECTURE.md` §10 |
| 8 | `tsc` failed with ~31 errors from the co-located `precedent/` Vite app | `"exclude": ["node_modules", "precedent"]` |

## B. Fixed in the full-stack completion pass (2026-11-05)

| # | Gap from the checklist | Resolution | Evidence |
| --- | --- | --- | --- |
| B1 | **Seller Listing Features action bar** had only 3 of 8 actions | Already completed in code: all 8 actions wired to real endpoints/callbacks (Add Photos, Upload Documents, Set Price, Write Description, Preview, Share, Track Inquiries, Get Verification Report) | `components/seller/ListingActionBar.tsx`, RTL test `tests/component/listing-action-bar.test.tsx` |
| B2 | **9 of 24 required entities missing** | Live DB now has **51 tables**; all 24 required entities exist (5 as views over historical tables) with real rows, FKs, 30 indexes, 11 triggers | `docs/ERD.md`, `docs/ER_DIAGRAM.md`, `npm run schema:dump` |
| B3 | **No ER diagram / no Alembic migrations** | `docs/ERD.md` generated from the live schema; `docs/ER_DIAGRAM.md` (Mermaid); additive Alembic baseline in `services/intelligence/alembic/` | — |
| B4 | **Document intelligence was 3 steps deep** — uploads hashed but never read | Real **18-step** workflow with OCR adapters, Pydantic extraction, SHA-256, duplicate detection, expiry, confidence, manual-review queue, evidence + notification persistence | `services/intelligence/app/extract.py`, `ocr.py`, `test_pipeline.py` |
| B5 | **No ML / anomaly detector / explainability object** | Deterministic rules + Isolation Forest / LOF; every finding carries anomaly type, readings, severity, evidence, explanation, method, version, confidence and review action; exact additive attribution replaces SHAP | `app/detectors.py`, `app/explain.py` |
| B6 | **No LangGraph agent, no checkpointing, no human-in-the-loop queue** | 12 named nodes, graph + checkpointer when LangGraph is installed, honest sequential fallback otherwise, `human_review_queue` + inspector resolution endpoint + audit log | `app/agent.py`, `app/main.py` |
| B7 | **No GLB asset — primitive `<boxGeometry>` car** (explicitly forbidden) | Real GLB copied to `public/models/car.glb`; `Viewer3D.tsx` loads it via `GLTFLoader`, centres/orients/scales it, adds full-screen, WebGL fallback, 360° rotation, camera presets, click-to-select, loading state. Procedural car retained **only** as an error fallback. | `components/shared/Viewer3D.tsx` |
| B8 | **Only 3 vehicles seeded; no reset command** | **13 vehicles** seeded with suspicious-mileage, duplicate-document and VIN-mismatch examples; `npm run seed:reset` added | `lib/seed.ts`, `scripts/reset-seed.mjs` |
| B9 | **No drift-detection endpoint** | `GET /api/intelligence/integrity/:vehicleId` recomputes hashes and surfaces drift; missing files reported as unavailable, never as verified | `app/main.py` |
| B10 | **No background job infrastructure** | DB-backed `background_jobs` worker with status, retries, timeouts, idempotency, progress and failure handling; 10 job handlers; Celery activates only with a broker | `app/worker.py`, `app/tasks.py` |
| B11 | **No Python runtime / FastAPI / OpenAPI** | `services/intelligence/` created: FastAPI, Pydantic v2, SQLAlchemy 2.x, Alembic, auto `/openapi.json`, structured JSON logs, health | `services/intelligence/README.md` |
| B12 | **Only 4 Vitest files; no RTL/Playwright/Pytest** | Added RTL component tests, a 15-step Playwright E2E spec, and 3 Pytest modules with an isolated seeded test DB | `docs/TESTING.md` |
| B13 | **No Dockerfile / Compose / CI / delivery docs** | `Dockerfile`, `services/intelligence/Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml`, `.env.example`, and README/DEPLOYMENT/SECURITY/API_SPECIFICATION/TESTING/RBAC_MATRIX/ER_DIAGRAM/AGENTS | repo root + `docs/` |
| B14 | `IMPLEMENTATION_STATUS.md` was stale and wrong | Rewritten against the live schema; `IMPLEMENTATION_REPORT.md` is the §20 report | — |
| B15 | Python service only exposed intelligence, not the checklist's full backend categories | Added `/api/v1/*` + `/api/backend/*` — **137 OpenAPI paths** (54 v1, 68 backend, 13 intelligence): auth, users, vehicles, documents, history, mileage, verification, AI, damage/inspections, listings, search, saved, comparisons, inquiries, reports (real PDF), QR, notifications, audit/admin. Same scrypt+HS256 users as Next.js; RBAC per route; append-only integrity tables; 16 backend tests | `services/intelligence/app/routers/`, `tests/test_backend.py` |

## C. Residual gaps (NOT claimed as working)

| # | Gap | Impact / honest status |
| --- | --- | --- |
| C1 | Per-IP rate limiting is **in-process only** | ✅ implemented in `lib/server/ratelimit.ts` (13 routes) and `app/ratelimit.py` (auth routes); a multi-instance deploy must move the bucket to the gateway/Redis. |
| C2 | Signed download URLs | ✅ implemented in `lib/server/signed.ts` (HMAC scope+id+exp), wired to `files/[...key]` and `reports/[id]/download`. Residual: rotate `DOWNLOAD_SIGNING_SECRET`. |
| C3 | Malware scanning | ✅ `lib/server/scan.ts` runs a **local signature + heuristic scan** by default (EICAR, PDF JavaScript/Launch, Office macros, download-and-run, MZ headers) and reports `local-signature-v1`; a full external AV is used when `TD_MALWARE_SCAN_URL` is set. The detail says it is not a full antivirus engine. |
| C4 | **Pagination parity** | ✅ notifications now support offset (`page`/`pageSize`) and keyset (`limit`/`before`); `unread` filters in SQL; audit pages in SQL. |
| C5 | **Soft-delete parity** | ✅ additive `deleted_at` on `users`/`documents`; `DELETE /users/me`, `/documents/:id`, `/admin/users/:id`; reads, login and sessions exclude deleted rows. |
| C6 | **Exploded / reassembly 3D view** | All three supplied GLBs are a **single merged mesh** with no separated parts. The checklist permits omitting exploded view when the model lacks separated parts. Component highlighting is done via stable hotspot IDs mapped to DB damage records. |
| C7 | **Adapter-only integrations** | pgvector, Celery/Redis, Postgres and S3 are production targets, not active local integrations; on-chain anchoring is a not-configured adapter and is **not claimed**. PaddleOCR, YOLO, XGBoost, RapidOCR, sentence-transformers and the local LLM are installed and active. Every payload names the active backend. |
| C8 | **Playwright not executed locally** | Spec + config + CI job are present; browser binaries were not installed in this sandbox. |
| C9 | **No external India vehicle registry** | VIN/registration checks are local-database only (MoRTH data-sharing constraints). |

## D. Explicitly NOT bugs (checked, working)

- RBAC: `/api/v1/inquiries/q1` → 403 for non-owner, 200 for owner;
  `GET /api/v1/compare` → 405 (POST-only by design);
  `/api/v1/admin/kyc/:userId` → PATCH-only;
  `/api/v1/verification/lookup` requires `{type,value}`.
- 48/48 portal pages return 200 for the correct role; 40+ endpoints return
  correct 200/400/401/403/405/409/422 semantics.
- Report PDF download, QR token verification and consent-gated file serving work.
- "Generate with AI" on the listing description hits a real deterministic backend.

## E. Environment blockers (not code defects)

- Docker daemon was not running during the audit; the stack therefore runs
  local-first (SQLite + in-process worker) and switches by env var.
- Node 22.5+ is required for `node:sqlite`. The local runtime is Node 22.22.2.
- The 3D GLB is 39 MB. It is a real model, but a production build should serve
  a compressed/optimised variant.
