# TrustDrive — Role & Feature Matrix

> **Scope.** Maps every capability in the Seller/Buyer specification to the actual
> implementation in this repository. Status reflects a **live inspection of the
> code, schema and seeded database** performed 2026-11-05 (51 tables, shared
> `.data/trustdrive.db`, 12 published listings).
>
> Legend: ✅ implemented & wired · 🟡 implemented with a documented adapter/gap · ❌ not present

---

## 1. Shared backend (the spine both roles use)

Both portals read and write the **same relational database** (`.data/trustdrive.db`,
`SCHEMA_VERSION=3`, 51 tables). There is **no second "buyer" database** — a seller's
published listing is the exact row a buyer's explore query returns.

| Concern | Table(s) | Seller | Buyer | Notes |
| --- | --- | --- | --- | --- |
| Vehicle record | `vehicles` (`owner_id`) | create/edit/archive own | read published | `owner_id` FK → `users` |
| Listing | `listings` (`vehicle_id`) | full lifecycle | read published | statuses: `draft,published,paused,sold` |
| Documents | `documents` | upload/replace/reverify own | summary only | 83 rows seeded |
| History events | `history_events` | submit own, corrections append | read permitted | 28 rows seeded |
| Mileage | `mileage_readings` | submit own | read + analyze | 38 rows seeded |
| Damage | `damage_records`, `vehicle_inspections` | submit own | read + 3D hotspots | 14 rows seeded |
| Verification | `verification_*`, `verification_evidence` | run + resolve | read results | 30 evidence rows |
| AI findings | `findings`, `ai_analysis` | review + act | read risk | 15 rows seeded |
| Trust score | `trust_scores` | computed, shown | shown | 30 rows, versioned `trust-v2-multicategory` |
| Inquiries | `inquiries` (`buyer_id`,`seller_id`) | reply/negotiate own | create/read own | RBAC by `buyer_id`/`seller_id` |
| Saved / compare | `saved_vehicles`, `saved_comparisons` | — | save/compare | buyer-only |
| Integrity | `chain_records`, `audit_logs` | append | read | 125 + 48 rows; SHA-256 |

**Verified cross-role proof (live DB):** sellers `samarth@` and `weduo@` own vehicles
with **12 published listings**; the buyer explore query (`listings.status='published'`)
returns exactly those 12 rows. Inquiries are created by `role=buyer` accounts and route
to `seller_id` values `u-seller` / `u-seller2`.

---

## 2. Seller feature matrix

| # | Spec area | Capability | Status | Backend / API | Tables |
| --- | --- | --- | --- | --- | --- |
| A | Dashboard | 12 KPIs (vehicles, listings, pending verification, verified, alerts, inquiries, views, saves, verification chart, recent activity, doc completeness, listing readiness) | ✅ | `getSellerOverview` (`lib/server/data.ts`) | `vehicles`,`listings`,`documents`,`findings`,`inquiries` |
| B | My Vehicles | register, view, edit permitted, upload photos, update mileage, view status/history/damage/trust, archive | ✅ | `routers/vehicles.py`, Next `vehicles` API | `vehicles`,`vehicle_images` |
| B | Duplicate guard | reject duplicate VIN / registration | ✅ | validation in `vehicles.py` | `vehicles` (unique constraints) |
| C | Add Vehicle (6-step) | Basic → Photos → Docs → History → Verification → Listing | ✅ | `seller/add-vehicle` wizard | `vehicles`,`documents`,`history_events`,`mileage_readings` |
| D | Document Mgmt | upload, view extracted fields, OCR confidence, status, replace rejected, re-verify | 🟡 | `extract.py`, `documents/[id]/replace`, `reverify` | `documents` |
| E | Vehicle History | registration/ownership/service/repair/accident/insurance/mileage/inspection events | ✅ | `vehicles.py` history routes | `history_events` |
| E | History immutability | new records append, never overwrite verified | ✅ | append-only writes | `history_events`, `audit_logs` |
| F | Verification Center | identity, VIN, RC, insurance, PUC, doc/mileage consistency, duplicates, progress, failed, pending | ✅ | `verification` routes | `verification_runs`,`verification_evidence` |
| G | AI Fraud Analysis | rollback, abnormal jump, VIN mismatch, dup invoices, doc metadata, accident/repair, insurance, missing | ✅ | `detectors.py`, `explain.py` | `findings`,`ai_analysis` |
| H | 3D Inspection | rotate/zoom/views, select component, damage desc/photo/severity, repair, submit | ✅ | `Viewer3D.tsx`, `vehicles.py` | `damage_records` |
| I | Marketplace Listings | create/edit/preview/publish/pause/resume/sold, price, photos, description, share, views/saves | ✅ | `routers/marketplace.py` | `listings`,`listing_events`,`qr_tokens` |
| J | Listing Action Bar | add photos, upload docs, set price, description, preview, share, inquiries, download report | ✅ | `ListingActionBar.tsx` | `listings`,`reports` |
| K | Buyer Inquiries | receive, view profile, respond, negotiate, accept/reject inspection, schedule test drive, share docs, close | ✅ | `routers/inquiries.py` | `inquiries`,`inquiry_messages` |
| L | Reports & Settings | verification/doc/AI/damage/listing/inquiry/history reports; notifications, profile, password, privacy | ✅ | `routers/reports.py`, `users.py` | `reports`,`notifications`,`users` |

**Seller-only honest gaps (🟡):** binary document bytes are stored by the Next.js
upload route while the Python service registers metadata; OCR's PaddleOCR path is an
adapter that activates only when the library is installed (a PDF text layer is never
mislabelled as OCR).

---

## 3. Buyer feature matrix

| # | Spec area | Capability | Status | Backend / API | Tables |
| --- | --- | --- | --- | --- | --- |
| A | Dashboard | explored, saved, recent, pending reports, active inquiries, recommended, verified, alerts | ✅ | `getBuyerOverview` | `saved_vehicles`,`inquiries`,`vehicles` |
| B | Explore | browse published, search make/model, recent, recommended, verified, open detail | ✅ | `routers/marketplace.py` | `listings`,`vehicles`,`trust_scores` |
| C | Search & Filters | make/model/price/year/mileage/fuel/transmission/location/ownership/condition/verification/accident/trust + sort | ✅ | marketplace search API | `listings`,`vehicles` |
| D | Vehicle Details | gallery, specs, price, mileage, description, seller, history, doc verification, damage, AI, trust, contact, save, share | ✅ | `vehicle/[id]`, `reports.py` | all above |
| E | Verification | by TrustDrive ID / reg / VIN / QR; RC, insurance, PUC, mileage, accident, ownership, doc auth, blockchain | ✅ | `vehicles.py`, `verify/[token]` | `verification_evidence`,`chain_records` |
| F | History Timeline | chronological events (date/type/desc/mileage/source/evidence/status) | ✅ | `history` routes | `history_events` |
| G | 3D Damage | 360 rotate, zoom, presets, select component, view damage, repair, photos, status | ✅ | `Viewer3D.tsx` | `damage_records` |
| H | Mileage Analysis | chart, 1/3/5-yr filters, last verified vs latest, records, rollback/jump alerts | ✅ | `detectors.py` | `mileage_readings`,`findings` |
| I | AI Risk | mileage, dup invoices, doc manipulation, VIN, accident/repair, ownership, insurance, missing, hash mismatch | ✅ | `detectors.py`, `explain.py` | `findings`,`ai_analysis` |
| J | Theft Verification | current/previous theft, recovery, source, time | 🟡 | demo provider only | local DB only (no external registry) |
| K | Accident/Damage | accident records, dates, components, severity, repairs, claims, before/after, 3D hotspots | ✅ | `vehicles.py` | `accident_records`,`damage_records` |
| L | Market Price Est. | asking, market range, avg/low/high comparable, similar, diff | ✅ | `explain.py` pricing | `vehicles`,`listings` |
| M | Compare | 2–4 vehicles across 12 attributes | ✅ | `routers/marketplace.py` | `vehicles`,`trust_scores`,`saved_comparisons` |
| N | Saved / Wishlist | save/remove, shortlist, compare saved, price/availability track | ✅ | marketplace saved routes | `saved_vehicles`,`saved_comparisons` |
| O | Inquiries | contact, message, request photos/docs/inspection, test drive, negotiate, track, report | ✅ | `routers/inquiries.py` | `inquiries` |
| P | Reports (PDF) | downloadable vehicle report with full methodology | ✅ | `routers/reports.py` | `reports`,`report_access` |
| Q | Notifications/Profile | verification updates, responses, saved/price changes, security, privacy | ✅ | `routers/notifications.py`,`users.py` | `notifications`,`users` |

**Buyer-only honest gaps (🟡):** theft checks and external RTO/insurer data are
*demo providers* — when unconfigured they return `UNAVAILABLE` rather than asserting a
clean record; no external India vehicle registry is queried (MoRTH constraints).

---

## 4. Permission summary (Seller vs Buyer)

| Feature | Seller | Buyer |
| --- | --- | --- |
| Register vehicle | ✅ own | ❌ |
| Edit vehicle details | ✅ own | ❌ |
| Upload documents | ✅ own | ❌ |
| View document results | ✅ own | ✅ permitted summary |
| Submit service/mileage/damage history | ✅ own | ❌ |
| View history / damage | ✅ own | ✅ permitted |
| Use 3D viewer | ✅ | ✅ |
| Request verification | ✅ own | ✅ supported |
| Publish / edit listing | ✅ own | ❌ |
| Browse marketplace | ✅ | ✅ |
| Compare vehicles | ✅ | ✅ (2–4) |
| Save vehicles | ❌ | ✅ own list |
| Send inquiry | ❌ | ✅ |
| Respond to inquiry | ✅ own listing | ❌ |
| Download report | ✅ own | ✅ permitted scope |
| Generate / verify QR | ✅ own | ❌ / ✅ |

All permissions are enforced **server-side** (`lib/server/http.ts` for Next.js;
`app/security.py` for FastAPI). Direct API calls and direct URL navigation are both
checked; a non-owner inquiry read returns **403**. See `RBAC_MATRIX.md`.
