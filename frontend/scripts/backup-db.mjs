#!/usr/bin/env node
// ---------------------------------------------------------------------------
// TrustDrive — SQLite backup tool.
//
// Uses SQLite's own `VACUUM INTO`, which writes a transactionally consistent
// snapshot of a live database without stopping the app and without relying on
// filesystem-level file copying (which can capture a torn WAL).
//
// Usage:
//   node scripts/backup-db.mjs [--db <file>] [--out <dir>] [--keep <n>]
//
// Exit codes: 0 = backup written and verified, 1 = failure.
// The source database is opened read-only and is never modified.
// ---------------------------------------------------------------------------
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

function parseArgs(argv) {
  const out = { db: null, out: null, keep: 7 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--db") out.db = argv[++i];
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--keep") out.keep = Number(argv[++i]);
  }
  return out;
}

function fail(msg) {
  console.error(`[backup] FAILED: ${msg}`);
  process.exitCode = 1;
}

const args = parseArgs(process.argv.slice(2));
const dbFile = path.resolve(args.db || process.env.TD_DB_FILE || ".data/trustdrive.db");
const outDir = path.resolve(args.out || process.env.TD_BACKUP_DIR || path.join(path.dirname(dbFile), "backups"));
const keep = Number.isFinite(args.keep) && args.keep > 0 ? Math.floor(args.keep) : 7;

if (!fs.existsSync(dbFile)) {
  fail(`database file not found: ${dbFile}`);
} else {
  try {
    fs.mkdirSync(outDir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const base = path.basename(dbFile).replace(/\.db$/i, "");
    const dest = path.join(outDir, `${base}-${stamp}.db`);
    if (fs.existsSync(dest)) fs.rmSync(dest);

    // Read-only handle: the backup can never write to the live database.
    const src = new DatabaseSync(dbFile, { readOnly: true });
    try {
      // VACUUM INTO takes a snapshot of the current committed state.
      src.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
    } finally {
      src.close();
    }

    // Verify the copy is a complete, uncorrupted database before we call it a backup.
    const check = new DatabaseSync(dest, { readOnly: true });
    let integrity = "unknown";
    let tables = 0;
    try {
      const row = check.prepare("PRAGMA integrity_check").get();
      integrity = String(Object.values(row ?? {})[0] ?? "unknown");
      const t = check
        .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .get();
      tables = Number(Object.values(t ?? { n: 0 })[0] ?? 0);
    } finally {
      check.close();
    }

    const bytes = fs.statSync(dest).size;
    const sha256 = createHash("sha256").update(fs.readFileSync(dest)).digest("hex");

    if (integrity !== "ok") {
      fail(`backup integrity check returned "${integrity}" (not ok) — treat ${dest} as suspect`);
    } else {
      // Retention: keep the newest `keep` snapshots, prune older ones.
      const snapshots = fs
        .readdirSync(outDir)
        .filter((f) => f.startsWith(`${base}-`) && f.endsWith(".db"))
        .sort()
        .reverse();
      let pruned = 0;
      for (const old of snapshots.slice(keep)) {
        try {
          fs.rmSync(path.join(outDir, old));
          pruned += 1;
        } catch {
          /* a locked snapshot is left in place rather than failing the backup */
        }
      }
      console.log(
        `[backup] OK source=${dbFile} dest=${dest} bytes=${bytes} tables=${tables} ` +
          `integrity=${integrity} sha256=${sha256} pruned=${pruned} kept=${Math.min(snapshots.length, keep)}`
      );
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}
