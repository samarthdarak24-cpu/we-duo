// Static pre-flight for the live audit: every SQL statement and every API path
// used by the feature specs must resolve against the real schema and the real
// route tree before a browser is opened. Catches the two classes of test-side
// defect that waste a whole run (wrong column names, invented endpoints).
// Usage: node qa/live/preflight.mjs
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const db = new DatabaseSync(path.join(ROOT, ".data", "trustdrive.db"), { readOnly: true });

const files = ["harness.mjs", "setup.mjs", ...fs.readdirSync(path.join(__dirname, "features")).map((f) => path.join("features", f))];

let sqlChecked = 0;
const sqlProblems = [];
for (const rel of files) {
  const src = fs.readFileSync(path.join(__dirname, rel), "utf8");
  for (const m of src.matchAll(/"((?:SELECT|DELETE|UPDATE|INSERT|WITH)\s[\s\S]{0,500}?)"/g)) {
    const sql = m[1];
    // Skip strings that still contain interpolation or prose labels.
    if (sql.includes("${") || /\breturns\b|\b\/(share|documents)\b/.test(sql)) continue;
    sqlChecked += 1;
    try {
      db.prepare(sql);
    } catch (err) {
      sqlProblems.push(`${rel}: ${err.message} :: ${sql.slice(0, 140)}`);
    }
  }
}

const routes = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === "route.ts") {
      routes.push(
        "/api/" +
          path
            .relative(path.join(ROOT, "frontend/app/api"), p)
            .split(path.sep)
            .slice(0, -1)
            .join("/")
            .replace(/\[[^\]]+\]/g, ":seg")
      );
    }
  }
})(path.join(ROOT, "frontend/app/api"));

function matches(pathname) {
  const seg = pathname.split("?")[0].split("/").filter(Boolean);
  return routes.some((r) => {
    const rs = r.split("/").filter(Boolean);
    return rs.length === seg.length && rs.every((s, i) => s === ":seg" || s === seg[i]);
  });
}

const used = new Map();
for (const f of fs.readdirSync(path.join(__dirname, "features"))) {
  const src = fs.readFileSync(path.join(__dirname, "features", f), "utf8");
  for (const m of src.matchAll(/["'`](\/api\/v1[^"'`\s]*)["'`]/g)) {
    const p = m[1].replace(/\$\{[^}]*\}/g, ":seg");
    if (!used.has(p)) used.set(p, new Set());
    used.get(p).add(f);
  }
}

const missing = [...used.entries()].filter(([p]) => !matches(p));

console.log(`SQL statements checked: ${sqlChecked}, invalid: ${sqlProblems.length}`);
for (const p of sqlProblems) console.log("  SQL  " + p);
console.log(`API paths used: ${used.size}, with no matching route: ${missing.length}`);
for (const [p, fs_] of missing) console.log(`  PATH ${p} (used by ${[...fs_].join(", ")})`);
process.exit(sqlProblems.length || missing.length ? 1 : 0);
