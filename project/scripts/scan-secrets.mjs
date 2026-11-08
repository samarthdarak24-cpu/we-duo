#!/usr/bin/env node
// ---------------------------------------------------------------------------
// TrustDrive — hardcoded-secret scanner.
//
// Two severities:
//   HIGH   — never acceptable anywhere (PEM private keys, AWS keys, sk-… keys,
//            GitHub/Slack tokens). Fails the build in ANY scanned file.
//   MEDIUM — a credential-like NAME assigned an inline literal. Fails the build
//            in application source. In QA scripts and test files it is reported
//            as INFO only, because those files legitimately contain the
//            published demo credentials used to drive the local demo dataset.
//
// Placeholders ("replace-with-…", "change-me", "example", "test-only",
// "${VAR}", process.env …) are always allowed.
//
// Usage: node scripts/scan-secrets.mjs [--root <dir>]
// Exit codes: 0 = clean, 1 = findings, 2 = scanner error.
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const rootIdx = args.indexOf("--root");
const ROOT = path.resolve(rootIdx >= 0 ? args[rootIdx + 1] : ".");

/** Application source: a MEDIUM finding here fails the build. */
const APP_DIRS = [
  "frontend/app",
  "frontend/lib",
  "frontend/components",
  "frontend/scripts",
  "backend/app",
  "scripts",
  "infrastructure",
  "deploy",
];
/** Test / QA fixtures: only HIGH findings fail the build here. */
const FIXTURE_DIRS = ["frontend/tests", "frontend/qa", "backend/tests", "backend/scripts", "qa"];

const SCAN_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".py", ".json", ".yml", ".yaml", ".sh", ".sol"]);
const SKIP_DIR = new Set(["node_modules", ".next", ".git", "playwright-report", "test-results", "public", ".data"]);

const PLACEHOLDER =
  /(replace[-_ ]?with|change[-_ ]?(me|in[-_ ]?prod)|your[-_ ]?(secret|key|token)|example|placeholder|dummy|redacted|xxxx|<[^>]+>|\$\{[^}]+\}|process\.env|os\.environ|getenv|not[-_ ]?set|demo|dev[-_ ]?secret|test[-_ ]?(only|token|service)|localhost|127\.0\.0\.1)/i;

const HIGH_RULES = [
  { id: "private-key-block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, label: "PEM private key block" },
  { id: "aws-access-key-id", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, label: "AWS access key id" },
  { id: "openai-style-key", re: /\bsk-[A-Za-z0-9_-]{24,}\b/g, label: "API secret key (sk-…)" },
  { id: "github-token", re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, label: "GitHub token" },
  { id: "slack-token", re: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g, label: "Slack token" },
];

const MEDIUM_RULES = [
  {
    id: "assigned-secret-literal",
    re: /\b([A-Za-z0-9_]*(?:secret|password|passwd|token|api[_-]?key|apikey|private[_-]?key|credential)[A-Za-z0-9_]*)\b\s*[:=]\s*["'`]([^"'`\n]{12,})["'`]/gi,
    label: "credential assigned an inline literal",
  },
  {
    id: "long-hex-literal",
    re: /\b([A-Za-z0-9_]*(?:secret|token|key)[A-Za-z0-9_]*)\b\s*[:=]\s*["'`]([0-9a-fA-F]{32,})["'`]/g,
    label: "long hex literal assigned to a credential-like name",
  },
];

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue;
      walk(path.join(dir, e.name), out);
    } else if (SCAN_EXT.has(path.extname(e.name))) {
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

const appFiles = [];
for (const d of APP_DIRS) walk(path.join(ROOT, d), appFiles);
const fixtureFiles = [];
for (const d of FIXTURE_DIRS) walk(path.join(ROOT, d), fixtureFiles);

const failures = [];
const infos = [];

function scan(files, rules, severity, scope) {
  for (const file of files) {
    const rel = path.relative(ROOT, file);
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const rule of rules) {
      const re = new RegExp(rule.re.source, rule.re.flags.includes("g") ? rule.re.flags : rule.re.flags + "g");
      let m;
      while ((m = re.exec(text)) !== null) {
        const groups = m.slice(1).filter((g) => typeof g === "string");
        const captured = groups.length ? groups[groups.length - 1] : m[0];
        if (PLACEHOLDER.test(captured)) continue;
        if (severity === "HIGH" && PLACEHOLDER.test(m[0])) continue;
        const line = text.slice(0, m.index).split("\n").length;
        const entry = { rel, line, id: rule.id, label: rule.label, scope, value: captured.slice(0, 12) };
        if (severity === "HIGH" || scope === "app") failures.push(entry);
        else infos.push(entry);
      }
    }
  }
}

scan(appFiles, HIGH_RULES, "HIGH", "app");
scan(fixtureFiles, HIGH_RULES, "HIGH", "fixture");
scan(appFiles, MEDIUM_RULES, "MEDIUM", "app");
scan(fixtureFiles, MEDIUM_RULES, "MEDIUM", "fixture");

if (infos.length) {
  console.log(`[scan-secrets] ${infos.length} informational item(s) in test/QA fixtures (allowed):`);
  for (const f of infos.slice(0, 10)) {
    console.log(`  ${f.rel}:${f.line}  [${f.id}] ${f.label}`);
  }
}

if (failures.length) {
  console.error("\n[scan-secrets] FAILED — possible hardcoded credentials:\n");
  for (const f of failures) {
    console.error(`  ${f.rel}:${f.line}  [${f.id}] ${f.label}  scope=${f.scope}`);
  }
  console.error(`\n[scan-secrets] ${failures.length} finding(s). Move real credentials into environment variables.`);
  process.exit(1);
}
console.log(
  `[scan-secrets] OK — ${appFiles.length} application files and ${fixtureFiles.length} test/QA files scanned, ` +
    "no hardcoded credentials found."
);
