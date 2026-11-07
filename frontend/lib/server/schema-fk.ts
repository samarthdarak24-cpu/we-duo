// ---------------------------------------------------------------------------
// Foreign-key upgrade for the core (pre-existing) tables.
//
// The original schema declared `PRAGMA foreign_keys = ON` but never actually put
// FOREIGN KEY clauses on the core tables, so referential integrity was untyped.
// SQLite cannot ADD a table constraint in place, so each table is rebuilt with
// the 12-step procedure: capture its index/trigger DDL, create the constrained
// twin, copy the rows, drop the original, rename, then restore the satellite
// objects. Nothing is deleted and no column is re-typed.
//
// Runs once per table: a table that already reports foreign keys is skipped, so
// this is safe to call on every boot. A file-level backup is taken before the
// first rebuild so the operation is reversible.
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

interface Fk {
  cols: string[];
  table: string;
  /** Referenced column(s); single name or compound list. */
  ref: string | string[];
  action?: "CASCADE" | "SET NULL" | "RESTRICT";
}

const quoted = (names: string[]) => names.map((n) => `"${n}"`).join(", ");
const asList = (ref: string | string[]) => (Array.isArray(ref) ? ref : [ref]);

/** child table -> the referential edges it should have had from day one. */
const FK_SPEC: Record<string, Fk[]> = {
  vehicles: [{ cols: ["owner_id"], table: "users", ref: "id", action: "CASCADE" }],
  documents: [
    { cols: ["vehicle_id"], table: "vehicles", ref: "id", action: "CASCADE" },
    { cols: ["supersedes_id"], table: "documents", ref: "id", action: "SET NULL" },
  ],
  findings: [{ cols: ["vehicle_id"], table: "vehicles", ref: "id", action: "CASCADE" }],
  mileage_readings: [
    { cols: ["vehicle_id"], table: "vehicles", ref: "id", action: "CASCADE" },
    { cols: ["document_id"], table: "documents", ref: "id", action: "SET NULL" },
  ],
  pricing: [{ cols: ["vehicle_id"], table: "vehicles", ref: "id", action: "CASCADE" }],
  listings: [{ cols: ["vehicle_id"], table: "vehicles", ref: "id", action: "CASCADE" }],
  listing_images: [{ cols: ["listing_id"], table: "listings", ref: "id", action: "CASCADE" }],
  listing_events: [
    { cols: ["listing_id"], table: "listings", ref: "id", action: "CASCADE" },
    { cols: ["actor_id"], table: "users", ref: "id", action: "SET NULL" },
  ],
  inquiries: [
    { cols: ["listing_id"], table: "listings", ref: "id", action: "CASCADE" },
    { cols: ["buyer_id"], table: "users", ref: "id", action: "CASCADE" },
    { cols: ["seller_id"], table: "users", ref: "id", action: "CASCADE" },
  ],
  inquiry_messages: [
    { cols: ["inquiry_id"], table: "inquiries", ref: "id", action: "CASCADE" },
    { cols: ["sender_id"], table: "users", ref: "id", action: "CASCADE" },
  ],
  saved_vehicles: [
    { cols: ["buyer_id"], table: "users", ref: "id", action: "CASCADE" },
    { cols: ["listing_id"], table: "listings", ref: "id", action: "CASCADE" },
  ],
  saved_searches: [{ cols: ["buyer_id"], table: "users", ref: "id", action: "CASCADE" }],
  notifications: [{ cols: ["user_id"], table: "users", ref: "id", action: "CASCADE" }],
  activity: [{ cols: ["user_id"], table: "users", ref: "id", action: "CASCADE" }],
  history_events: [
    { cols: ["vehicle_id"], table: "vehicles", ref: "id", action: "CASCADE" },
    { cols: ["evidence_document_id"], table: "documents", ref: "id", action: "SET NULL" },
    { cols: ["created_by"], table: "users", ref: "id", action: "SET NULL" },
  ],
  damage_records: [
    { cols: ["vehicle_id"], table: "vehicles", ref: "id", action: "CASCADE" },
    { cols: ["repair_invoice_doc_id"], table: "documents", ref: "id", action: "SET NULL" },
    { cols: ["created_by"], table: "users", ref: "id", action: "SET NULL" },
  ],
  chain_records: [{ cols: ["vehicle_id"], table: "vehicles", ref: "id", action: "CASCADE" }],
  verification_runs: [{ cols: ["vehicle_id"], table: "vehicles", ref: "id", action: "CASCADE" }],
  verification_results: [
    { cols: ["run_id"], table: "verification_runs", ref: "id", action: "CASCADE" },
    { cols: ["vehicle_id"], table: "vehicles", ref: "id", action: "CASCADE" },
  ],
  reports: [
    { cols: ["vehicle_id"], table: "vehicles", ref: "id", action: "CASCADE" },
    { cols: ["requested_by"], table: "users", ref: "id", action: "CASCADE" },
  ],
  report_access: [{ cols: ["report_id"], table: "reports", ref: "id", action: "CASCADE" }],
  auth_tokens: [{ cols: ["user_id"], table: "users", ref: "id", action: "CASCADE" }],
  sessions: [{ cols: ["user_id"], table: "users", ref: "id", action: "CASCADE" }],
  theft_checks: [{ cols: ["vehicle_id"], table: "vehicles", ref: "id", action: "CASCADE" }],
  qr_tokens: [
    { cols: ["vehicle_id"], table: "vehicles", ref: "id", action: "CASCADE" },
    { cols: ["created_by"], table: "users", ref: "id", action: "SET NULL" },
  ],
  disputes: [
    { cols: ["finding_id"], table: "findings", ref: "id", action: "CASCADE" },
    { cols: ["seller_id"], table: "users", ref: "id", action: "CASCADE" },
    { cols: ["reviewed_by"], table: "users", ref: "id", action: "SET NULL" },
  ],
  audit_logs: [{ cols: ["actor_id"], table: "users", ref: "id", action: "SET NULL" }],
};

export interface FkUpgradeReport {
  rebuilt: string[];
  skipped: string[];
  violations: string[];
  backupPath: string | null;
}

/** Database files already snapshotted in this process. */
const snapshots = new Set<string>();

export function upgradeCoreForeignKeys(conn: DatabaseSync, dbFile: string): FkUpgradeReport {
  const report: FkUpgradeReport = { rebuilt: [], skipped: [], violations: [], backupPath: null };

  const pending = Object.keys(FK_SPEC).filter((t) => {
    if (!tableExists(conn, t)) return false;
    return (conn.prepare(`PRAGMA foreign_key_list(${t})`).all() as unknown[]).length === 0;
  });
  if (!pending.length) return report;

  // One reversible snapshot per database file per process: the rebuild itself is
  // idempotent (tables that already report FKs are skipped), so a restart that
  // still has pending work takes a fresh, smaller snapshot rather than piling up.
  if (fs.existsSync(dbFile) && !snapshots.has(dbFile)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    report.backupPath = path.join(path.dirname(dbFile), `pre-fk-${stamp}.db`);
    fs.copyFileSync(dbFile, report.backupPath);
    snapshots.add(dbFile);
  }

  conn.exec("PRAGMA foreign_keys = OFF;");
  // Views that alias a table become invalid the moment that table is dropped,
  // and SQLite then refuses the RENAME step with "error in view …". Capture and
  // recreate every view around the rebuild so the compatibility aliases survive.
  const views = conn
    .prepare("SELECT name, sql FROM sqlite_master WHERE type='view' AND sql IS NOT NULL")
    .all() as { name: string; sql: string }[];
  for (const view of views) {
    try {
      conn.exec(`DROP VIEW IF EXISTS "${view.name}"`);
    } catch (err) {
      report.skipped.push(`view ${view.name}: ${(err as Error).message}`);
    }
  }
  for (const table of pending) {
    try {
      rebuildWithForeignKeys(conn, table, FK_SPEC[table]);
      report.rebuilt.push(table);
    } catch (err) {
      report.skipped.push(`${table}: ${(err as Error).message}`);
    }
  }
  conn.exec("PRAGMA foreign_keys = ON;");
  for (const view of views) {
    try {
      conn.exec(view.sql);
    } catch (err) {
      report.skipped.push(`view ${view.name}: ${(err as Error).message}`);
    }
  }

  for (const row of conn.prepare("PRAGMA foreign_key_check").all() as { table: string; rowid: number }[]) {
    report.violations.push(`${row.table}#${row.rowid}`);
  }
  return report;
}

function tableExists(conn: DatabaseSync, name: string) {
  return !!conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(name);
}

function rebuildWithForeignKeys(conn: DatabaseSync, table: string, fks: Fk[]) {
  const ddlRow = conn.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name = ?").get(table) as
    | { sql: string }
    | undefined;
  if (!ddlRow?.sql) throw new Error("no CREATE statement");

  const satellites = conn
    .prepare("SELECT name, sql FROM sqlite_master WHERE type IN ('index','trigger') AND tbl_name = ? AND sql IS NOT NULL")
    .all(table) as { name: string; sql: string }[];

  const info = conn.prepare(`PRAGMA table_info(${table})`).all() as { name: string; notnull: number }[];
  const notNull = new Set(info.filter((c) => c.notnull).map((c) => c.name));
  const cols = info.map((c) => `"${c.name}"`);
  const temp = `${table}__fkupgrade`;

  conn.exec("BEGIN IMMEDIATE");
  try {
    conn.exec(createWithForeignKeys(ddlRow.sql, temp, fks, notNull));
    conn.exec(`INSERT INTO "${temp}" (${cols.join(", ")}) SELECT ${cols.join(", ")} FROM "${table}";`);
    conn.exec(`DROP TABLE "${table}";`);
    conn.exec(`ALTER TABLE "${temp}" RENAME TO "${table}";`);
    for (const s of satellites) {
      if (s.name.startsWith("sqlite_autoindex")) continue;
      conn.exec(s.sql);
    }
    conn.exec("COMMIT");
  } catch (err) {
    conn.exec("ROLLBACK");
    throw err;
  }
}

/**
 * Rewrites `CREATE TABLE x (cols…)` as `CREATE TABLE <alias> (cols…, FOREIGN KEY…)`.
 * `SET NULL` is downgraded to `RESTRICT` where the child column is NOT NULL, because
 * SQLite would otherwise accept the clause and only fail when a parent row is deleted.
 */
export function createWithForeignKeys(createSql: string, alias: string, fks: Fk[], notNull: Set<string> = new Set()): string {
  const open = createSql.indexOf("(");
  const close = createSql.lastIndexOf(")");
  if (open < 0 || close < 0) throw new Error("unrecognised CREATE TABLE");
  const body = createSql.slice(open + 1, close).replace(/\s+$/, "");
  const clauses = fks
    .map((f) => {
      const action = f.action === "SET NULL" && f.cols.some((c) => notNull.has(c)) ? "RESTRICT" : f.action;
      return `  FOREIGN KEY (${quoted(f.cols)}) REFERENCES "${f.table}" (${quoted(asList(f.ref))})${action ? ` ON DELETE ${action}` : ""}`;
    })
    .join(",\n");
  return `CREATE TABLE "${alias}" (\n${body},\n${clauses}\n)`;
}
