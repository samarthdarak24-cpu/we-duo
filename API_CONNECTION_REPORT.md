# TrustDrive — API Connection Report

**Date:** 2026-11-07 · **Verdict: CONNECTED** — frontend, Next.js API, FastAPI intelligence and SQLite were verified as one working request path.

## 1. Connection topology

```text
Browser (Chromium)
  │  same-origin fetch / form submit (httpOnly cookie)
  ▼
Next.js 14  :3000
  ├─ /api/v1/*  (109 route handlers)
  │    ├─ lib/server/*  business logic
  │    └─ node:sqlite  ──────────────┐
  └─ lib/server/intelligence.ts      │
       │ X-Service-Token             │
       ▼                             │
FastAPI  :8000                       │
  ├─ /health                         │
  ├─ /api/intelligence/*             │
  └─ shared SQLite ──────────────────┘
       .data/trustdrive.db (55 tables)
```

- Browser never calls FastAPI directly and never sees `TD_SERVICE_TOKEN`.
- Next uses `httpOnly`, `sameSite=lax` session cookies; token/role are re-read from the live user row.
- Both runtimes open the same WAL-mode SQLite file; `/health` reports `shared_with_nextjs: true`.

## 2. Connectivity checks

| Check | Command / probe | Result |
|---|---|---|
| Next.js health | `GET /` | 200 |
| Next.js login route | `GET /login` | 200 |
| FastAPI health | `GET http://127.0.0.1:8000/health` | 200 `status=ok` |
| Shared DB | `/health` database block | `connected`, 55 tables, shared true |
| Service auth | anonymous `POST /api/intelligence/investigate` | 401 |
| Service auth | token-authenticated investigation | 200, 15/16 nodes |
| Marketplace | `GET /api/v1/marketplace/listings` | 200, real published rows |
| Categories | `GET /api/v1/categories` | 200, 6 categories |
| Public sample PDF | `GET /api/v1/public/sample-report` | 200, real `%PDF`, demo headers |
| Protected seller API | anonymous `GET /api/v1/seller/overview` | 401 |
| Private report | anonymous `GET /api/v1/reports/rep-1/download` | 403 |

## 3. Endpoint families verified

| Family | Examples | Result |
|---|---|---|
| Auth | `/auth/login`, `/auth/logout`, `/auth/refresh`, `/me` | PASS |
| Seller vehicles | `/seller/vehicles`, `/seller/vehicles/:id`, `/archive` | PASS |
| Documents | `/vehicles/:id/documents`, `/documents/:id`, `/consent`, `/replace`, `/reverify`, `/extractions` | PASS |
| Vehicle evidence | `/mileage`, `/history`, `/damage`, `/findings`, `/trust`, `/verification`, `/passport`, `/evidence-graph`, `/chain` | PASS |
| AI | `/ai-investigations`, `/ai/explain`, `/provider-checks` | PASS / provider BLOCKED |
| Marketplace | `/marketplace/listings`, `/marketplace/search`, `/seller/listings`, `/publish`, `/photos` | PASS |
| Buyer | `/buyer/overview`, `/recommended`, `/saved`, `/saved-searches`, `/compare`, `/inquiries` | PASS |
| Reports | `/reports`, `/reports/:id/download`, `/reports/vehicle/:id`, `/public/sample-report` | PASS |
| Notifications | `/notifications`, `/notifications/:id/read`, `/notifications/read-all`, `/stream` | PASS |
| Verification | `/verification/lookup`, `/verify/:token`, `/verification-cases/:id` | PASS |
| Admin | `/admin/audit`, `/admin/kyc`, `/admin/queue`, `/admin/disputes` | PASS (RBAC) |

## 4. Request/response contract checks

| Contract | Observation |
|---|---|
| Success envelope | Real data returned; no `setTimeout` success, no empty fake object |
| Error envelope | `{error:{code,message}}`; e.g. 409 `DUPLICATE_REG`, 422 `PUBLISH_BLOCKED`, 415 upload rejection |
| Validation | Both client and server; server authoritative |
| Method correctness | UI actions use POST/PATCH/DELETE as intended; no GET mutations observed |
| Ownership | Non-owner reads/mutations return 403/404; buyer cannot call seller mutation routes |
| Consent | Buyer document list only includes consented docs on a published listing |
| File downloads | PDF response starts with `%PDF`; raw documents require owner/admin |
| Service errors | Python unavailable → Next returns honest fallback label; OCR unavailable → `pending` + reason |

## 5. Network / console health

- Broad run: 12 console errors, all deliberate negative-test HTTP responses; **0 unexpected**.
- Focused run: one hydration warning from an injected `style` attribute on a file input (not emitted by SSR source); no failed API request in the successful path.
- No 404 chunk errors, no CORS errors, no leaked service token in browser payloads, no mixed-content requests.

## 6. API connection verdict

**PASS.** The frontend is genuinely connected to the Next.js API, the Next.js server is genuinely connected to FastAPI, and both are reading/writing the same database. The only disconnected capabilities are external providers and infrastructure adapters listed in `MISSING_CONNECTIONS.md`.
