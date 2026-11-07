# TrustDrive — API Specification

Two runtimes share **one database** (`.data/trustdrive.db`). The Next.js app is the
**system of record** for portals, REST, and the relational DB; the FastAPI service is an
**additive intelligence layer** over the same file.

- **Next.js** REST: `/api/v1/*` (documented below) — the contract the UI calls.
- **FastAPI**: `/api/backend/*` (full surface, same scrypt+HS256 users), `/api/v1/*`
  (thin adapters mapping documented contract paths), `/api/intelligence/*` (OCR, fraud
  detectors, 15/16-node conditional investigator (EV adds `EVBatteryAnalysisNode`), trust score, background jobs, integrity drift).
  Live OpenAPI: `GET /openapi.json` when the service runs (`npm run intel:serve`).

---

## 1. Conventions

- **Auth:** `Authorization: Bearer <JWT>` (HS256) or httpOnly session cookie. Python
  intelligence endpoints additionally require `X-Service-Token` (or an internal service JWT)
  when `TD_SERVICE_TOKEN` is set; otherwise localhost-only.
- **RBAC:** enforced server-side on every route (`lib/server/http.ts`, `app/security.py`).
  Direct API calls and direct URL navigation are both checked.
- **Validation:** Zod (Next.js) + Pydantic v2 (FastAPI). Invalid input → `422`.
- **Errors:** `401` unauthenticated · `403` forbidden (wrong role/owner) · `404` not found ·
  `405` method not allowed (e.g. `GET /compare`) · `409` conflict (duplicate VIN/reg) ·
  `422` validation.
- **Pagination:** offset + keyset supported on `notifications` and `audit_logs` (`lib/server/pagination.ts`).

---

## 2. Authentication & account (`/api/v1/auth/*`, `/me/*`)

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/register` | `{name,email,password,role}` | role ∈ seller|buyer|admin |
| POST | `/api/v1/auth/login` | `{email,password}` | sets httpOnly cookie; returns JWT |
| POST | `/api/v1/auth/refresh` | `{refreshToken}` | rotates tokens |
| POST | `/api/v1/auth/logout` | — | clears session |
| POST | `/api/v1/auth/forgot-password` | `{email}` | 202 (always, no enum) |
| POST | `/api/v1/auth/reset-password` | `{token,password}` | 204 |
| GET | `/api/v1/auth/verify-email?token=` | — | email verification |
| GET | `/api/v1/me` | — | current user profile |
| PATCH | `/api/v1/me` | profile fields | update own |
| POST | `/api/v1/me/password` | `{current,next}` | scrypt rehash |
| POST | `/api/v1/me/2fa` | — | TOTP enrol |
| POST | `/api/v1/me/kyc` | documents | seller KYC |
| GET/DEL | `/api/v1/me/sessions[/:id]` | — | session list / revoke |

---

## 3. Seller & vehicle endpoints

| Method | Path | Purpose | Tables |
| --- | --- | --- | --- |
| POST | `/api/v1/vehicles` | register vehicle (dup-guard VIN/reg) | `vehicles` |
| GET | `/api/v1/vehicles/:id` | vehicle detail (owner) | `vehicles` |
| PATCH | `/api/v1/vehicles/:id` | edit permitted fields | `vehicles` |
| POST | `/api/v1/vehicles/:id/archive` | archive | `vehicles` |
| POST | `/api/v1/vehicles/:id/mileage` | submit mileage reading | `mileage_readings` |
| GET | `/api/v1/vehicles/:id/3d-model` | GLB manifest | `damage_records` |
| GET | `/api/v1/vehicles/:id/components` | component registry + damage map | `damage_records` |
| GET | `/api/v1/vehicles/:id/damage` | damage records | `damage_records` |
| POST | `/api/v1/damage` | add damage record (component ID) | `damage_records` |
| PATCH | `/api/v1/damage/:id/correction` | audited correction (append) | `damage_records`,`audit_logs` |
| POST | `/api/v1/documents` | upload document (multipart) | `documents`,`background_jobs` |
| GET | `/api/v1/documents/:id` | document + extracted fields | `documents` |
| GET | `/api/v1/documents/:id/extractions` | OCR fields + confidence | `documents` |
| POST | `/api/v1/documents/:id/replace` | versioned replacement | `documents` |
| POST | `/api/v1/documents/:id/reverify` | re-run verification | `documents` |
| POST | `/api/v1/documents/:id/consent` | consent grant for buyer view | `documents` |
| GET/POST | `/api/v1/history` | list / add history event | `history_events` |
| PATCH | `/api/v1/history/:id/correction` | append-only correction | `history_events` |
| GET | `/api/v1/seller/overview` | 12 KPIs (`getSellerOverview`) | `vehicles`,`listings`,`findings`,`inquiries` |
| GET | `/api/v1/seller/listings` | seller's listings | `listings` |
| POST | `/api/v1/seller/listings` | create listing | `listings` |
| GET/PATCH | `/api/v1/seller/listings/:id` | read / update listing | `listings` |
| POST | `/api/v1/seller/listings/:id/:action` | `publish|pause|resume|sold` | `listings`,`listing_events` |
| GET | `/api/v1/findings` | AI findings for owner | `findings` |
| POST | `/api/v1/findings/:id/dispute` | dispute a finding | `findings` |
| GET | `/api/v1/alerts`, `/alerts/evaluate` | fraud alerts + re-evaluate | `findings` |

---

## 4. Buyer & marketplace endpoints

| Method | Path | Purpose | Tables |
| --- | --- | --- | --- |
| GET | `/api/v1/buyer/overview` | buyer dashboard aggregates | `saved_vehicles`,`inquiries` |
| GET | `/api/v1/buyer/recommended` | recommended vehicles | `vehicles`,`trust_scores` |
| GET | `/api/v1/marketplace/listings` | published listings (browse) | `listings`,`vehicles` |
| GET | `/api/v1/marketplace/listings/:id` | public listing detail | `listings`,`vehicles` |
| GET | `/api/v1/marketplace/search?…` | filtered/sorted/paginated | `listings`,`vehicles` |
| POST | `/api/v1/compare` | compare 2–4 vehicles (POST-only → 405 on GET) | `vehicles`,`trust_scores` |
| GET/POST | `/api/v1/saved[/:listingId]` | save / unsave | `saved_vehicles` |
| GET/POST | `/api/v1/saved-searches` | saved search criteria | `saved_searches` |
| GET | `/api/v1/listings/:id/stats` | views / saves | `listings` |
| POST | `/api/v1/listings/:id/report-suspicious` | buyer report | `listings`,`audit_logs` |
| GET | `/api/v1/vehicle/:id/verification` | verification summary | `verification_evidence` |
| GET | `/api/v1/chain/:vehicleId` | blockchain/SHA-256 integrity | `chain_records` |
| POST | `/api/v1/verify/:token` | public QR verification | `qr_tokens` |
| POST | `/api/v1/verification/lookup` | lookup by `{type,value}` | `vehicles` |

---

## 5. Inquiries, reports, notifications

| Method | Path | Purpose | Tables |
| --- | --- | --- | --- |
| GET/POST | `/api/v1/inquiries` | list own / create (buyer) | `inquiries` |
| GET | `/api/v1/inquiries/:id` | read (owner only → 403 else) | `inquiries` |
| GET/POST | `/api/v1/inquiries/:id/messages` | thread (owner only) | `inquiry_messages` |
| POST | `/api/v1/inquiries/:id/status` | negotiate/schedule/close | `inquiries` |
| GET/POST | `/api/v1/reports/vehicle[/:id]` | generate vehicle report | `reports` |
| GET | `/api/v1/reports/:id/download` | signed PDF (signed URL) | `reports`,`report_access` |
| GET/POST | `/api/v1/notifications` | list / create | `notifications` |
| POST | `/api/v1/notifications/:id/read` | mark read | `notifications` |
| POST | `/api/v1/notifications/read-all` | mark all read | `notifications` |
| GET | `/api/v1/notifications/stream` | SSE stream | `notifications` |

---

## 6. Intelligence service (`/api/intelligence/*`, FastAPI)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | service + engine status |
| GET | `/api/intelligence/capabilities` | active OCR/LLM/agent/worker versions |
| POST | `/api/intelligence/documents/process` | 18-step OCR + extraction pipeline |
| GET/POST | `/api/intelligence/fraud/{vehicleId}` | deterministic + ML detectors |
| POST | `/api/intelligence/investigate` | 15/16-node conditional investigator (EV adds `EVBatteryAnalysisNode`; LangGraph when installed) |
| GET | `/api/intelligence/trust-score/{vehicleId}` | additive deterministic trust score |
| GET/POST | `/api/intelligence/jobs[/:id]` | DB-backed background jobs |
| GET/POST | `/api/intelligence/review[/:id/resolve]` | human-in-the-loop queue |
| GET | `/api/intelligence/integrity/{vehicleId}` | SHA-256 drift detection |
| POST | `/api/intelligence/chat` | grounded vehicle Q&A (citations) |
| GET | `/api/intelligence/blockchain/integrity/{vehicleId}` | chain verification (no on-chain claim) |

Every intelligence payload names its **active engine/method/version**; absent providers are
reported as adapters, never as live results.

---

## 7. Example: Seller publishes → Buyer discovers (same DB)

```http
# Seller (authenticated, owner)
POST /api/v1/vehicles            {reg_no, vin, make:"BMW", model:"3 Series", year:2021, …}
POST /api/v1/documents           <multipart RC/insurance>
POST /api/v1/seller/listings     {vehicleId, headline, asking_price:2600000}
POST /api/v1/seller/listings/:id/publish

# Buyer (authenticated)
GET /api/v1/marketplace/search?make=BMW        # returns the SAME listings row
GET /api/v1/marketplace/listings/:id           # detail + trust score
POST /api/v1/inquiries                          {listing_id, message}   # buyer_id + seller_id set
GET /api/v1/inquiries/:id                       # 200 owner / 403 non-owner
```

All four writes/read hit the single `vehicles` + `listings` + `inquiries` tables — no
copying between roles.
