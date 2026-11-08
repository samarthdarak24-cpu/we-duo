# TrustDrive — Database ERD

> Full column-level detail: **`docs/ERD.md`** (generated from the live schema by
> `npm run schema:dump`). Relationship diagram: **`docs/ER_DIAGRAM.md`**.
> This file is the entity inventory and migration/retention summary.

## 1. Live state

- Engine: SQLite file `.data/trustdrive.db` (Postgres target via `TD_DB_URL`).
- `SCHEMA_VERSION = 3` (`PRAGMA user_version = 3`).
- **51 tables**, 30 explicit indexes, 11 immutability triggers, 5 canonical views.
- Foreign keys enforced; `PRAGMA foreign_keys=ON` in the web runtime.

## 2. Entities by domain

**Identity** — `users`, `seller_profiles`, `buyer_profiles`, `sessions`,
`auth_tokens`, `login_attempts`, `activity`.

**Vehicle** — `vehicles`, `vehicle_images`, `listings`, `listing_images`,
`listing_events`, `pricing`, `saved_vehicles`, `saved_searches`.

**Records & evidence** — `documents`, `history_events`, `mileage_readings`,
`accident_records`, `damage_records`, `vehicle_inspections`, `theft_checks`,
`verification_runs`, `verification_results`, `verification_evidence`,
`findings`, `disputes`.

**Intelligence** — `ai_analysis`, `trust_scores`, `agent_investigations`,
`human_review_queue`.

**Integrity** — `chain_records`.

**Communication** — `inquiries`, `inquiry_messages`, `notifications`,
`contact_messages`, `newsletter_subscribers`.

**Reports & sharing** — `reports`, `report_access`, `qr_tokens`.

**Operations** — `audit_logs`, `background_jobs`.

## 3. Relationship summary

```
users 1─1 seller_profiles / buyer_profiles
users 1─* vehicles (owner)           vehicles 1─1 listings
vehicles 1─* documents / images / history_events / mileage_readings /
            accident_records / damage_records / vehicle_inspections /
            theft_checks / findings / verification_runs / trust_scores /
            ai_analysis / agent_investigations / reports / qr_tokens / chain_records
verification_runs 1─* verification_results 1─* verification_evidence
listings 1─* inquiries 1─* inquiry_messages
listings 1─* saved_vehicles        users 1─* notifications / audit_logs
```

Five briefed names are exposed as views over historical tables:
`vehicle_documents`, `vehicle_listings`, `vehicle_history`, `mileage_records`,
`blockchain_records`.

## 4. Constraints that matter

- `vehicles.vin` and `vehicles.reg_no` are unique → duplicate registration is
  rejected at the database level (also validated in the service).
- `background_jobs.status` CHECK: `queued | running | succeeded | failed | dead |
  cancelled`.
- `human_review_queue.status` CHECK: `open | assigned | resolved | rejected`;
  `kind` CHECK: `low_confidence_ocr | conflicting_documents | suspicious_fraud |
  damage_validation | manual_correction`; `updated_at` NOT NULL.
- `ai_analysis.kind` CHECK: `odometer | document | damage | conflict | agent |
  market | inspection`; `review_state` CHECK: `auto | pending_review |
  confirmed | dismissed | corrected`.
- `agent_investigations.status` CHECK: `running | awaiting_review | completed |
  failed`.
- `accident_records.severity` / `repair_status` and
  `vehicle_inspections.status` have CHECK constraints.
- 11 immutability triggers block silent edits to verified history/chain rows.

## 5. Migrations

- The Next.js seed owns the base schema (`lib/server/db.ts`).
- Alembic (`services/intelligence/alembic/`) is **additive only**: revision
  `0001_intelligence_tables` creates intelligence tables only if absent and
  never drops or alters an existing table.
- Running `alembic upgrade head` on the shipped database is a no-op.
- `npm run schema:dump` regenerates `docs/ERD.md` from the live schema.

## 6. Retention and privacy

| Data | Retention / handling |
| --- | --- |
| Private documents | Stored under `.data/uploads`; never public; consent-gated |
| Report PDFs | Private; hash re-verified before download |
| Personal data | `users.email/phone`, KYC keys; not exposed by public QR/report endpoints |
| Audit logs | Append-only |
| Hash chain | Append-only; proves byte integrity, not document authenticity |
| Soft delete | `vehicles.archived_at`, `vehicle_images.deleted_at`, `users.deleted_at`, `documents.deleted_at`, `sessions.revoked_at`, `qr_tokens.revoked_at`; deleted users/documents are retained and excluded from reads/login |

A production deployment must define a formal retention schedule and encrypt
backups (they contain private documents).
