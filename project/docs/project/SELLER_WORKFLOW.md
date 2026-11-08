# TrustDrive — Seller Workflow

End-to-end journey of a **Seller** from account creation to a sold vehicle, with the
real endpoints, tables and rules it touches. Every write lands in the **shared
`.data/trustdrive.db`** that Buyers also read.

> Auth: JWT (HS256) + scrypt password hashes, httpOnly cookies. The same user table and
> tokens are used by both the Next.js app and the FastAPI service.

---

## 0. Account & session
- `POST /api/v1/auth/register` (or `/api/backend/auth/register`) → creates a `users` row (`role='seller'`).
- `POST /api/v1/auth/login` → sets session; `portalUser("seller")` resolves the seller in every server component.
- Tables: `users`, `sessions`, `auth_tokens`.

## 1. Register a vehicle (duplicate-guarded)
- Page: `/seller/add-vehicle` — **6-step guided onboarding**:
  1. **Basic Details** — registration no., VIN, make, model, variant, year, fuel, transmission.
  2. **Photos** — front/rear/left/right/interior/dashboard/odometer/existing-damage.
  3. **Documents** — RC, insurance, PUC, service & repair invoices, inspection records.
  4. **History** — mileage, service, accident, repair, ownership.
  5. **Verification** — OCR, VIN match, registration match, duplicate check, doc validation, mileage consistency, AI anomaly.
  6. **Listing** — asking price, description, photos, location, preview, publish when requirements met.
- Validation rejects duplicate **VIN** or **registration number** (DB unique constraints on `vehicles`).
- Tables: `vehicles` (`owner_id`, `trustdrive_id`, `qr_token`), `vehicle_images`, `documents`.
- API: `routers/vehicles.py` (Next `lib/server/data.ts` `createVehicle`).

## 2. Documents & OCR
- Upload via `POST /api/v1/documents` (multipart). Bytes stored privately; the Python
  service (`extract.py`) runs the 18-step pipeline: validation → SHA-256 → OCR (PaddleOCR
  adapter when installed, else PDF text layer, never mislabelled) → field extraction →
  normalisation → DB cross-check → duplicate detection → confidence scoring.
- Statuses: `VERIFIED | PENDING | SUSPICIOUS | UNVERIFIED | NEEDS_REVIEW`.
- A seller **cannot silently replace** an independently verified document; replacements
  create a new version ("Supersedes an earlier version") and re-enter review.
- Tables: `documents`, `background_jobs`, `audit_logs`.

## 3. Vehicle history & mileage
- Submit events through `/seller/history`: registration, ownership, service, repair,
  accident, insurance claims, mileage readings, inspection reports.
- Each event stores **date, source, evidence, verification status**. New seller-submitted
  records **append** and never overwrite independently verified history (immutability triggers).
- Tables: `history_events`, `mileage_readings`.

## 4. Verification Center
- Page `/seller/verification` shows: vehicle identity, VIN match, RC/insurance/PUC status,
  document & mileage consistency, duplicate records, progress, failed checks, pending review.
- Seller can resolve issues and submit additional evidence; runs persist to
  `verification_runs`, `verification_results`, `verification_evidence`.
- AI findings (Step 5) surface here and on `/seller/fraud`.

## 5. AI fraud analysis (seller alerts)
- `detectors.py` flags: mileage rollback, abnormal jumps, VIN mismatch, duplicate invoices,
  suspicious document metadata, accident/repair inconsistencies, insurance inconsistencies,
  missing records.
- Each finding carries **problem, severity, evidence, explanation, detection method,
  recommended action** — an investigation signal, never automatic proof of fraud.
- Tables: `findings`, `ai_analysis`, `trust_scores`.

## 6. 3D inspection (damage)
- Page `/seller/vehicles/[id]` → `Viewer3D.tsx` (real GLB `public/models/vehicles/trustdrive-sedan.glb`).
- Rotate/zoom/preset views; click a real mesh → canonical component ID → add damage
  description, photo, severity, repair detail → `POST` writes a `damage_records` row mapped
  to that component. Markers always map to real backend damage records.
- Tables: `damage_records`, `vehicle_inspections`.

## 7. Marketplace listing lifecycle
- Page `/seller/listings` + `/seller/listings/[id]`. States: `DRAFT → PENDING_REVIEW →
  PUBLISHED → PAUSED → SOLD`.
- The **8-action Listing Features bar** (`ListingActionBar.tsx`): Add Photos, Upload
  Documents, Set Price, Write Description, Preview, Share, Track Inquiries, Download Report —
  each hits a real endpoint or workspace callback.
- A listing **cannot misrepresent verification status**; publish is gated by
  `buildPublishGate()` (doc completeness + verification readiness).
- Views/saves counters update from buyer activity on the same `listings` row.
- Tables: `listings`, `listing_events`, `qr_tokens`.

## 8. Buyer inquiries
- Incoming inquiries appear on `/seller/inquiries`. Seller can: view buyer profile
  (privacy-scoped), respond, negotiate price, accept/reject inspection requests, schedule
  test drives, share permitted documents, close.
- Tables: `inquiries` (`buyer_id`,`seller_id`), `inquiry_messages`, `notifications`.
- The buyer side of this exact exchange is the mirror in `BUYER_WORKFLOW.md` §O.

## 9. Reports & settings
- `/seller/reports` generates verification / document / AI / damage / listing / inquiry /
  history PDFs (`routers/reports.py`), signed download URLs (`lib/server/signed.ts`).
- Settings: profile, password, 2FA/TOTP, KYC, privacy, notifications.

## 10. Mark sold (preserve history)
- `PATCH /api/v1/seller/listings/:id/sold` (or marketplace state transition) sets
  `listings.status='sold'`. The vehicle and **all history/damage/verification records are
  retained** — the listing simply stops accepting new buyers; nothing is deleted.

---

### Cross-role hand-off
Once a listing is `PUBLISHED`, a Buyer's explore/search query reads that **same row**
(see `BUYER_WORKFLOW.md`). No data is copied between roles; the shared backend is the
single source of truth. RBAC guarantees a seller can only act on `vehicles.owner_id = self`.
