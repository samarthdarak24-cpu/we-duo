# Database Schema

**51 tables · 30 indexes · 11 triggers · 5 views** — SQLite, owned by the
Next.js process (`lib/server/db.ts`, `SCHEMA_VERSION = 3`). The FastAPI service
reflects the live schema instead of re-declaring it.

## Identity & access

`users`, `sessions`, `auth_tokens`, `login_attempts`, `seller_profiles`,
`buyer_profiles`.

- `users` — id, name, role (`buyer|seller|admin`), email (unique), scrypt
  `password_hash`, KYC status, preferences JSON, `deleted_at`.
- `sessions` — refresh sessions; `revoked_at` on logout/soft delete.
- `login_attempts` — rate-limit/lockout evidence.

## Vehicles & marketplace

`vehicles`, `vehicle_images`, `vehicle_specs`, `listings`, `listing_images`,
`listing_events`, `battery_records`, `pricing`, `saved_vehicles`,
`saved_comparisons`, `saved_searches`.

- `vehicles` — VIN/reg unique, make/model/year, owner, `archived_at`,
  `vehicle_category_id TEXT` (FK to the canonical category taxonomy; legacy rows
  resolve to `passenger_car`). The car-only schema is preserved — no car column was
  removed or repurposed.
- `listings` — lifecycle (`draft → pending_review → published → paused → sold`),
  price, description, publish gate fields.
- `listing_events` — append-only lifecycle log.
- `vehicle_specs` — per-vehicle category-specific spec blob (`vehicle_id` PK,
  `category_id`, `specs` JSON, `spec_version`). No car form is ever used for a
  scooter; the specs blob holds only that category's declared fields.
- `battery_records` — electric profiles only (`id` PK, `vehicle_id`, `kind`,
  `soh_percent`, `capacity_kwh`, `serial`, `measured_at`, `source_document_id`,
  `status`, `notes`, `created_at`). Battery State of Health is **never** recorded
  without a source document; missing battery evidence is reported as unverified.

## Evidence & verification

`documents`, `document_extractions`, `verification_evidence`,
`verification_runs`, `verification_results`, `verification_cases`,
`chain_records`, `findings`, `human_review_queue`, `evidence_nodes`,
`evidence_edges`, `trust_scores`, `ai_analysis`, `ai_runs`,
`agent_investigations`, `disputes`, `category_registry_snapshot`.

- `documents` — type, private `file_key`, `sha256`, status, version,
  `supersedes_id`, `deleted_at`.
- `verification_runs` 1→N `verification_results` (check key, status, details).
- `verification_cases` links a vehicle, a run and a requester.
- `chain_records` — previous hash + record hash + `broken` flag (local chain).
- `findings` — code, severity, title, status (`open|cleared|disputed`), evidence.
- `evidence_nodes` / `evidence_edges` — the graph rendered by `EvidenceGraph`.
- `trust_scores` — additive score, contributions, coverage, version.
- `disputes` — seller explanation + evidence, resolved by admin.
- `category_registry_snapshot` — frozen copy of the canonical taxonomy
  (`spec_version`, `trust_version`, `matrix`) so a past investigation can be
  reproduced against the category rules in force at the time.

## History, mileage, damage

`history_events`, `mileage_readings`, `accident_records`, `damage_records`,
`vehicle_inspections`, `vehicle_claims`, `theft_checks`, `provider_checks`.

- `mileage_readings` — km + date + source; rollback detection compares ordered
  readings.
- `damage_records` — panel/zone, severity, source (`manual|yolo|inspector`),
  confidence, evidence; the multi-category migration added `component_id`,
  `damage_type`, `local_x`, `local_y`, `local_z`, `position_source` so a hotspot
  binds to a real component and a 3D-local position rather than a decorative marker.
- `vehicle_claims` — seller-declared owner count, accidents, service, odometer.
- `provider_checks` — provider, kind, status (`unavailable|completed|error`),
  queried fields, raw result. Unconfigured providers are never “clean”.

## Reports, inquiries, notifications

`reports`, `report_access`, `qr_tokens`, `inquiries`, `inquiry_messages`,
`notifications`, `contact_messages`, `newsletter_subscribers`.

- `reports` — generated PDF metadata + SHA-256; downloads are signed and expire.
- `qr_tokens` — signed public verification tokens; revocable.
- `inquiries` / `inquiry_messages` — buyer↔seller thread + status.
- `notifications` — per-user, `read` flag; offset and keyset pagination.

## Operations

`audit_logs`, `background_jobs`, `idempotency_keys`, `activity`.

- `audit_logs` — append-only (actor, action, entity, before/after, IP, UA).
- `background_jobs` — status, attempts, progress, idempotency key.
- `idempotency_keys` — duplicate-submit protection.

## Views and triggers

Five compatibility views expose the brief's entity names over existing tables:

`vehicle_documents`, `vehicle_listings`, `vehicle_history`, `mileage_records`,
`blockchain_records`.

Eleven triggers protect independently verified history and chain rows from
silent updates; corrections go through audited endpoints.

## Soft delete and retention

| Table | Mechanism |
| --- | --- |
| `users`, `documents` | `deleted_at`; hidden from reads/login; row retained |
| `vehicles` | `archived_at` |
| `vehicle_images` | `deleted_at` |
| `sessions`, `qr_tokens` | `revoked_at` |

## Migrations

- Next.js creates/upgrades the schema on first DB access (`migrate()` +
  additive `ensure*` functions).
- Alembic (`services/intelligence/alembic/`) is an **additive baseline** for the
  Python-owned tables. Run the web app once before `npm run intel:migrate`.
- No destructive migration runs automatically. Back up `.data/trustdrive.db`
  (or the Render disk) before upgrades.

## SQLite limits

Single-writer. One web instance per database file. For multiple instances or
managed Postgres, the Next.js data layer must be migrated first (see
`SETUP_AND_DEPLOYMENT.md` §J).
