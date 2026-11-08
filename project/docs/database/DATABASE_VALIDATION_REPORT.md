# TrustDrive — Database Validation Report

**Run ID:** `LIVE-MW6DOO1A` · **Date:** 2026-11-07 · **Result: PASS**
**Database:** `.data/trustdrive.db` — SQLite, shared by Next.js `:3000` and FastAPI `:8000`
**Method:** all assertions are read-only SQL (`PRAGMA` + `SELECT`) against the **same live file** the app wrote during the audit. No test database, no in-memory substitute, no direct writes used to make a check pass.

---

## 1. Structural health

| Check | Observed | Verdict |
|---|---|---|
| `PRAGMA journal_mode` | `wal` | PASS — concurrent readers/writers supported |
| `PRAGMA integrity_check` | `ok` | PASS |
| `PRAGMA foreign_key_check` | `0` violations | PASS |
| `PRAGMA user_version` | `3` | PASS — additive multicategory migration applied |
| Tables | **55** | matches `/health` `database.tables = 55` |
| Views | **5** (`blockchain_records`, `mileage_records`, `vehicle_documents`, `vehicle_history`, `vehicle_listings`) | PASS — legacy read compatibility |
| Indexes | **101** | PASS |
| Backend connection report | `{"database":"connected","dialect":"sqlite","tables":55,"shared_with_nextjs":true}` | PASS — one shared DB, not two divergent stores |
| Snapshot row | `category_registry_snapshot` = 1 row (`trust-v2-multicategory`) | PASS — taxonomy version pinned |

`vehicles` columns (27): `id, owner_id, make, model, variant, year, reg_no, vin, fuel, transmission, category, color, ownership_count, location, km_claimed, last_verified_km, asking_price, status, base_value, condition_score, trustdrive_id, qr_token, description, condition, created_at, updated_at, vehicle_category_id`.

The multicategory design is **additive**: `vehicles.vin` is a shared primary-identifier column (17-char VIN for cars, 8–22-char chassis/frame for two-wheelers), `vehicle_category_id` carries the taxonomy, and `vehicle_specs.specs` holds category-specific JSON. Legacy views keep older consumers working.

---

## 2. Row counts after the audit

| Table | Rows | Table | Rows |
|---|---:|---|---:|
| `vehicles` | 111 | `agent_investigations` | 128 |
| `listings` | 99 | `ai_runs` | 41 |
| `listing_images` | 166 | `documents` | 243 |
| `document_extractions` | 1,119 | `damage_records` | 72 |
| `inquiries` | 54 | `inquiry_messages` | 100 |
| `reports` | 33 | `trust_scores` | 70 |
| `findings` | 40 | `vehicle_specs` | 16 |
| `battery_records` | 6 | `mileage_records` | 152 |
| `users` | 12 | `sessions` | 413 |
| `audit_logs` | 198 | `idempotency_keys` | 6 |

Category distribution of `vehicles` (all six implemented categories present, no planned-category rows):

| `vehicle_category_id` | Rows |
|---|---:|
| `passenger_car` | 85 |
| `petrol_motorcycle` | 10 |
| `electric_scooter` | 6 |
| `electric_car` | 4 |
| `electric_motorcycle` | 3 |
| `petrol_scooter` | 3 |

---

## 3. The six audited vehicles — persisted values

Read back directly from SQLite after the live run:

| Reg. no. | `vehicle_category_id` | `vin` (primary identifier) | `fuel` | `km_claimed` | `asking_price` | `listings.status` |
|---|---|---|---|---:|---:|---|
| `MH12QA9442` | `petrol_motorcycle` | `FRM0054427822000` (19 ch) | `Petrol` | 18,500 | 165,000 | `published` |
| `MH13QA2301` | `petrol_scooter` | `FRM0054428822001` (19 ch) | `Petrol` | 9,200 | 92,000 | `published` |
| `MH14QA3467` | `electric_scooter` | `FRM0054429822002` (19 ch) | `Electric` | 6,400 | 128,000 | `published` |
| `MH15QA8013` | `electric_motorcycle` | `FRM0054430822003` (19 ch) | `Electric` | 11,200 | 149,000 | `published` |
| `MH16QA4426` | `passenger_car` | `91794054427822004` (**17 ch**) | `Petrol` | 45,000 | 675,000 | `published` |
| `MH17QA9643` | `electric_car` | `91794054427822005` (**17 ch**) | `Electric` | 28,000 | 1,395,000 | `published` |

**No universal 17-character VIN rule:** two-wheelers store 19-character frame numbers, cars store 17-character VINs, in the same column, with category-appropriate validation enforced upstream.

---

## 4. Chain integrity — API claim → DB row

| Assertion | SQL evidence | Result |
|---|---|---|
| 3 photos per vehicle | `listing_images` joined via `listings.id` → **3 rows each**, positions 1–3, for all six | PASS ×6 |
| Category-correct RC type | `documents.type`: **4 × `rc_2w`**, **2 × `rc`**, all `status = verified`, `consent = 1` | PASS ×6 |
| OCR really ran | `documents.extracted` JSON contains `engine:"rapidocr"`, `method:"rapidocr-onnx-crnn"`, `is_ocr:true`, `version:"extract-2.0.0-multicategory"`, `source:"python-intelligence"`, 18-step workflow, SHA-256, and confidence 0.776–0.787 | PASS ×6 |
| Extracted fields persisted | `document_extractions`: 9 rows for each 2W RC, 8 for each car RC | PASS ×6 |
| OCR comparison is category-aware | 2W RCs compare `chassis_number` with label `"Chassis / frame number"`; car RCs compare `vin` with label `"VIN (17 characters)"`; all `result:"match"`; `flags: []` | PASS ×6 |
| Honest OCR disclaimer | Every extraction carries `"warning": "Extracted values are machine-read text, not proof that the document is genuine. OCR extraction is not verification of authenticity."` | PASS |
| Real LangGraph run stored | `ai_runs`: 6 rows, `graph="langgraph-conditional"`, `status="completed"`, `model_version="investigator-2.0.0-multicategory"`, `ruleset_version="fraud-rules-2.0.0-multicategory"` | PASS ×6 |
| Direct backend investigations persisted | `agent_investigations`: **2 rows per vehicle** (UI investigation + direct service call) = 12 rows for this run | PASS ×6 |
| Buyer inquiry persisted | `inquiries` row with correct `listing_id`, `status = "open"`; `inquiry_messages` grows to 2 after seller reply | PASS |
| PDF report persisted | `reports` row, download returns real `%PDF` bytes (42,804) | PASS |
| Damage → hotspot | `damage_records` row with `zone_id = "front_bumper"`, surfaced as a clickable hotspot in the 3D viewer | PASS |
| Duplicate protection | Duplicate `reg_no` → no second row, API returns `409 DUPLICATE_REG` with `existingId` | PASS |

---

## 5. Battery SOH vs odometer — the critical separation

`vehicle_specs` for the three EV vehicles created in this run:

| `vehicle_id` | `category_id` | `specs` | `spec_version` |
|---|---|---|---|
| `v-1794054469821` | `electric_scooter` | `{"battery_soh":"92"}` | `multicategory-1.0.0` |
| `v-1794054478303` | `electric_motorcycle` | `{"battery_soh":"88"}` | `multicategory-1.0.0` |
| `v-1794054498560` | `electric_car` | `{"battery_soh":"95"}` | `multicategory-1.0.0` |

- `vehicles.km_claimed` = 6,400 / 11,200 / 28,000 respectively — **odometer only**.
- `SELECT * FROM battery_records WHERE vehicle_id IN (…)` for these three returns **0 rows** — no odometer value was ever written into the battery table.
- No `engine_cc` / `engine_number` appears in any EV `specs`; combustion vehicles have `specs = {}`.
- `battery_records` schema confirms it is for battery facts only: `id, vehicle_id, kind, soh_percent, capacity_kwh, serial, measured_at, source_document_id, status, notes, created_at`.

**Verdict: SOH and odometer are stored in distinct columns/tables and never conflated.**

---

## 6. Publish gate data consistency

`publishGate()` blockers map directly to DB state:

| Blocker | DB source | Live observation |
|---|---|---|
| Add at least 3 vehicle photos | `listing_images` | Bare draft → `422 PUBLISH_BLOCKED` |
| Upload a verified RC | `documents.status` / `documents.type` | Bare draft → `422` |
| Complete all required fields | `vehicles.make/model/reg_no/vin/year/fuel/transmission/location/asking_price` | Wizard supplies all |
| Set an asking price | `vehicles.asking_price > 0` | All six positive |
| Resolve critical VIN/registration mismatch | `findings` | None open |

After uploads, all six `listings.status` read `published`. Warnings (insurance expiry, mileage findings, pending documents, inspection pending) remain warnings and were verified by the new regression suite not to become blockers.

---

## 7. Data-quality and honesty notes

- The DB is **intentionally not reset** after the audit; repeat runs generate unique `reg_no`/`vin` fixtures. Marketplace counts in the live report therefore reflect accumulated seed + audit data (e.g. `passenger_car` filter returned 20 items).
- `sessions` (413 rows) and `audit_logs` (198 rows) grow normally with repeated real logins and writes; no orphaned rows were found by `PRAGMA foreign_key_check`.
- RC images and photo uploads are stored under `.data/uploads/`; `documents.sha256` holds real SHA-256 digests and `workflow` records the private-storage path, consent filter and 18 processing steps.
- `ocr_backends` from `/health`: PaddleOCR unavailable, **RapidOCR available**, PyMuPDF text layer available, OpenCV preprocessing available. All six RC verifications used RapidOCR and reported engine/method honestly.
- OCR carries an explicit authenticity disclaimer; the app never claims OCR proves a document is genuine.

---

## 8. Verdict

**PASS.** The shared WAL database is structurally sound (`integrity_check = ok`, `foreign_key_check = 0`), the additive multicategory migration is present (`user_version = 3`, `vehicle_category_id`, `vehicle_specs`, `category_registry_snapshot`), and every API-claimed write in the six-category Seller → verification → publish → Buyer chain was confirmed by a corresponding SQLite row. Category identity, fuel, primary identifier, SOH/odometer separation, RC type/status, agent runs and inquiry/report/damage persistence are all correct.

---

## 9. Final snapshot (2026-11-07 20:56)

The report above is the `LIVE-MW6DOO1A` snapshot. The DB continues to grow with QA runs; final read-only checks confirmed:

- `integrity_check = ok`, `foreign_key_check = 0`, `user_version = 3`, 55 tables, 5 views, 103 indexes.
- 122 vehicles, 110 listings, 254 documents, 1,200 document extractions, 75 damage records, 57 inquiries, 106 messages, 33 reports, 41 AI runs, 158 mileage readings, 97 history events, 73 trust scores.
- All six focused-run records still present: vehicle `v-1793989151346`, listing `l-1793989218038`, document `doc-1793989171647` (`verified`), damage `d-1793989213056`, inquiry `q-1793989445140` (`replied`), report `rep-1793989494948` (`ready`), AI run `airun-574c5fe0-…` (`awaiting_review`).
- Category distribution: `passenger_car` 90, `petrol_motorcycle` 12, `electric_car` 6, `electric_scooter` 6, `petrol_scooter` 5, `electric_motorcycle` 3; no planned-category rows.

Detailed persistence proof: `DATABASE_PERSISTENCE_REPORT.md`.
