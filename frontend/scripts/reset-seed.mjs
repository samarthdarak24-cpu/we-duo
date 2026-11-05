// Reset the TrustDrive database to its seeded demo state.
//
// The demo credentials and demo vehicles live in code (lib/server/db.ts), so a
// reset means "remove the database file and let the next boot rebuild it".
// The old file is copied to .data/backups first — a reset is never a delete.
//
//   npm run seed:reset                 rebuild the database only
//   npm run seed:reset -- --uploads    also move .data/uploads aside
import fs from "node:fs";
import path from "node:path";

const withUploads = process.argv.includes("--uploads");
const dataDir = path.resolve(process.cwd(), "..", ".data");
const dbFile = path.join(dataDir, "trustdrive.db");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.join(dataDir, "backups");

if (fs.existsSync(dbFile)) {
  fs.mkdirSync(backupDir, { recursive: true });
  const target = path.join(backupDir, `trustdrive-${stamp}.db`);
  fs.copyFileSync(dbFile, target);
  console.log(`snapshot  -> ${path.relative(process.cwd(), target)}`);
} else {
  console.log("no existing database — nothing to snapshot");
}

let removed = 0;
for (const suffix of ["", "-wal", "-shm"]) {
  const f = dbFile + suffix;
  if (fs.existsSync(f)) {
    fs.rmSync(f);
    removed++;
  }
}
console.log(`removed ${removed} database file(s)`);

if (withUploads) {
  const uploads = path.join(dataDir, "uploads");
  if (fs.existsSync(uploads)) {
    const target = path.join(backupDir, `uploads-${stamp}`);
    fs.renameSync(uploads, target);
    console.log(`uploads   -> ${path.relative(process.cwd(), target)}`);
  }
}

// Touch the file so the next request opens an existing (empty) database and
// runs migrate + seed against it, instead of racing on file creation.
const { DatabaseSync } = await import("node:sqlite");
const conn = new DatabaseSync(dbFile);
conn.close();
console.log(`created ${path.relative(process.cwd(), dbFile)} — Next.js seeds it on the next request`);
