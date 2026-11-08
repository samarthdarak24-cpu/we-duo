// ---------------------------------------------------------------------------
// Start the whole app locally with one command.
//
// The Next.js app is the system of record, but eight of its API routes proxy
// user-authenticated work to the additive Python service (OCR corrections,
// damage review, photo detection, system registry/storage/notifications,
// fraud model status), and the AI assistant/stack/OCR/document/investigation
// features call it directly. Starting ONLY `npm start` leaves every one of
// those returning 502 "Backend unreachable". This launcher starts both
// runtimes against the same shared database and keeps them alive together.
//
//   node scripts/start-local.mjs           # production build (npm start)
//   node scripts/start-local.mjs --dev    # next dev
//   TD_PYTHON=... PORT=3000 node scripts/start-local.mjs
// ---------------------------------------------------------------------------
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import http from "node:http";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FRONTEND = path.join(ROOT, "frontend");
const DEV = process.argv.includes("--dev");
const PORT = Number(process.env.PORT || 3000);
const INTELLIGENCE_URL = process.env.TD_INTELLIGENCE_URL || "http://127.0.0.1:8000";
const API_PORT = Number(new URL(INTELLIGENCE_URL).port || 8000);
const API_HOST = new URL(INTELLIGENCE_URL).hostname;
// Pick an interpreter that can actually import uvicorn. `python` on PATH is not
// always the one holding the backend dependencies; the project venv usually is.
function resolvePython() {
  const venv = path.join(ROOT, "backend", ".venv");
  const candidates = [
    process.env.TD_PYTHON,
    path.join(venv, "Scripts", "python.exe"),
    path.join(venv, "bin", "python"),
    "python3",
    "python",
  ].filter(Boolean);
  for (const cmd of candidates) {
    if (path.isAbsolute(cmd) && !existsSync(cmd)) continue;
    const probe = spawnSync(cmd, ["-c", "import uvicorn"], { stdio: "ignore" });
    if (probe.status === 0) return cmd;
  }
  // Nothing has uvicorn: report the most likely interpreter and let the clear
  // "No module named uvicorn" error reach the operator.
  return process.env.TD_PYTHON || (process.platform === "win32" ? "python" : "python3");
}

const PYTHON = resolvePython();
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

const children = [];
let shuttingDown = false;

function prefixStream(stream, label) {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) process.stdout.write(`[${label}] ${line}\n`);
  });
}

function start(label, command, args, cwd, env, shell = false) {
  // Node on Windows cannot spawn a `.cmd` shim directly (EINVAL); it needs a
  // shell. The Python process is a real .exe and is spawned without one.
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    shell,
  });
  children.push(child);
  prefixStream(child.stdout, label);
  prefixStream(child.stderr, label);
  child.on("error", (err) => {
    console.error(`[start] ${label} failed to launch: ${err.message}`);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`[start] ${label} exited (code=${code}, signal=${signal}). Stopping the other runtime.`);
    shutdown(code ?? 1);
  });
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) {
      if (process.platform === "win32" && child.pid) {
        // npm.cmd spawns the real server as a child; kill the whole tree.
        try {
          spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"],
            { stdio: "ignore", windowsHide: true });
        } catch { /* fall through */ }
      }
      try { process.kill(-child.pid, "SIGTERM"); } catch { /* not a process group */ }
      child.kill("SIGTERM");
    }
  }
  setTimeout(() => process.exit(code), 400).unref();
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => shutdown(0));
}

function probe(url, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const req = http.request(
      { hostname: parsed.hostname, port: parsed.port, path: parsed.pathname, method: "GET", timeout: timeoutMs },
      (res) => { res.resume(); resolve(res.statusCode >= 200 && res.statusCode < 500); }
    );
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
    req.end();
  });
}

async function waitFor(url, label, maxMs) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    if (await probe(url)) {
      console.log(`[start] ${label} ready after ${Math.round((Date.now() - started) / 1000)}s`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function main() {
  console.log(`[start] repo root: ${ROOT}`);
  console.log(`[start] intelligence URL: ${INTELLIGENCE_URL}`);

  const alreadyUp = await probe(`${INTELLIGENCE_URL}/health`);
  if (alreadyUp) {
    console.log("[start] Python intelligence service is already running; reusing it.");
  } else {
    console.log(`[start] starting Python intelligence service (${PYTHON}) on ${API_HOST}:${API_PORT}`);
    start("api", PYTHON,
      ["-m", "uvicorn", "app.main:app", "--app-dir", "backend",
       "--host", API_HOST, "--port", String(API_PORT)],
      ROOT, { TD_INTELLIGENCE_URL: INTELLIGENCE_URL });
    // /health is cheap now, but first-time package discovery can still take a moment.
    if (!(await waitFor(`${INTELLIGENCE_URL}/health`, "intelligence service", 120_000))) {
      console.error("[start] WARNING: intelligence service did not become healthy; frontend features that need it will report an honest error.");
    }
  }

  // Async intelligence jobs (`/api/intelligence/jobs`, document processing with
  // `async:true`) need the DB-backed worker. The portal features the UI actually
  // calls are synchronous, so it is opt-in to avoid a third idle process.
  if (process.env.TD_START_WORKER === "1") {
    console.log("[start] starting background job worker");
    start("worker", PYTHON, ["-m", "app.worker"], path.join(ROOT, "backend"),
      { TD_INTELLIGENCE_URL: INTELLIGENCE_URL });
  }

  const script = DEV ? "dev" : "start";
  const args = DEV ? ["run", "dev", "--", "-p", String(PORT)] : ["run", "start", "--", "-p", String(PORT)];
  console.log(`[start] starting Next.js (npm run ${script}) on port ${PORT}`);
  start("web", NPM, args, FRONTEND,
    { PORT: String(PORT), TD_INTELLIGENCE_URL: INTELLIGENCE_URL },
    process.platform === "win32");

  const web = `http://127.0.0.1:${PORT}/api/v1/health/ready`;
  if (await waitFor(web, "web app", DEV ? 180_000 : 60_000)) {
    console.log(`[start] ready: http://127.0.0.1:${PORT}`);
  }
}

main().catch((err) => {
  console.error("[start] fatal:", err);
  shutdown(1);
});
