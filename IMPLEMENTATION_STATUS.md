# TrustDrive — Implementation Status

> **Master tracker for the full-stack checklist** (`checklist.md`, supplied by the
> project owner). Ticked only when the item satisfies §20 Definition of Done:
> UI + API + DB + permissions + loading/empty/error states + validation +
> tests + persistence + no placeholder action + no fake result.
> **Last updated:** 2026-11-05 · **full-stack completion pass**.
> Companions: `ARCHITECTURE.md`, `TECH_STACK.md`, `BUGS_AND_GAPS.md`,
> `docs/ERD.md`, `IMPLEMENTATION_REPORT.md`.

## Governing decision

Additive, not destructive. The Next.js app stays the system of record for the
portals, REST API and relational database; a Python **intelligence service**
(`services/intelligence/`) was added beside it, sharing the same database, for
document AI, fraud detection, the 12-node investigator and background jobs.
**One shared relational DB, two runtimes, no removed feature.**

## Legend

✅ done & verified · 🟡 partial / honest gap · ⚙️ env-gated adapter (real code,
needs a daemon/credential to activate) · 🔲 not started

---

## PHASE 0 — Existing project audit ✅ COMPLETE

- [x] Repository, framework, DB (51 tables), 102 API routes, 51 pages inspected.
- [x] Auth (JWT HS256 + scrypt, httpOnly cookies, RBAC), Seller/Buyer dashboards.
- [x] Three.js, GLB assets, AI/OCR, duplicates, build errors, DB relationships.
- [x] `ARCHITECTURE.md` · `TECH_STACK.md` · `IMPLEMENTATION_STATUS.md` · `BUGS_AND_GAPS.md`.
- [x] 5 broken buttons/nav + 3 build/runtime errors fixed (§A of `BUGS_AND_GAPS.md`).
- [x] No existing working functionality removed.

## PHASE 1 — Premium design system ✅ (minor 🟡)

- [x] Graphite sidebar, champagne/gold accent, ivory portal surfaces, elegant type, consistent spacing/radius/icons.
- [x] Day/Night theme parity across portals (`app/theme-night.css`, generated remap).
- [x] Realistic vehicle imagery, clean charts, responsive layouts, functional tooltips, forms/modals.
- [x] Reusable UI primitives + DB-backed hotspots; `VehicleThumb`, `StatusBadge`, `TrustRing`, `Timeline`.
- 🟡 Shared skeleton/empty/error primitives are present on key flows but not yet
  applied uniformly to all 25 portal screens (recorded in `BUGS_AND_GAPS.md`).

## PHASE 2 — Seller frontend (12 screens) ✅

All 12 screens exist. **The 8-action Listing Features bar is complete** and every
button hits a real endpoint or workspace callback (`ListingActionBar.tsx`), with
RTL tests for loading/error/success states. Overview shows the 12 required
metrics; alerts are full-width rows with evidence + Review action.

## PHASE 3 — Buyer frontend (12 screens) ✅

All 12 screens exist, including explore, search/filters, verification, vehicle
history, AI risk, compare, saved, reports, inquiries, notifications, settings.
Overview includes explored/saved/recent/recommended/trust score/insights/price.

## PHASE 4 — Database & API architecture ✅ (minor 🟡)

- [x] **51 tables**, all 24 required entities (5 exposed as canonical views), FKs, 30 indexes, 11 immutability triggers, `SCHEMA_VERSION=3`.
- [x] ER diagram (`docs/ERD.md` live-generated, `docs/ER_DIAGRAM.md` Mermaid).
- [x] Additive Alembic baseline (`services/intelligence/alembic/`).
- [x] Seed script + `npm run seed:reset` — **13 vehicles**, 7 users, 80 documents, 35 mileage readings, 111 chain records.
- [x] REST endpoint categories documented (`docs/API_SPECIFICATION.md`), request/response schemas, auth, RBAC, validation, error handling.
- ✅ Pagination parity on notifications/audit reads; soft-delete parity on `users`/`documents` (`deleted_at`, delete endpoints, auth exclusion).

## PHASE 5 — FastAPI backend ✅ (all feature categories)

`services/intelligence/`: FastAPI, Pydantic v2, SQLAlchemy 2.x (reflects the
live schema), Alembic, auto `/openapi.json` + `/docs`, structured JSON logs,
`/health`.

**Complete backend surface** at `/api/v1/*` + `/api/backend/*` — 137 OpenAPI paths across
authentication, users, vehicles, documents, history, mileage, verification, AI,
damage/inspections, listings, search, saved, comparisons, inquiries, reports
(real PDF), QR verification, notifications and audit/admin. Auth uses the
**same scrypt hashes and HS256 tokens** as Next.js, so one account works in both
runtimes. RBAC enforced per route; writes are schema-adaptive and respect the
live CHECK constraints; `chain_records`/`audit_logs`/`trust_scores` are
append-only; history corrections append and never overwrite. Covered by 16
backend contract tests plus a real-DB smoke run. Next.js call sites degrade
honestly when the service is down.

## PHASE 6 — Seller integration ✅
## PHASE 7 — Buyer integration ✅

Persisted workflows: vehicle CRUD, documents, history, mileage, verification,
listing transitions, inquiries, reports, QR, notifications, saved/compare.
Server-side RBAC on all routes; 48/48 pages 200 for the correct role.

## PHASE 8 — Document intelligence ✅ (⚙️ OCR adapter)

The **18-step workflow** is implemented (`app/extract.py`): extension/MIME/size
validation, private storage, SHA-256, job creation, OCR, field extraction,
normalisation, DB comparison, duplicate detection, expiry, metadata, confidence,
low-confidence flagging, manual review, evidence, seller notification,
buyer-safe exposure, persistence.

- ✅ PyMuPDF real PDF text layer + OpenCV preprocessing (deskew/denoise/threshold/contours).
- ⚙️ PaddleOCR adapter activates only when installed. A PDF text layer is never
  reported as OCR; a fallback is never presented as a real verification.
- ⚙️ Malware-scanning hook is an unimplemented adapter slot (§C3).

## PHASE 9 — Deterministic fraud detection ✅

Mileage decrease, unusual jumps, conflicting readings, duplicate readings with
conflicting dates, implausible usage; duplicate documents, repeated invoice
numbers, VIN/reg mismatch, missing fields. Every finding has anomaly type,
readings, severity, evidence, explanation, method, version, confidence and
recommended review action.

## PHASE 10 — ML models ✅ (⚙️ optional adapters)

- ✅ Isolation Forest + Local Outlier Factor on (year, km, delta) with scikit-learn.
- ✅ Exact additive feature attribution (`app/explain.py`) instead of SHAP —
  strictly better for a linear model.
- ⚙️ XGBoost / YOLO / Sentence-Transformers / pgvector are adapter slots: no
  labelled corpus or trained weights exist, so fitting them would be theatre.

## PHASE 11 — LangGraph investigator ✅ (⚙️ graph when installed)

12 named nodes (VehicleResolver → … → ResultPersistence), evidence correlation,
conflict detection, grounded explanation, human-in-the-loop queue + inspector
resolution with audit log, persisted investigations.

- ⚙️ LangGraph + checkpointer activate when installed; otherwise the **same 12
  node functions** run sequentially and the payload reports
  `orchestrator: "sequential-fallback"`. Never claimed as LangGraph when absent.

## PHASE 12 — Three.js vehicle inspection ✅ COMPLETE (Full Automotive 3D Suite)

- [x] **Real Multi-Part Sedan GLB** (`public/models/vehicles/trustdrive-sedan.glb` & `public/models/car.glb`, 11.8 MB, 101 nodes, 97 meshes) loaded via `GLTFLoader`. Asset licensed under **CC BY 4.0** (Khronos Group & Eric Chadwick, DGG).
- [x] **Model Manifest** (`public/models/vehicles/model-manifest.json`) defining license, attribution, component meshes, bounding dimensions, and supported interactions.
- [x] **Component Registry** (`lib/vehicle-registry.ts`) mapping actual GLB nodes to 20 canonical component IDs, tracking 18 available and 2 justified unavailable components with explosion vectors and anchors.
- [x] **Four Interactive Modes**:
  1. **Normal Mode:** Fully assembled vehicle, metallic silver PBR paint, studio reflections, 360° orbit rotation, and 6 camera presets.
  2. **Exploded Mode:** Procedural animated disassembly moving hood, doors, boot, roof, wheels, engine, and axles outward along deterministic vectors; smooth reverse reassembly.
  3. **Damage Mode:** Highlights damaged parts with amber warning glow, projects interactive damage markers, and supports severity filtering (All / Minor / Moderate / Major).
  4. **X-Ray Mode:** Ghosted translucent exterior shell (`opacity: 0.14, depthWrite: false`) exposing genuine internal powertrain, axles, brake assemblies, spaceframe, and cabin.
- [x] **Raycast Mesh Picking:** Clicks on real vehicle meshes resolve canonical component IDs and open the damage evidence panel.
- [x] **Camera Controls:** 6 presets ("3/4 Hero", "Front", "Side Flank", "Rear Tail", "Top Down", "Powertrain"), 360° slider, zoom in/out, auto-rotate turntable toggle, reset view, and fullscreen.
- [x] **Backend API Integration:** Dedicated `/api/v1/vehicles/:id/3d-model` and `/api/v1/vehicles/:id/components` endpoints with RBAC; augmented `/api/v1/vehicles/:id/damage` with component mapping.
- [x] **Documentation & Verification:** `docs/COMPONENT_AVAILABILITY_REPORT.md`, `docs/ASSET_ATTRIBUTION.md`, `tests/vehicle-3d-inspection.test.ts` (8/8 tests pass), and full production build verified.

## PHASE 13 — Trust score & reports ✅

Additive deterministic score with 6 weighted factors, base 50, version
`trust-score-2.0.0`, exact per-feature contributions, positive evidence,
negative findings, unverified areas, missing-data policy, last-updated time,
`trust_scores` persistence. PDF reports + QR verification + consent-filtered
public summary work.

## PHASE 14 — Blockchain / record integrity ✅

SHA-256 document hashes, immutable audit events, verification timestamps,
`chain_records` (111 seeded), **drift detection** endpoint
(`/api/intelligence/integrity/:vehicleId`), event history. On-chain submission
is deliberately not implemented and explicitly not claimed.

## PHASE 15 — Security, testing & workers 🟡 (real gaps remain)

- ✅ scrypt hashing, JWT/httpOnly sessions, server-side RBAC, Zod/Pydantic
  validation, parameterised SQL, magic-byte upload validation, private storage,
  audit logs, structured JSON logs, 2FA/KYC, backup/restore docs.
- ✅ `background_jobs` worker with status/retries/timeouts/idempotency/progress;
  10 handlers; Celery activates only with `TD_BROKER_URL`.
- ✅ Vitest (7 files incl. RTL), Pytest (3 modules), Playwright 15-step E2E spec.
- ✅ Per-IP rate limiting (`lib/server/ratelimit.ts`, 13 routes + `app/ratelimit.py`),
  signed/expiring download URLs (`lib/server/signed.ts`), and a malware-scan
  adapter (`lib/server/scan.ts`, inactive unless `TD_MALWARE_SCAN_URL` is set).
- 🟡 The rate-limit bucket and scanner are in-process/optional; a gateway/Redis
  limit and a configured scanner are still recommended for production.
- 🟡 Playwright browsers were not installed in the local sandbox; the spec and
  CI job are ready.

## PHASE 16 — Seed & deployment ✅

- [x] 13 demo vehicles with the 3 required negative examples; `npm run seed:reset`; documented demo logins.
- [x] `Dockerfile` (web), `services/intelligence/Dockerfile`, `docker-compose.yml`
  (web/api/worker + Postgres/Redis under the `production` profile), `.dockerignore`.
- [x] `.env.example`, `.github/workflows/ci.yml`, health endpoints, migrations, seed command.
- [x] README, DEPLOYMENT, SECURITY, API_SPECIFICATION, TESTING, ER_DIAGRAM, RBAC_MATRIX, AGENTS, IMPLEMENTATION_REPORT.

---

## Verification baseline

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | see `IMPLEMENTATION_REPORT.md` (run in this pass) |
| `npm run build` | see `IMPLEMENTATION_REPORT.md` (isolated `NEXT_DIST_DIR=.next_verify`) |
| `npm test` | Vitest incl. RTL component suite |
| `npm run intel:test` | Pytest: **88 passed** — intelligence (incl. chat/blockchain), backend contract, security, adapter/model (incl. PaddleOCR) |
| Page smoke test | 48/48 pages 200 for the correct role |
| API smoke test | 40+ calls, correct 200/400/401/403/405/409/422 |
| Seeded vehicles | ✅ 13 (≥10) with 3 negative examples |
| GLB asset | ✅ `public/models/vehicles/trustdrive-sedan.glb` (Khronos CC BY 4.0 Executive Sedan) |
| 3D Inspection Studio | ✅ 4 Modes (Normal, Exploded, Damage, X-Ray), dynamic physics-tracked pins, right-docked collapsible inspector, Theater view |
| Python service | ✅ `services/intelligence/` |

## Demo credentials (seed data, password `demo1234`)

| Role | Email |
| --- | --- |
| Admin | `admin@trustdrive.dev` |
| Seller | `samarth@trustdrive.dev`, `aditya@trustdrive.dev` |
| Buyer | `rohan@trustdrive.dev`, `priya@trustdrive.dev`, `arjun@trustdrive.dev` |

## PHASE 17 — Live browser verification of the additive backend ✅

Built app (`NEXT_DIST_DIR=.next_verify npx next start -p 3200`) driven in Chromium
as the seller demo account, creating real records rather than reading seed data:

- [x] Evidence graph renders on seller and buyer vehicle pages (35 nodes).
- [x] Findings: `explained` finding shows its own status, is excluded from open
  conflicts (`2 open`), and no longer renders as "Unverified".
- [x] Damage editor writes real rows (4 → 7, HTTP 201), shows its confirmation,
  and the stored count/hotspots update after refresh.
- [x] Seller claims write real rows (HTTP 201), stay `pending`, and are chained.
- [x] Documents: parsed-field panels, near-duplicate review, and a real
  multipart replacement stored as v2 ("Supersedes an earlier version").
- [x] Buyer vehicle page: public evidence graph, cross-modal odometer card,
  2 conflicts, no private documents.
- [x] Reports: generate (`RPT-2026-0007`, ready), print view with statuses,
  signed PDF 200 (106 KB, `%PDF`, `X-Report-SHA256`), forged/anon token 403.
- [x] No browser console errors other than the demo 3D viewer's WebGL context loss.
- [ ] Not exercised this pass: inquiries, saved comparisons, notifications,
  admin screens, AI chat UI, configured malware scanner/provider checks,
  and Playwright E2E (browsers still not installed).
- [ ] Generated QR/verify links rendered `localhost:3000` while serving on 3200;
  the public app origin must be configured for deployed links.
