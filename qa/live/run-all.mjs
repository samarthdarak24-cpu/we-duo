// Sequential live feature runner: node qa/live/run-all.mjs F03 F04 F05
// Runs one Chromium process per feature so a crash cannot take the batch down,
// then aggregates qa/live/results/*.json into qa/live/results/ALL.json.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESULTS = path.join(__dirname, "results");
const wanted = process.argv.slice(2).filter((a) => /^F\d\d$/i.test(a)).map((a) => a.toUpperCase());
if (!wanted.length) {
  console.error("Usage: node qa/live/run-all.mjs F03 F04 ...");
  process.exit(2);
}

const rows = [];
for (const id of wanted) {
  const started = Date.now();
  console.log(`\n\n######################## ${id} ########################`);
  let status = "PASS";
  try {
    execFileSync(process.execPath, [path.join(__dirname, "run.mjs"), id], {
      stdio: "inherit",
      timeout: Number(process.env.TD_FEATURE_TIMEOUT || 900) * 1000,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    status = err?.killed ? "TIMEOUT" : "FAIL";
  }
  const file = path.join(RESULTS, `${id}.json`);
  let out = null;
  try { out = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* runner crashed before writing */ }
  rows.push({
    id,
    name: out?.featureName ?? id,
    status: out ? (out.passed ? "PASS" : "FAIL") : status,
    checks: out?.total ?? 0,
    failed: out?.failed ?? 0,
    errors: (out?.errors ?? []).length,
    firstError: out?.errors?.[0]?.msg?.split("\n")[0] ?? null,
    failedChecks: (out?.checks ?? []).filter((c) => !c.ok).map((c) => `${c.label} :: ${c.detail}`.slice(0, 300)),
    seconds: Math.round((Date.now() - started) / 1000),
  });
}

console.log("\n\n================ BATCH SUMMARY ================");
for (const r of rows) console.log(`${r.status.padEnd(7)} ${r.id} ${r.name} — ${r.checks - r.failed}/${r.checks} checks, ${r.errors} errors, ${r.seconds}s`);
fs.writeFileSync(path.join(RESULTS, "ALL.json"), JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));
if (rows.some((r) => r.status !== "PASS")) process.exitCode = 1;
