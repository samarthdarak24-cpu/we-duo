# TrustDrive — Buyer Workflow

End-to-end journey of a **Buyer** discovering, investigating and contacting a Seller.
Every read goes against the **same shared `.data/trustdrive.db`** the Seller wrote to —
there is no separate buyer store.

---

## 0. Account & session
- `POST /api/v1/auth/register` (`role='buyer'`) → `users` row.
- `POST /api/v1/auth/login` → session; `portalUser("buyer")` resolves the buyer in server components.
- Tables: `users`, `sessions`, `auth_tokens`.

## 1. Explore & search
- Pages: `/buyer/explore`, `/marketplace`, `/buyer/search`.
- Reads **published** listings only: `SELECT … FROM listings JOIN vehicles WHERE listings.status='published'`.
  (Live proof: this returns the 12 listings owned by sellers `samarth@`/`weduo@`.)
- Filters (backend paginated/sorted): manufacturer, model, min/max price, year, mileage,
  fuel, transmission, location, ownership, condition, verification status, accident
  availability, trust-score range.
- Sorting: lowest/highest price, newest, lowest mileage, highest trust, recently verified.
- Vehicle cards show photo, model, year, price, mileage, fuel, transmission, location,
  seller info, verification status, evidence-based trust score.
- API: `routers/marketplace.py` (`/api/v1/marketplace/search`, `/marketplace/listings`).

## 2. Vehicle details & verification
- Page `/vehicle/[id]` (public-ish, auth-gated for private data) + `/buyer/verification`.
- Investigates by TrustDrive Vehicle ID, registration (permitted), VIN (permitted), or QR.
- Surfaces: vehicle identity, RC, insurance, PUC, mileage consistency, accident records,
  service history, ownership (permitted), document authenticity, blockchain integrity.
- Statuses: `VERIFIED | PENDING | SUSPICIOUS | UNVERIFIED | UNAVAILABLE`.
  **Missing records are shown as UNAVAILABLE, never as "clean".**
- API: `routers/vehicles.py`, `verify/[token]`. Tables: `verification_evidence`, `chain_records`.

## 3. History timeline & mileage
- `/buyer/history`: chronological `history_events` (date, type, description, mileage, source,
  evidence, verification status).
- `/buyer/[id]` mileage panel: historical chart, 1/3/5-year filters, last verified vs latest
  reading, records, rollback/jump alerts with evidence and explanation.
- API: `detectors.py`. Tables: `history_events`, `mileage_readings`, `findings`.

## 4. AI risk analysis
- `/buyer/risk`: grounded investigation outputs (no hardcoded answers) covering mileage
  inconsistency, duplicate invoices, document manipulation, VIN mismatch, accident/repair
  conflicts, ownership/insurance inconsistencies, missing history, blockchain hash mismatch.
- Each result: evidence, explanation, severity, recommended action.
- Tables: `findings`, `ai_analysis`.

## 5. 3D damage inspection
- `/inspection` (or vehicle page): rotate 360°, zoom, front/rear/left/right/top presets,
  select a real component mesh → fetch its **actual** `damage_records` from the backend.
- View repair history, inspection photos, repair status, verification status. No random or
  fake hotspots — markers map to real component IDs and backend rows.
- Tables: `damage_records`, `vehicle_inspections`.

## 6. Theft verification
- Shows current/previous theft, recovery status, source, verification time.
- If authorized theft data is unavailable, shows **UNAVAILABLE** (demo provider; no external
  RTO/insurer registry is queried — MoRTH constraints). Never asserts "not stolen".

## 7. Accident & damage history
- Accident records, dates, affected components, severity, repair records, insurance claims,
  before/after photos, 3D hotspots, inspection evidence.
- Tables: `accident_records`, `damage_records`.

## 8. Market price estimation
- Asking price vs estimated market range, average/low/high comparable, similar listings, diff.
- Uses actual comparable data; estimates are explicitly labelled with limitations.
- API: `explain.py` pricing helper.

## 9. Compare vehicles
- `/buyer/compare`: compare 2–4 vehicles across price, year, mileage, fuel, transmission,
  ownership, service history, accident records, document verification, trust score, damage, market price.
- API: `routers/marketplace.py`. Tables: `vehicles`, `trust_scores`, `saved_comparisons`.

## 10. Saved vehicles & wishlist
- `/buyer/saved`: save/remove, shortlists (`list_name`), compare saved, track price changes,
  track listing availability.
- Tables: `saved_vehicles`, `saved_comparisons`, `saved_searches`.

## 11. Inquiries (contact seller)
- `/buyer/inquiries`: contact seller, send messages, request photos/documents/inspection,
  schedule test drive, negotiate, track status, report suspicious listing.
- `POST /api/v1/inquiries` writes an `inquiries` row with **both** `buyer_id` and
  `seller_id`; only the owning buyer (and the listing's seller) can read it — 403 otherwise.
- Tables: `inquiries`, `inquiry_messages`, `notifications`.
- **This is the exact mirror of `SELLER_WORKFLOW.md` §8** — one shared record, two role views.

## 12. Reports (PDF) & notifications
- `/buyer/reports`: downloadable PDF with vehicle details, trust-score methodology, document
  verification, mileage analysis, accident history, damage inspection, theft info, insurance,
  AI findings, blockchain integrity, sources and limitations.
- `/buyer/notifications`: verification updates, seller responses, saved/price changes,
  inspection updates, sold status, security; privacy settings in `/buyer/settings`.

---

### How the Buyer sees the Seller's work (single source of truth)
| Seller action | Buyer-visible effect (same DB row) |
| --- | --- |
| Publish listing (`published`) | Appears in explore/search (12 live) |
| Update views/saves via buyer activity | Seller's "Listing views / Saved by buyers" KPIs |
| Submit damage record | Buyer's 3D hotspots + accident history |
| Run verification | Buyer's verification summary + trust score |
| Send inquiry reply | Buyer's inquiry thread updates |
| Mark sold (`sold`) | Listing drops out of marketplace; history retained |
