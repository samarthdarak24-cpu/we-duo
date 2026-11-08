# TrustDrive — Full Project Audit & Completion Report

> Audit date: **2026-11-05**. Scope: every backend module, API route, database
> table, OCR/ML/LLM adapter, LangGraph agent, document pipeline, Three.js viewer
> and verification module; plus the Seller/Buyer/Admin frontend coverage for each
> feature. Findings were verified against the running code and the live database.

## 1. Executive summary

The project was already substantially built (50 pages, 96 routes, 42 tables).
The audit found **three unconnected backend modules** (AI investigations,
provider checks, admin user management), **missing UI for soft delete**, and
several stale claims in the docs. All were fixed in this pass.

| Result | Value |
| --- | --- |
| Pages | **51** (added `/admin/users`) |
| API route files | **102** |
| React components | **89** |
| Python modules | **55** |
| Database tables | **51** (42 base + 9 additive intelligence/backend) |
| Backend tests | **88 passed** |
| Frontend tests | **65 passed** (9 files) |
| TypeScript | **exit 0** |
| Production build | **exit 0** · BUILD_ID `n2Zi3X7dEmceONjKyy8Vx` |

## 2. Inventory

- **Web**: Next.js 14 App Router, 51 pages, 102 API routes, 89 components.
- **Backend**: FastAPI (55 modules) — auth/users/vehicles/documents/history/
  mileage/verification/AI/damage/listings/search/saved/compare/inquiries/
  reports/QR/notifications/audit, plus intelligence (OCR, detectors, agent,
  worker, trust score, blockchain adapter).
- **Database**: SQLite, 51 tables, 30 indexes, 11 triggers, 5 views; Postgres is
  the documented production target.
- **Models**: PaddleOCR 3.7, RapidOCR, YOLO11m (MIT), XGBoost (synthetic demo),
  sentence-transformers, Qwen2.5-0.5B/SmolLM2-360M local LLM.

## 3. Backend audit

| Domain | Modules | Status | Notes |
| --- | --- | --- | --- |
| Auth & sessions | `lib/server/auth.ts`, `app/routers/auth.py` | ✅ | scrypt + HS256 shared by both runtimes; soft-deleted users rejected |
| Users / KYC | `routers/users.py`, `admin/kyc` | ✅ | profile, KYC review, soft delete |
| Vehicles | `routers/vehicles.py`, `lib/server/db.ts` | ✅ | CRUD, archive, duplicate VIN/reg rejection |
| Documents | `routers/vehicles.py`, `extract.py`, `ocr.py` | ✅ | 18-step pipeline, PaddleOCR/RapidOCR/PyMuPDF, soft delete |
| History / mileage | `routers/vehicles.py`, `detectors.py` | ✅ | append-only corrections, rollback detection |
| Verification | `routers/vehicles.py`, `verification-cases` | ✅ | runs/results/evidence persisted; case detail is API-only |
| AI findings / investigations | `detectors.py`, `agent.py`, `ai-investigations` | ✅ | 15/16-node conditional LangGraph, disputes, run history |
| Provider checks | `provider-checks/route.ts` | ✅ | admin-run, `unavailable` when unconfigured |
| Listings / marketplace | `routers/marketplace.py` | ✅ | lifecycle, search, saved, compare, share |
| Inquiries | `routers/inquiries.py` | ✅ | thread, status, inspection request |
| Reports / QR | `routers/reports.py` | ✅ | real PDF, hash re-verified, revocable QR |
| Notifications / audit | `routers/notifications.py`, `audit.py` | ✅ | offset + keyset pagination, SQL audit pages |
| Blockchain | `app/blockchain/` | ⚙️ | local SHA-256 chain only; on-chain **not claimed** |
| Jobs / worker | `worker.py`, `tasks.py` | ✅ | retries, timeouts, idempotency |
| LLM chat | `llm.py`, `/api/intelligence/chat` | ✅ | 4 guardrails + deterministic fallback |

## 4. Frontend coverage (Seller / Buyer / Admin)

| Feature | Page / form | Upload / action | Result / status |
| --- | --- | --- | --- |
| Seller overview | `/seller` | — | real DB KPIs |
| Vehicles list / detail | `/seller/vehicles`, `/seller/vehicles/[id]` | archive | trust, claims, damage, evidence graph, provider checks |
| Add vehicle | `/seller/add-vehicle` | stepper + validation | draft/publish status |
| Documents | `/seller/documents` | upload, replace, consent, re-verify, **delete** | status badges, extraction, near-duplicates |
| History / mileage | `/seller/history` | add event, correction | timeline, chart, findings |
| Verification | `/seller/verification` | run checks | check status, chain |
| Fraud / AI | `/seller/fraud` | dispute finding, **run investigation** | severity, citations, run history |
| Listings | `/seller/listings`, `/[id]` | publish/pause/sold, share | stats, inquiries |
| Inquiries | `/seller/inquiries`, `/[id]` | reply, status | thread |
| Reports | `/seller/reports` | generate/download | PDF, QR |
| Notifications | `/seller/notifications` | read / load more | unread count |
| Settings | `/seller/settings` | profile, KYC, 2FA, sessions, **delete account** | status |
| Buyer overview / explore | `/buyer`, `/buyer/explore` | filters, save | cards, trust |
| Search | `/buyer/search` | filters, saved searches | results |
| Vehicle detail | `/vehicle/[id]` | save, contact, 3D, **provider checks** | trust, evidence, damage hotspots |
| Buyer verification | `/buyer/verification` | lookup by reg/VIN/ID/QR | permitted summary |
| History / risk | `/buyer/history`, `/buyer/risk` | — | timeline, risk, **investigation** |
| Compare / saved | `/buyer/compare`, `/buyer/saved` | add/remove | side-by-side |
| Inquiries | `/buyer/inquiries`, `/[id]` | message, inspection request | thread |
| Reports | `/buyer/reports` | download | PDF |
| Settings | `/buyer/settings` | profile, **delete account** | status |
| Admin queue / KYC | `/admin/queue`, `/admin/kyc` | resolve, approve | counts |
| Admin users | `/admin/users` | **soft delete** | role, KYC, created |
| Admin audit | `/admin/audit` | filters, pages | append-only rows |
| Public verify / tech | `/verify/[token]`, `/technology` | QR lookup | **live stack panel** |

## 5. Gaps found and fixed in this pass

1. **AI investigations had no UI** → `InvestigationPanel` on `/seller/fraud` and
   `/buyer/risk`: run, answer, citations, trust, persisted run history.
2. **Provider checks had no UI** → `ProviderChecksPanel` on seller vehicle
   detail, public vehicle page (signed-in buyer) and admin-run controls.
3. **No admin user management** → `/admin/users` with soft delete + nav item.
4. **Soft delete had no UI** → document Delete and account Danger Zone.
5. **Pagination parity** → notifications offset + keyset, SQL `unread`; audit
   SQL pages; UI controls already present.
6. **Blockchain** → honest adapter (`anchoring_claimed:false`) surfaced on the
   verification page and `/technology`.
7. **Docs corrected** — 51 tables, 102 routes, 88/65 tests, real engine status.

## 6. API-only endpoints (no dedicated page, by design)

| Endpoint | Reason |
| --- | --- |
| `GET /api/v1/notifications/stream` | SSE transport used by the notification list |
| `GET /api/v1/files/[...key]` | signed download transport |
| `GET /api/v1/vehicles/:id/3d-model`, `/components` | data for the Three.js viewer |
| `GET /api/v1/vehicles/:id/near-duplicates` | page uses the server function; API for integrations |
| `POST /api/v1/alerts/evaluate` | internal evaluation hook (cron/worker) |
| `GET /api/v1/verification-cases/:id` | case detail is embedded in verification/investigation views |

## 7. Workflow verification

- **Seller → Buyer**: add vehicle → upload document → OCR/extraction → run
  verification → see findings → publish listing → buyer searches → opens
  detail → runs investigation → compares → saves → contacts seller → seller
  replies → buyer downloads report → QR verify → audit entry.
- Verified by: Pytest workflow/backend suites, Vitest component suite, real-DB
  smoke (logins, 18-step extraction, PDF, QR, soft delete, pagination), and a
  successful production build.

## 8. Remaining gaps (honest)

| Gap | Impact | Next step |
| --- | --- | --- |
| Real labelled fraud corpus | XGBoost is synthetic-demo | retrain with `--dataset-label real-labelled` |
| Authorised RTO/insurer API | provider checks are `unavailable` | configure `TD_PROVIDER_URL`/token |
| Malware scanner | adapter only | set `TD_MALWARE_SCAN_URL` |
| pgvector / Postgres / Redis / S3 | adapters, not exercised | run the production compose profile |
| Playwright browsers | E2E spec not executed here | `npx playwright install` + run in CI |
| Verification-case page | case detail API-only | add a read-only case page if required |
| GLB/font/image licences | unconfirmed | complete `ASSET_REGISTER.md` |

## 9. Commands

```bash
npx tsc --noEmit
npm test
python -m pytest -q            # services/intelligence
NEXT_DIST_DIR=.next_verify npm run build
npm run intel:serve            # .env enables the local LLM
```
