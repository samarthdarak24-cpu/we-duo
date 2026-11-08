# TrustDrive — Database Persistence Report

**Date:** 2026-11-07 · **Result: PASS** — every record created through the UI/API was found in the shared SQLite file and survived a browser refresh.
**Database:** `.data/trustdrive.db` · SQLite WAL · 55 tables · `PRAGMA user_version = 3`

## 1. Structural checks

| Check | Observed |
|---|---|
| `PRAGMA integrity_check` | `ok` |
| `PRAGMA foreign_key_check` | 0 violations |
| Journal mode | `wal` |
| Tables | 54 |
| Views | 5 (`blockchain_records`, `mileage_records`, `vehicle_documents`, `vehicle_history`, `vehicle_listings`) |
| Indexes | 101 |
| Shared with Next.js | `/health` → `shared_with_nextjs: true` |
| Taxonomy snapshot | `category_registry_snapshot` = `trust-v2-multicategory` |

## 2. UI → API → DB → refresh proof

Independent persistence phase (`qa/indep-results-retest2.json`, 7/7 PASS):

| Step | Observed |
|---|---|
| Seller session established | real login |
| Real wizard POST created a draft | HTTP 201 + vehicle id |
| Vehicle exists in SQLite | row read back |
| DB values match form submission | make/model/reg/VIN/year/fuel/price |
| Draft listing created with vehicle | `listings.vehicle_id` matches |
| Vehicle visible in My Vehicles after reload | rendered card |
| Record survives a full browser refresh | row still present |

## 3. Focused six-feature records (still present at final check)

| Entity | ID | Status | Persistence evidence |
|---|---|---|---|
| Vehicle | `v-1793989151346` | `published` | joined listing + documents + damage + inquiry |
| Listing | `l-1793989218038` | `published` | 3 `listing_images`, cover key set |
| RC document | `doc-1793989171647` | `verified` | 8 `document_extractions`, SHA-256, `verified_at` |
| Damage | `d-1793989213056` | `pending` | `zone_id=front_bumper`, component anchor |
| Mileage finding | `f-1793989179252` | `open` | `ODOMETER_ROLLBACK`, 52,000→41,000 km |
| AI run | `airun-574c5fe0-…` | `awaiting_review` | `langgraph-conditional`, 2 findings / 6 citations |
| Inquiry | `q-1793989445140` | `replied` | 2 `inquiry_messages` (buyer + seller) |
| Report | `rep-1793989494948` | `ready` | 45,266-byte real PDF, `pdf_hash` stored |

All eight rows were re-read after the run and were still present at the final database check.

## 4. Six-category persistence (broad run `LIVE-MW6DOO1A`)

| Category | Vehicle | RC type | OCR rows | Listing | Buyer detail |
|---|---|---|---|---|---|
| Petrol motorcycle | created | `rc_2w` | 9 | published | rendered |
| Petrol scooter | created | `rc_2w` | 9 | published | rendered |
| Electric scooter | created | `rc_2w` | 9 | published | rendered |
| Electric motorcycle | created | `rc_2w` | 9 | published | rendered |
| Petrol car | created | `rc` | 8 | published | rendered |
| Electric car | created | `rc` | 8 | published | rendered |

6 vehicles × 3 photos = 18 `listing_images`; 6 verified RC documents; 6 LangGraph runs; 6 published listings. Details in `DATABASE_VALIDATION_REPORT.md`.

## 5. Current snapshot (2026-11-07 20:56)

Counts naturally grow as QA runs execute; this is the final read-only snapshot, not a frozen baseline.

| Table | Rows | Table | Rows |
|---|---:|---|---:|
| `vehicles` | 122 | `listings` | 110 |
| `documents` | 254 | `document_extractions` | 1,200 |
| `damage_records` | 75 | `findings` | 40 |
| `inquiries` | 57 | `inquiry_messages` | 106 |
| `reports` | 33 | `trust_scores` | 73 |
| `ai_runs` | 41 | `agent_investigations` | 90 |
| `mileage_readings` | 158 | `battery_records` | 6 |
| `history_events` | 97 | `notifications` | 361 |
| `users` | 17 | `sessions` | 468 |
| `audit_logs` | 209 | `chain_records` | 652 |
| `saved_vehicles` | 3 | `saved_searches` | 2 |

Category distribution: `passenger_car` 90, `petrol_motorcycle` 12, `electric_car` 6, `electric_scooter` 6, `petrol_scooter` 5, `electric_motorcycle` 3. No planned-category rows.

## 6. Relationship and constraint checks

| Relationship | Verified |
|---|---|
| `vehicles.owner_id → users.id` | Seller ownership enforced |
| `listings.vehicle_id → vehicles.id` | One listing per vehicle in tested rows |
| `listing_images.listing_id → listings.id` | 3 photos per published test vehicle |
| `documents.vehicle_id → vehicles.id` | RC linked to correct vehicle |
| `document_extractions.document_id → documents.id` | 8–9 rows per RC |
| `damage_records.vehicle_id → vehicles.id` | Hotspot opens matching record |
| `inquiries.listing_id/buyer_id/seller_id` | Buyer + seller ownership joins |
| `inquiry_messages.inquiry_id` | 2 messages after reply |
| `reports.vehicle_id/requested_by` | Buyer report owner-scoped |
| `ai_runs` + `findings` + `evidence_nodes` | Investigation evidence chain |
| Unique `reg_no` / duplicate guard | 409, no duplicate row |
| Immutability triggers | 11 triggers protect verified history; corrections are audited |

## 7. Persistence verdict

**PASS.** There is no separate buyer database, no mock store and no in-memory-only feature path. Records created through real forms and real multipart uploads are committed to the shared SQLite file, linked by real foreign keys, and remain visible after a full page refresh.

**Known limitation:** the tests use the live seeded database; the multicategory test suite copies the DB to a temp file, but other suites may still touch the live seed. This is a test-isolation risk, not a runtime persistence failure. See `BUGS_FOUND.md`.
