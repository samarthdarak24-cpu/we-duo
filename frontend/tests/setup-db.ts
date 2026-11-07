/**
 * Global Vitest setup: never let a unit/component suite touch the live SQLite
 * database (`.data/trustdrive.db`).
 *
 * `lib/server/db` caches its connection on `globalThis` for the lifetime of a
 * process, so the database path has to be redirected *before* any test imports
 * the module. Vitest runs `setupFiles` before the test file body, which makes
 * this the only reliable place to do it.
 *
 * By default every test file gets a brand-new, freshly seeded database. That is
 * deterministic and keeps the QA inventory out of unit assertions. Set
 * `TD_TEST_SNAPSHOT_LIVE=1` to run against a consistent `VACUUM INTO` snapshot
 * of the live database instead (useful when debugging a data-specific bug).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const REPO_ROOT = path.resolve(__dirname, "../..");
const LIVE_DB = path.join(REPO_ROOT, ".data", "trustdrive.db");
const RUN_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "trustdrive-vitest-"));
const TEST_DB = path.join(RUN_ROOT, "trustdrive.db");

function sqlString(value: string) {
  return `'${value.replace(/\\/g, "/").replace(/'/g, "''")}'`;
}

if (process.env.TD_TEST_SNAPSHOT_LIVE === "1" && fs.existsSync(LIVE_DB)) {
  try {
    const source = new DatabaseSync(LIVE_DB, { readOnly: true });
    try {
      source.exec(`VACUUM INTO ${sqlString(TEST_DB)}`);
    } finally {
      source.close();
    }
  } catch {
    // A locked/unreadable live DB must not make the test run fail before it
    // starts: fall through to a fresh seeded database.
    try {
      fs.rmSync(TEST_DB, { force: true });
    } catch {
      /* ignore */
    }
  }
}

process.env.TD_DB_FILE = TEST_DB;
process.env.TD_DATA_DIR = RUN_ROOT;
process.env.TD_UPLOAD_DIR = path.join(RUN_ROOT, "uploads");
// Tests must be deterministic: never call a real LLM from the unit suite.
process.env.TD_LLM_PROVIDER = "none";

// Remove this process's throwaway database when Vitest exits. Windows may keep
// the SQLite handle open until after the exit hook, so failures are ignored.
process.on("exit", () => {
  try {
    fs.rmSync(RUN_ROOT, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});
