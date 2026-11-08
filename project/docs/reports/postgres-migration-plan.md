# PostgreSQL Migration Plan (Phase 13)

**Status:** NOT IMPLEMENTED at runtime · **Plan provided** · **Cloud provisioning: BLOCKED (no credentials)**

## Current state

- The app runs on a single SQLite database shared by both runtimes: `node:sqlite` (Next.js) and the Python `sqlite3` connector, both pointed at `REPO_ROOT/.data/trustdrive.db`.
- Shared-database design is deliberate and documented in `backend/app/config.py` (`REPO_ROOT / ".data" / "trustdrive.db"`) and `frontend/lib/server/db.ts` (`TD_DB_FILE` / `TD_DATA_DIR`).
- This works for a single-instance demo/pilot but does not meet production concurrency, backup, or horizontal-scaling needs.

## Target architecture

| Concern | Today (SQLite) | Target (PostgreSQL) |
|---------|----------------|---------------------|
| Concurrency | Single-writer | MVCC, many readers/writers |
| Backups | File copy | `pg_dump` / managed snapshots |
| Migrations | `CREATE TABLE IF NOT EXISTS` idempotent bootstrap | Versioned migrations (Alembic) |
| Cloud | Local file | Managed PG (Render Postgres / RDS) |
| Scale-out | Single node only | Read replicas possible |

## Migration steps

1. **Introduce an env-driven DB selector.** Add `TD_DB_ENGINE` (`sqlite|postgres`). Keep SQLite as the default so the app still boots with zero config.
2. **Abstract the data layer.**
   - Python: add a SQLAlchemy/psycopg engine selected by `TD_DATABASE_URL`; keep the existing `repository`/`db` helpers but route SQL through the engine. SQLite-specific `INSERT OR REPLACE` → dialect-aware upserts.
   - Node: `node:sqlite` is SQLite-only. For Postgres, use `pg` (already a common dep) behind the same `lib/server/db.ts` query surface. Audit every raw SQL string for SQLite-only syntax (`AUTOINCREMENT`, `?` placeholders, `json()` functions, `LIKE` case rules).
3. **Schema parity.** Dump the current SQLite schema (`scripts/dump-schema.mjs`) and produce an initial Alembic revision that creates the identical tables/columns/indexes in Postgres (note: SQLite is loosely typed; add explicit `NOT NULL`, `CHECK`, and `FK` constraints that SQLite skipped).
4. **Data migration.** One-off job: `sqlite3 .data/trustdrive.db .dump` → transform → `psql $TD_DATABASE_URL`. Validate row counts per table before cutover.
5. **Connection management.** Pool size, statement timeout, and `sslrootcert` for managed PG. Add a `/system/db` health probe distinct from app health.
6. **CI.** Add a `postgres` service container to the `web`/`intelligence` CI jobs and run the test suites against both engines in a matrix.

## Why this is BLOCKED for now

- **No PostgreSQL instance or credentials were provided.** Without `TD_DATABASE_URL`, the app cannot be pointed at a real PG, and no migration can be validated end-to-end.
- The plan above is complete and ready to execute the moment credentials exist. Until then, the runtime remains SQLite (clearly labelled, not misrepresented as production-grade).

## Recommended interim guardrail

If Postgres is provisioned but the migration is not yet validated, set `TD_DB_ENGINE=sqlite` and keep SQLite in production **with the persistent Render disk** (already configured in `render.yaml`) so data survives restarts. Do not claim Postgres is in use until step 4 passes a row-count audit.
