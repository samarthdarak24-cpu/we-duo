import { DatabaseSync } from "node:sqlite";
import path from "node:path";
// Run via the root `npm run schema:dump` wrapper (cd frontend && node …), so the
// shared repo-root database is at ../.data/trustdrive.db, not frontend/.data.
const db = new DatabaseSync(path.resolve(process.cwd(), "..", ".data", "trustdrive.db"), { readOnly: true });
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all();
for (const t of tables) {
  const cols = db.prepare(`PRAGMA table_info("${t.name}")`).all();
  const fks = db.prepare(`PRAGMA foreign_key_list("${t.name}")`).all();
  const idx = db.prepare(`PRAGMA index_list("${t.name}")`).all().filter((i) => !i.name.startsWith("sqlite_autoindex"));
  const trg = db.prepare(`SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name=?`).all(t.name);
  const count = db.prepare(`SELECT COUNT(*) AS n FROM "${t.name}"`).get().n;
  const line = [
    `${t.name} [${count} rows]`,
    `  cols: ${cols.map((c) => `${c.name}${c.notnull ? "*" : ""}`).join(" ")}`,
    fks.length ? `  fk: ${fks.map((f) => `${f.from}->${f.table}.${f.to}${f.on_delete !== "NO ACTION" ? ` (${f.on_delete})` : ""}`).join(", ")}` : null,
    idx.length ? `  idx: ${idx.map((i) => i.name).join(", ")}` : null,
    trg.length ? `  trg: ${trg.map((x) => x.name).join(", ")}` : null,
  ].filter(Boolean).join("\n");
  console.log(line);
}
console.log(`TOTAL ${tables.length}`);
