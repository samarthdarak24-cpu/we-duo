// ---------------------------------------------------------------------------
// Run the four gated Vitest integration suites for real, with no mocks.
//
// `npm test` alone SKIPS 19 tests because the S3 / SMTP / SMS / ClamAV suites
// require local stand-in servers. This launcher starts all four sinks, waits
// until each port accepts connections, runs Vitest with the matching TD_*_TEST
// env vars, then tears the sinks down.
//
//   node qa/run-integration-tests.mjs          (or `npm run test:integration`)
// ---------------------------------------------------------------------------
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FRONTEND = path.join(ROOT, "frontend");
const QA = path.join(ROOT, "project", "qa");
const OUT = path.join(QA, ".test-out");
const PYTHON = process.env.TD_PYTHON || (process.platform === "win32" ? "python" : "python3");
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

const SMTP_PORT = 2525;
const SMS_PORT = 2526;
const CLAMD_PORT = 3310;
const S3_PORT = 5055;

mkdirSync(path.join(OUT, "smtp"), { recursive: true });
const smsOut = path.join(OUT, "sms.jsonl");
try { rmSync(smsOut); } catch { /* first run */ }

const sinks = [
  { name: "smtp", port: SMTP_PORT, cmd: PYTHON,
    args: [path.join(QA, "smtp-sink.py"), path.join(OUT, "smtp"), String(SMTP_PORT)], cwd: ROOT },
  { name: "sms", port: SMS_PORT, cmd: process.execPath,
    args: [path.join(QA, "sms-sink.mjs"), smsOut, String(SMS_PORT)], cwd: ROOT },
  { name: "clamd", port: CLAMD_PORT, cmd: PYTHON,
    args: [path.join(QA, "clamd-sink.py"), String(CLAMD_PORT)], cwd: ROOT },
  { name: "moto-s3", port: S3_PORT, cmd: PYTHON,
    args: ["-m", "moto.server", "-H", "127.0.0.1", "-p", String(S3_PORT)], cwd: ROOT },
];

const children = [];
let stopping = false;

function probe(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: "127.0.0.1", port });
    sock.setTimeout(700);
    sock.once("connect", () => { sock.destroy(); resolve(true); });
    sock.once("timeout", () => { sock.destroy(); resolve(false); });
    sock.once("error", () => resolve(false));
  });
}

async function waitFor(name, port, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await probe(port)) {
      console.log(`[sinks] ${name} ready on ${port}`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  console.error(`[sinks] ${name} did not start on ${port}`);
  return false;
}

function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) {
      if (process.platform === "win32" && child.pid) {
        try { spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* ignore */ }
      }
      try { process.kill(-child.pid, "SIGTERM"); } catch { /* not a process group */ }
      child.kill("SIGTERM");
    }
  }
}

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => { stopAll(); process.exit(130); });
}

async function main() {
  for (const s of sinks) {
    const child = spawn(s.cmd, s.args, {
      cwd: s.cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    });
    children.push(child);
    child.stdout?.on("data", (d) => process.stdout.write(`[${s.name}] ${d}`));
    child.stderr?.on("data", (d) => process.stderr.write(`[${s.name}] ${d}`));
    child.on("error", (e) => console.error(`[sinks] ${s.name} failed: ${e.message}`));
  }

  for (const s of sinks) {
    if (!(await waitFor(s.name, s.port))) {
      stopAll();
      process.exit(1);
    }
  }

  const env = {
    ...process.env,
    TD_S3_TEST_ENDPOINT: `http://127.0.0.1:${S3_PORT}`,
    TD_S3_TEST_BUCKET: "trustdrive-live-test",
    TD_SMTP_TEST_PORT: String(SMTP_PORT),
    TD_SMTP_TEST_OUT: path.join(OUT, "smtp"),
    TD_SMS_TEST_URL: `http://127.0.0.1:${SMS_PORT}/sms`,
    TD_SMS_TEST_OUT: smsOut,
    TD_CLAMAV_TEST_HOST: "127.0.0.1",
    TD_CLAMAV_TEST_PORT: String(CLAMD_PORT),
  };

  const files = [
    "tests/s3-storage.test.ts",
    "tests/mailer.test.ts",
    "tests/sms.test.ts",
    "tests/clamd.test.ts",
  ];
  console.log("\n[integration] running all gated suites with live sinks\n");
  const result = spawnSync(NPM, ["test", "--", ...files], {
    cwd: FRONTEND, env, stdio: "inherit", shell: process.platform === "win32",
  });
  stopAll();
  process.exit(result.status ?? 1);
}

main().catch((err) => {
  console.error("[integration] fatal:", err);
  stopAll();
  process.exit(1);
});
