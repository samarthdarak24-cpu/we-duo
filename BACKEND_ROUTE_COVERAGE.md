# Backend route coverage audit

Checked: 2026-11-05. Compared `newdesign (3).md` §12 (API behavior and contracts)
and §11 (database entities) against the actual Next.js route tree.

Counts observed: **96 `app/api/**/route.ts` files**, **24 `lib/server/*.ts`
modules**, **51 tables + 5 views** in `.data/trustdrive.db`.

## 1. Design §12 contract, endpoint by endpoint

The design presents these as an *example* endpoint group and also says "keep the
existing API style where working", so a different path with the same behaviour
is recorded as an alias gap, not a missing feature.

| # | Design route | Actual file / method | Status |
|---|---|---|---|
| 1 | `POST /api/v1/vehicles` | `app/api/v1/seller/vehicles/route.ts` → POST | Covered, path differs |
| 2 | `GET /api/v1/vehicles/mine` | `app/api/v1/seller/vehicles/route.ts` → GET | Covered, path differs |
| 3 | `GET /api/v1/vehicles/:id` | `app/api/v1/vehicles/[id]/route.ts` → GET | Exact |
| 4 | `PATCH /api/v1/vehicles/:id` | `app/api/v1/seller/vehicles/[id]/route.ts` → PATCH | Covered, path differs |
| 5 | `POST /api/v1/vehicles/:id/documents` | `app/api/v1/vehicles/[id]/documents/route.ts` → POST | Exact |
| 6 | `GET /api/v1/vehicles/:id/documents` | same file → GET | Exact |
| 7 | `POST /api/v1/vehicles/:id/verification-runs` | `app/api/v1/vehicles/[id]/verify/route.ts` → POST | Covered, path differs |
| 8 | `GET /api/v1/verification-cases/:id` | `app/api/v1/verification-cases/[id]/route.ts` → GET | Exact |
| 9 | `GET /api/v1/marketplace/listings` | `app/api/v1/marketplace/listings/route.ts` → GET | Exact |
| 10 | `POST /api/v1/listings` | `app/api/v1/seller/listings/route.ts` → POST | Covered, path differs |
| 11 | `PATCH /api/v1/listings/:id` | `app/api/v1/seller/listings/[id]/route.ts` → PATCH | Covered, path differs |
| 12 | `POST /api/v1/listings/:id/publish` | `app/api/v1/seller/listings/[id]/[action]/route.ts` → POST (`publish`) | Covered, path differs |
| 13 | `POST /api/v1/saved-vehicles` | `app/api/v1/saved/[listingId]/route.ts` → POST | Covered, path differs |
| 14 | `POST /api/v1/inquiries` | `app/api/v1/inquiries/route.ts` → POST | Exact |
| 15 | `GET /api/v1/inquiries` | same file → GET | Exact |
| 16 | `POST /api/v1/vehicles/:id/ai-investigations` | `app/api/v1/vehicles/[id]/ai-investigations/route.ts` → POST | Exact (added) |
| 17 | `GET /api/v1/vehicles/:id/evidence-graph` | `app/api/v1/vehicles/[id]/evidence-graph/route.ts` → GET | Exact (added) |
| 18 | `POST /api/v1/reports` | `app/api/v1/reports/vehicle/[id]/route.ts` → POST | Covered, path differs |
| 19 | `GET /api/v1/reports/:id` | `app/api/v1/reports/[id]/route.ts` → GET metadata; PDF at `[id]/download` | Covered, split |

Result: **19/19 behaviours exist — 9 exact paths, 9 under a different path
(design's "example" naming), and 1 split across metadata + PDF download. No
contract endpoint is absent.**

## 2. Feature → backend files

| Feature | Backend files present |
| --- | --- |
| Registration, login, logout, refresh, email verify, password reset, 2FA | `app/api/v1/auth/*` (8), `lib/server/accounts.ts`, `auth.ts`, `totp.ts`, `session.ts`, `http.ts` |
| Profile, password, avatar, sessions, personal KYC | `app/api/v1/me/*` (7) |
| Seller vehicle create/read/edit/archive | `seller/vehicles/route.ts`, `seller/vehicles/[id]/route.ts`, `[id]/archive` |
| Documents: upload, list, consent, replace, reverify, completeness, extractions | `vehicles/[id]/documents/*`, `documents/[id]/*` (4), `evidence.ts` |
| Verification runs, results, cases, lookup, SSE stream | `vehicles/[id]/verify`, `verification`, `verification/lookup`, `verification/runs/[runId]/stream`, `verification-cases/[id]` |
| Trust, risk, insights, pricing, alerts, theft, chain | `vehicles/[id]/{trust,risk,insights,pricing,alerts,theft,chain}`, `chain/[vehicleId]` |
| AI assistant, health, explain, investigations | `ai/assistant`, `ai/health`, `vehicles/[id]/ai/explain`, `vehicles/[id]/ai-investigations`, `lib/server/ai.ts` |
| Findings, disputes, corrections | `vehicles/[id]/findings`, `findings/[id]/dispute`, `history/[id]/correction`, `damage/[id]/correction`, `admin/disputes/[id]/*` |
| Damage records | `vehicles/[id]/damage` |
| Mileage readings | `vehicles/[id]/mileage` |
| History | `vehicles/[id]/history` |
| Evidence graph, near-duplicates, claims, provider checks | `vehicles/[id]/{evidence-graph,near-duplicates,claims,provider-checks}`, `evidence.ts` |
| Marketplace browse/detail/search/stats/report | `marketplace/listings`, `marketplace/listings/[id]`, `marketplace/search`, `listings/[id]/{stats,report-suspicious}` |
| Listing lifecycle (draft, publish, pause, unpublish, sold, review, description, share) | `seller/listings/route.ts`, `seller/listings/[id]/*` (3) |
| Saved vehicles, saved searches, compare | `saved/route.ts`, `saved/[listingId]`, `saved-searches`, `compare` |
| Inquiries, messages, status | `inquiries/*` (4) |
| Reports: list, create, metadata, PDF download | `reports/route.ts`, `reports/vehicle/[id]`, `reports/[id]`, `reports/[id]/download`, `lib/server/pdf.ts` |
| Notifications incl. SSE | `notifications/*` (4) |
| Admin queue, KYC, listings, audit | `admin/*` (8) |
| Public verification, QR | `verify/[token]`, `seller/listings/[id]/share`, `lib/server/qr.ts` |
| Contact, newsletter | `contact`, `newsletter` |
| Alerts evaluation | `alerts/evaluate`, `lib/server/alerts.ts` |
| Cross-cutting: auth/RBAC, validation, files, rate limit, idempotency, signing, scanning, pagination, PDF, hashing | `lib/server/{http,auth,session,validate,files,ratelimit,idempotency,signed,scan,pagination,pdf,chain}.ts` |

## 3. Database entities

All design §11 entities exist: `users`, `seller_profiles`, `buyer_profiles`,
`sessions`, `vehicles`, `documents`, `history_events`, `mileage_readings`,
`damage_records`, `verification_runs`, `verification_results`, `findings`,
`listings`, `listing_images`, `saved_vehicles`, `inquiries`, `inquiry_messages`,
`reports`, `notifications`, `audit_logs`.

Additive tables added this pass: `evidence_nodes`, `evidence_edges`,
`verification_cases`, `document_extractions`, `vehicle_claims`,
`provider_checks`, `ai_runs`, `idempotency_keys`.

One leftover: `saved_comparisons` still exists in the already-created
`.data/trustdrive.db` from an earlier draft. Its DDL was removed from
`lib/server/db.ts` and no code reads it; it can be dropped on the next reset.
`saved_comparisons` is **not** used by `POST /api/v1/compare`.

## 4. Exact-path gaps (only if literal design paths are required)

If a client must call the design's literal URLs, these thin aliases are the only
missing files:

- `app/api/v1/vehicles/route.ts` → POST create (delegate to `createVehicleDraft`)
- `app/api/v1/vehicles/mine/route.ts` → GET (delegate to `getSellerVehicles`)
- `app/api/v1/vehicles/[id]` → add PATCH (currently seller path only)
- `app/api/v1/vehicles/[id]/verification-runs/route.ts` → POST (`startVerificationRun`)
- `app/api/v1/listings/route.ts` → POST
- `app/api/v1/listings/[id]/route.ts` → PATCH
- `app/api/v1/listings/[id]/publish/route.ts` → POST
- `app/api/v1/saved-vehicles/route.ts` → POST
- `app/api/v1/reports/route.ts` → POST (currently GET only)

None of these represent missing behaviour; each would be a 5–15 line delegation
that reuses the existing RBAC and result shapes.

## 5. Behaviour still missing (not file coverage)

These have files and return honest states, but the capability is not active:

1. Malware scanning (`scan.ts`) — no scanner configured, returns `not_configured`.
2. External provider checks (`provider-checks`) — `unavailable` until `TD_PROVIDER_*` is set.
3. OCR extraction adapter — `document_extractions` and near-duplicates return 0 rows because seeded documents have no `documents.extracted` payload.
4. Claims are stored but no rule evaluates them.
5. Document view/download auditing — `GET /api/v1/files/*` serves consented docs but does not write an audit row per view.
6. No admin UI for provider checks, AI runs, or verification cases (API only).
7. LangGraph remains uninstalled; AI review is deterministic and labelled as such.
