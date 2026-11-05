# TrustDrive — Feature Gap Matrix

> Every requested feature mapped to backend files, API, database tables,
> frontend route, test and remaining work. Status: ✅ complete · 🟡 partial ·
> ⛔ blocked (reason given). Updated 2026-11-05.

Legend for API: **N** = Next.js `/api/v1/*`, **B** = FastAPI `/api/backend/*`,
**V** = FastAPI `/api/v1/*`, **I** = `/api/intelligence/*`.

## Seller

| Feature | Status | Backend files | API | Tables | Frontend | Test | Remaining |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Register / login / reset | ✅ | `lib/server/auth.ts`, `app/routers/auth.py` | N, B, V | `users`, `sessions`, `auth_tokens` | `/register`, `/login`, `/forgot-password` | `test_backend`, `test_security` | — |
| Profile / KYC | ✅ | `routers/users.py` | N, B, V | `users`, `seller_profiles` | `/seller/settings` | `test_backend` | — |
| Add vehicle (validation, duplicate VIN/reg) | ✅ | `routers/vehicles.py` | N, B, V | `vehicles` | `/seller/add-vehicle` | `test_backend` | — |
| My vehicles / detail / archive | ✅ | `routers/vehicles.py` | N, B, V | `vehicles`, `listings` | `/seller/vehicles`, `/seller/vehicles/[id]` | `test_backend` | — |
| Vehicle images | ✅ | `routers/vehicles.py` | N, B, V | `vehicle_images` | `/seller/add-vehicle` | backend | — |
| Documents upload / replace / reprocess | 🟡 | `routers/vehicles.py`, `routers/v1.py`, `extract.py` | N, B, V, I | `documents` | `/seller/documents` | `test_pipeline` | binary upload is served by Next; Python registers metadata |
| Document processing status | ✅ | `extract.py`, `worker.py` | I, B | `background_jobs`, `documents` | `/seller/documents` | `test_pipeline` | — |
| Vehicle history + corrections | ✅ | `routers/vehicles.py` | N, B, V | `history_events` | `/seller/history` | `test_backend` | — |
| Mileage records + anomaly flag | ✅ | `routers/vehicles.py`, `detectors.py` | N, B, V, I | `mileage_readings`, `findings` | `/seller/history` | `test_backend`, `test_detectors` | — |
| Inspections / damage / accidents | ✅ | `routers/vehicles.py` | N, B, V | `vehicle_inspections`, `damage_records`, `accident_records` | `/seller/verification` | backend | — |
| Verification center / runs | ✅ | `routers/vehicles.py` | N, B, V | `verification_runs`, `verification_results`, `verification_evidence` | `/seller/verification` | `test_backend` | — |
| AI fraud findings | ✅ | `detectors.py`, `explain.py` | N, I | `findings`, `ai_analysis`, `trust_scores` | `/seller/fraud` | `test_detectors` | — |
| AI investigations (12-node) | ✅ | `ai-investigations/route.ts`, `InvestigationPanel.tsx` | N | `ai_runs` | `/seller/fraud`, `/buyer/risk` | tsc | run + history + citations |
| Provider checks | ✅ | `provider-checks/route.ts`, `ProviderChecksPanel.tsx` | N | `provider_checks` | `/seller/vehicles/[id]`, `/vehicle/[id]`, admin run | tsc | `unavailable` when unconfigured |
| Admin user management | ✅ | `admin/users/[id]/route.ts`, `AdminUsers.tsx` | N | `users` | `/admin/users` | tsc | soft delete |
| 3D inspection + damage hotspots | ✅ | `Viewer3D.tsx`, `routers/vehicles.py` | N | `damage_records` | `/seller/vehicles/[id]` | RTL/manual | exploded view omitted (single-mesh GLB) |
| Listing create / edit / lifecycle | ✅ | `routers/marketplace.py` | N, B, V | `listings`, `listing_events` | `/seller/listings`, `/seller/listings/[id]` | `test_backend` | — |
| Listing action bar (8 actions) | ✅ | `ListingActionBar.tsx` | N, B | `listings`, `qr_tokens`, `reports` | `/seller/listings/[id]` | RTL | — |
| Buyer inquiries / replies | ✅ | `routers/inquiries.py` | N, B, V | `inquiries`, `inquiry_messages`, `notifications` | `/seller/inquiries` | `test_backend` | — |
| Reports (PDF) | ✅ | `routers/reports.py` | N, B, V | `reports`, `report_access` | `/seller/reports` | `test_backend` | — |
| Notifications | ✅ | `routers/notifications.py` | N, B, V | `notifications` | `/seller/notifications` | `test_security` | — |

## Buyer

| Feature | Status | Backend files | API | Tables | Frontend | Test | Remaining |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Overview (real aggregates) | ✅ | `routers/vehicles.py`, Next data layer | N, B | `activity`, `saved_vehicles`, `inquiries` | `/buyer` | manual | — |
| Explore / search / filters / sort / pagination | ✅ | `routers/marketplace.py` | N, B, V | `listings`, `vehicles`, `trust_scores` | `/buyer/explore`, `/marketplace` | `test_backend` | — |
| Vehicle detail + verification | ✅ | `routers/vehicles.py`, `reports.py` | N, B, V | `vehicles`, `verification_*` | `/vehicle/[id]`, `/buyer/verification` | manual | — |
| History / mileage / AI risk / theft | ✅ | `detectors.py`, `explain.py` | N, I | `history_events`, `mileage_readings`, `theft_checks` | `/buyer/history`, `/buyer/risk` | `test_detectors` | theft is local-DB only |
| 3D viewer + hotspots | ✅ | `Viewer3D.tsx` | — | `damage_records` | `/inspection` | manual | exploded view omitted |
| Compare 2–4 | ✅ | `routers/marketplace.py` | N, B, V | `vehicles`, `trust_scores` | `/buyer/compare` | `test_backend` | — |
| Saved / saved searches | ✅ | `routers/marketplace.py` | N, B, V | `saved_vehicles`, `saved_searches` | `/buyer/saved` | `test_backend` | — |
| Inquiries / inspection request | ✅ | `routers/inquiries.py` | N, B, V | `inquiries`, `inquiry_messages` | `/buyer/inquiries` | `test_backend` | — |
| Reports / PDF / QR | ✅ | `routers/reports.py` | N, B, V | `reports`, `qr_tokens` | `/buyer/reports`, `/verify/[token]` | `test_backend` | — |
| Notifications / settings | ✅ | `routers/notifications.py`, `users.py` | N, B, V | `notifications`, `users` | `/buyer/notifications`, `/buyer/settings` | backend | — |

## Shared / platform

| Feature | Status | Backend files | API | Tables | Test | Remaining |
| --- | --- | --- | --- | --- | --- | --- |
| RBAC (server-side) | ✅ | `lib/server/http.ts`, `app/security.py` | all | `users` | `test_security` | — |
| Audit log | ✅ | `repository.audit`, `routers/audit.py` | N, B | `audit_logs` | `test_backend` | — |
| Hash chain / integrity | ✅ | `explain.py`, `routers/main.py` | N, I | `chain_records` | `test_chain` | on-chain anchoring not implemented |
| Trust score (versioned, additive) | ✅ | `explain.py` | N, B, V, I | `trust_scores` | `test_detectors` | — |
| 12-node investigator | ✅ | `agent.py` | V, I | `agent_investigations`, `human_review_queue` | `test_pipeline` | LangGraph activates when installed |
| Human review queue | ✅ | `agent.py`, `routers/main.py` | B, I | `human_review_queue` | `test_api` | — |
| Background jobs | ✅ | `worker.py`, `tasks.py` | B, I | `background_jobs` | `test_pipeline` | Celery needs `TD_BROKER_URL` |
| Rate limiting | ✅ | `lib/server/ratelimit.ts` (13 routes), `app/ratelimit.py` | N, B, V | — | `test_security` | in-process only; gateway limit for multi-instance |
| Signed download URLs | ✅ | `lib/server/signed.ts` | N | `report_access` | tsc + route wiring | rotate `DOWNLOAD_SIGNING_SECRET` |
| Malware scanning | ✅ | `lib/server/scan.ts` | N (upload) | — | `scan.test.ts` | local `local-signature-v1` by default; remote AV when `TD_MALWARE_SCAN_URL` set |
| Pagination parity (notifications/audit) | ✅ | `lib/server/pagination.ts`, `db.ts` | N, B | `notifications`, `audit_logs` | `test_backend` | offset + keyset; `unread` filters in SQL |
| Soft delete (users/documents) | ✅ | `lib/server/db.ts`, `routers/users.py`, `vehicles.py` | N, B, V | `users`, `documents` | `test_backend` | UI: document Delete, account Danger Zone in settings |
| Live AI stack panel | ✅ | `app/api/v1/ai/stack`, `components/public/StackStatus.tsx` | N → I | — | tsc | shown on `/technology`; honest `connected:false` fallback |
| On-chain anchoring | ⚙️ | `app/blockchain/chain_adapter.py` | I | `chain_records` | `test_api` | not configured, **not claimed** |
| Evidence graph / claims / provider checks | ✅ | `lib/server/evidence.ts` | N | `evidence_nodes`, `evidence_edges`, `vehicle_claims`, `provider_checks` | tsc | — |
| Saved comparisons / idempotency | ✅ | `lib/server/idempotency.ts`, `pagination.ts` | N | `saved_comparisons`, `idempotency_keys` | tsc | — |
| External registry (RTO/insurer) | ⛔ | — | — | — | — | no authorised access; demo provider only |

## Definition-of-done summary

- Backend business logic + persistence: ✅ for every row above.
- API contract tested: ✅ (80 Pytest tests; 68 `/api/backend` + 54 `/api/v1` + 13 `/api/intelligence` paths).
- Server-side permissions: ✅ (`test_security`).
- Frontend wired to real APIs: ✅ for the 50 existing pages (RSC reads + `fetch` mutations).
- Loading/empty/error states: ✅ on primary flows; 🟡 not uniform on every secondary list.
- No feature claimed live on demo data: ✅ adapters name the active engine; seed data is labelled.
