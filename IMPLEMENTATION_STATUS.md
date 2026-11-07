# TrustDrive — Implementation Status

> **Master tracker.** A feature is COMPLETE only when: UI matches design · backend API
> exists · DB operation works · permissions enforced server-side · loading/empty/error
> states work · input validation works · tests pass · data persists after refresh · no
> placeholder action remains · no fake result is presented as real · the related
> Seller/Buyer workflow works.

**Last updated:** 2026-11-08 (final verification) · **Final live evidence:** broad run `LIVE-MW6DOO1A` (272/272), focused run `MW5ATBQ1` (49/49), OCR negative 10/10, security 13/13 + 10/10, page sweep 40/40, responsive 44/44. · **Final suite evidence:** frontend **187/187**, backend **127/127**, typecheck 0, build 52/52 pages + 109 API routes. · **Final corrective retest:** signed report link fetched anonymously (200 `%PDF`, 45,266 bytes), tampered link 403, live LangGraph investigation wrote 15 checkpoints / 96 writes, invalid report type 400 / missing vehicle 404 / valid 201, 13th rapid login 429 with `Retry-After`.

## Governing decision

Additive, not destructive. The Next.js app is the **system of record** (portals, REST API,
relational DB). The Python FastAPI service is **additive** beside it, sharing the same
database. One shared DB, two runtimes, no removed feature.

## Verified facts (live, this pass)

- **55 tables**, `SCHEMA_VERSION=3`, shared `.data/trustdrive.db`; `integrity_check=ok`, 0 FK violations, WAL mode.
- **52 pages**, **109 Next.js API route handlers**, **87 React components**, **56 Python modules**.
- Users: admin + sellers (`samarth@trustdrive.dev`, `weduo@trustdrive.dev`) + buyers (`rohan@trustdrive.dev`, `aditya@trustdrive.dev`, others); password `demo1234`.
- **122 vehicles**, **110 listings** at final snapshot; all six implemented categories present; no planned-category rows.
- Evidence tables populated: `documents` 254, `document_extractions` 1,200, `damage_records` 75, `findings` 40, `mileage_readings` 158, `history_events` 97, `trust_scores` 73, `ai_runs` 41, `inquiries` 57, `inquiry_messages` 106, `reports` 33, `notifications` 361, `audit_logs` 209, `chain_records` 652.
- Seller pages pass the **real** logged-in `user.id` into `getSellerOverview` (not hardcoded).
- RBAC isolation confirmed: `inquiries` carry `buyer_id` + `seller_id`; non-owner read → 403; buyer document view is consent-gated.
- 3D: real `trustdrive-sedan.glb` for cars; labelled schematic and disabled interactions for all two-wheelers.

## Latest verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **0 errors** |
| `npm test -- --run` | **187 passed** (15 files, isolated fresh seeded DB) |
| `npm run intel:test` | **127 passed** (includes durable checkpoint) |
| `NEXT_DIST_DIR=.next_verify npm run build` | **PASS**, 52/52 pages, 109 API routes |
| Broad live browser run | **272/272 checks, 6/6 categories** |
| Focused six-feature run | **49/49 checks** |
| OCR negative paths | **10/10** |
| Security/RBAC focused | **13/13** |
| Independent security/API | **10/10 security, 15/15 API** |
| Page sweep / responsive | **40/40 pages, 44/44 responsive** |
| Trust snapshots | Persisted, deduplicated, append-only; returned as `history` |
| Rate limiting | Shared `rate_limit_hits` table; 429 + `Retry-After` verified |
| Durable checkpoints | `checkpoint_backend=sqlite`, `durable_checkpointing=true` |

## Phase summary

| Phase | Area | Status |
| --- | --- | --- |
| 0 | Repo audit (55 tables, 109 routes, 52 pages) | ✅ |
| 1 | Premium design system (Day/Night) | ✅ (skeletons present; some pages use simpler loading states) |
| 2 | Seller frontend (dashboard, vehicles, documents, history, verification, fraud, listings, inquiries, reports, settings) | ✅ |
| 3 | Buyer frontend (dashboard, explore, search, saved, compare, history, risk, reports, verification, inquiries, settings) | ✅ |
| 4 | DB & API architecture (55 tables, 11 immutability triggers) | ✅ |
| 5 | FastAPI backend (auth/users/vehicles/docs/history/mileage/verification/AI/damage/listings/search/saved/compare/inquiries/reports/QR/notifications/audit) | ✅ |
| 6 | Seller integration | ✅ |
| 7 | Buyer integration | ✅ |
| 8 | Document intelligence (18-step OCR pipeline) | ✅ (RapidOCR active; PaddleOCR adapter unavailable) |
| 9 | Deterministic fraud detection | ✅ |
| 10 | ML models (XGBoost mileage model demo-trained; YOLO adapter present but not wired end-to-end) | 🟡 |
| 11 | 15/16-node investigator (EV adds `EVBatteryAnalysisNode`) | ✅ LangGraph active in `backend/.venv` |
| 12 | Three.js inspection (real GLB, 4 modes, raycast picking, DB hotspots) | ✅ |
| 13 | Trust score & reports (PDF + QR) | ✅ |
| 14 | Record integrity (SHA-256, drift checks; no on-chain claim) | ✅ |
| 15 | Security / testing / workers | ✅ (DB-backed shared rate limit with memory fallback; DB-backed worker; signed downloads fail closed in production; external AV/S3 not configured) |
| 16 | Seed & deployment (six categories + demo inventory) | ✅ |
| 17 | Live browser verification | ✅ (seller/buyer core flows, six categories, OCR/AI/RBAC) |
| 18 | Final hardening (trust history, shared limiter, signed-download lockout, fresh-DB FKs, durable checkpoints, test isolation) | ✅ |

Legend: ✅ done & verified · 🟡 partial / honest gap · ⚙️ env-gated adapter · 🔲 not started.

## Multi-category platform

- **Taxonomy:** `frontend/lib/vehicle-categories.json` (`version: multicategory-1.0.0`, `trustVersion: trust-v2-multicategory`) is the single source of truth consumed by both TS and Python.
- **Six implemented categories:** petrol motorcycle, petrol scooter, electric scooter, electric motorcycle, petrol car, electric car.
- **Planned only:** moped, electric bike, three-wheelers, hatchback, SUV, MUV, hybrid, commercial. Not selectable.
- **Category-specific validation:** 2W chassis/frame 8–22 chars; cars 17-char VIN; EVs hide engine fields and expose battery SOH/motor fields.
- **Battery SOH ≠ odometer:** SOH in `vehicle_specs`; distance in `vehicles.km_claimed`; no odometer rows in `battery_records`.
- **3D policy:** car GLB labelled `generic-reference`; no car asset for two-wheelers; labelled schematic with interactions disabled.
- **Preserved:** car functionality, QA22 GLB registry and the earlier feature baseline remain intact.

## Honest gaps / blockers

- **External providers:** government/VAHAN, insurer and theft registries have no credentials/adapters. Demo sources are ignored; results are `unavailable`, never `verified`.
- **Blockchain anchoring:** not implemented. SHA-256 proves file integrity, not document authenticity.
- **YOLO photo damage:** adapter/weights report ready, but the tested upload path uses human-entered damage; no end-to-end photo detection claim.
- **XGBoost fraud model:** trained on synthetic demo data (`dataset_label: synthetic-demo`); not production fraud detection.
- **LLM narrative:** `TD_LLM_PROVIDER=none`; deterministic evidence-only text. No LLM conclusion is generated.
- **S3 / external AV / email / SMS / Postgres:** local disk, local signature scan, in-app notifications, shared SQLite only.
- **PaddleOCR:** not installed; RapidOCR is active and explicitly labelled.
- **Docker:** build not run in this environment (daemon unavailable).
- **Playwright browsers / test DB isolation:** CI must install Chromium; database tests now default to a fresh seeded DB (`TD_TEST_SNAPSHOT_LIVE=1` opts into a live snapshot).

## Demo logins (password `demo1234`)

`admin@trustdrive.dev` · `samarth@trustdrive.dev`, `weduo@trustdrive.dev` (seller) · `rohan@trustdrive.dev`, `aditya@trustdrive.dev` (buyer)

## Verification commands

```powershell
cd frontend
npx tsc --noEmit
npm test -- --run
cd ..
npm run intel:test
cd frontend
$env:NEXT_DIST_DIR='.next_verify'
npm run build
```

Live: `npm run intel:serve` + `npm run dev`, then `node qa/live_e2e.mjs` (or the focused harnesses in `qa/live-browser/`).
