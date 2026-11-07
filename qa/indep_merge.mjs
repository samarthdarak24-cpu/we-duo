/**
 * Merge the corrected security/persistence rerun into the full sweep evidence.
 * Pass 1 = all seven phases; Retest = security + persist with harness fixes.
 * Writes qa/indep-consolidated.json (the authoritative live result set).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const full = JSON.parse(fs.readFileSync(path.join(HERE, "indep-results-full-pass1.json"), "utf8"));
const redo = JSON.parse(fs.readFileSync(path.join(HERE, "indep-results.json"), "utf8"));

const replaced = new Set(["Access control", "security", "UI → DB persistence"]);
const kept = full.results.filter((r) => !replaced.has(r.feature));
const fresh = redo.results.filter((r) => replaced.has(r.feature));
const results = [...kept, ...fresh];

const shots = [...new Set([...full.screenshots, ...redo.screenshots])];
const consoleErrors = [...(full.unexpectedConsoleSample ?? []), ...(redo.unexpectedConsoleSample ?? [])];

const out = {
  runId: `${full.runId}+${redo.runId}`,
  executedAt: new Date().toISOString(),
  base: full.base,
  intel: full.intel,
  method: "Real headless Chromium + running Next.js :3000 / FastAPI :8000; read-only SQLite assertions",
  phases: full.phases,
  note: "Pass 1 covered all seven phases. Security and persistence were rerun after correcting harness fixtures (wrong demo seller2 account, wrong documents column name, wrong wizard labels/identifiers). The rerun rows replace the pass-1 rows for those phases; all other rows are from pass 1.",
  totals: {
    checks: results.length,
    passed: results.filter((r) => r.status === "PASS").length,
    failed: results.filter((r) => r.status === "FAIL").length,
  },
  jsExceptions: (full.jsExceptions ?? 0) + (redo.jsExceptions ?? 0),
  consoleErrors: (full.consoleErrors ?? 0) + (redo.consoleErrors ?? 0),
  unexpectedConsoleErrors: consoleErrors.length,
  unexpectedConsoleSample: consoleErrors,
  pageErrorsSample: [...(full.pageErrorsSample ?? []), ...(redo.pageErrorsSample ?? [])],
  screenshots: shots,
  results,
};
fs.writeFileSync(path.join(HERE, "indep-consolidated.json"), JSON.stringify(out, null, 2));
fs.writeFileSync(path.join(HERE, "indep-results.json"), JSON.stringify(out, null, 2));
console.log(`consolidated: ${out.totals.checks} checks, ${out.totals.passed} PASS, ${out.totals.failed} FAIL, ${shots.length} screenshots`);
if (out.totals.failed) out.results.filter((r) => r.status === "FAIL").forEach((r) => console.log(`  FAIL: ${r.feature} :: ${r.name} — ${r.detail}`));
