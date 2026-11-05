# TrustDrive — Database Test Report

**Date:** 2026-11-05 · **DB:** `.data/trustdrive.db` (SQLite, 51 tables, `SCHEMA_VERSION=3`)
**Method:** Live SQLite queries + cross-checked against the FastAPI HTTP layer.

## Result: PASS (core integrity verified)

### Tables & shape
- 51 tables present (verified via `/health` → `"tables":51` and `PRAGMA`).
- All documented core entities exist: `users, vehicles, listings, inquiries, inquiry_messages,
  documents, mileage_readings, findings, history_events, damage_records, vehicle_inspections,
  verification_evidence, verification_runs, verification_results, trust_scores, ai_analysis,
  chain_records, notifications, audit_logs, saved_vehicles, saved_searches, saved_comparisons,
  background_jobs, human_review_queue, agent_investigations` (5 historical entities are views).
- 30 indexes + 11 immutability triggers (append-only integrity tables).

### Row counts (evidence-backed)
| Table | Rows | Source |
|---|---|---|
| users | 7 (1 admin, 2 seller, 4 buyer) | FastAPI login + SQL |
| vehicles | 17 owned by `u-seller` (others by `u-seller2`) | `WHERE owner_id` vs `GET /vehicles/mine` → 17 == 17 |
| listings | 12 `published` (15 total) | `WHERE status='published'` == `GET /marketplace/listings` → 12 == 12 |
| documents | 83 | prior live DB dump |
| mileage_readings | 38 | prior live DB dump |
| findings | 15 | prior live DB dump |
| history_events | 28 | prior live DB dump |
| damage_records | 14 | prior live DB dump |
| verification_evidence | 30 | prior live DB dump |
| trust_scores | 30 | prior live DB dump |
| saved_vehicles | 3 | prior live DB dump |
| chain_records | 125 | prior live DB dump (SHA-256 chain) |
| notifications | 19 | prior live DB dump |
| audit_logs | 48 | prior live DB dump |

### Integrity checks executed
- **One shared database, two runtimes:** Next.js and FastAPI both open `.data/trustdrive.db`
  (`/health` reports `"shared_with_nextjs":true`). No split buyer DB exists.
- **Cross-role spine:** the buyer `marketplace/listings` result set is the *same* published rows a
  seller owns (12 == 12). Proven by direct SQL vs live API.
- **Ownership:** `vehicles.owner_id` correctly scopes seller views; a buyer calling
  `/vehicles/mine` sees only the published marketplace view, never another seller's drafts
  (leaked=0 in live proof).
- **Foreign keys / relationships:** `inquiries` carry `buyer_id`+`seller_id`; `documents`/
  `damage_records`/`mileage_readings` reference `vehicle_id`; listing↔vehicle linkage intact.
- **Soft-delete parity:** `users`/`documents` have `deleted_at`; reads, login and sessions exclude
  deleted rows.
- **Audit logs persist** for auth and mutations (`auth.login`, `vehicle.created`, …).

### Hardcoded-data check
`getSellerOverview` and all listing/explore queries are computed from these real rows. No fabricated
dashboard counters were observed.

### Findings / risks
- **Tests mutate the real DB.** Vitest/Pytest resolve `TD_DB_FILE` to the repo-root `.data/trustdrive.db`
  rather than an isolated test DB. This is a data-safety risk and should be changed to a temp copy
  before CI runs destructive scenarios (see BUGS_FOUND.md #2).
- Demo data is labelled `demo` and negative examples (rollback mileage, duplicate-doc hash, VIN
  mismatch) are seeded on purpose.
