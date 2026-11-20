// Isolated development server for Playwright.
//
// `next dev` and `next start` must never share one `.next` directory: the dev
// server rewrites the manifest and deletes BUILD_ID, which makes `next start`
// fail with "Could not find a production build" and silently turns every API
// call into an on-demand recompilation (multi-second responses, then timeouts).
// This wrapper gives the browser tests their own distDir and their own port.
//
// The live-audit suites exercise OCR, verification, AI and report generation.
// Those calls go through TD_INTELLIGENCE_URL, so start the Python service too
// unless the caller already supplied an external URL.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = path.resolve(
  path.dirname(require.resolve("next/package.json")),
  "dist/bin/next"
);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const port = process.env.E2E_PORT || "3100";
const intelPort = process.env.E2E_INTEL_PORT || "8000";
const intelUrl = process.env.TD_INTELLIGENCE_URL || `http://127.0.0.1:${intelPort}`;

async function waitForIntelligence(url) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      /* not ready yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Intelligence service did not become ready at ${url}/health`);
}

let intel = null;
if (!process.env.TD_INTELLIGENCE_URL) {
  intel = spawn(
    process.execPath,
    [
      path.join(ROOT, "project/scripts/setup/py.mjs"),
      "-m", "uvicorn", "app.main:app",
      "--app-dir", "backend",
      "--host", "127.0.0.1", "--port", intelPort,
    ],
    { cwd: ROOT, stdio: "inherit" }
  );
  intel.on("exit", (code, signal) => {
    if (code || signal) console.error(`[e2e] intelligence service exited (${signal ?? code})`);
  });
  try {
    await waitForIntelligence(intelUrl);
  } catch (err) {
    intel.kill();
    throw err;
  }
}

const child = spawn(process.execPath, [nextBin, "dev", "--port", port], {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_DIST_DIR: ".next_e2e",
    TD_INTELLIGENCE_URL: intelUrl,
    // Serial E2E suites register/log in many times in one minute; the real
    // limiter (10/min) would reject them. It is covered by ratelimit.test.ts.
    TD_RATE_LIMIT_AUTH: "1000",
  },
});

function stopIntelligence() {
  if (intel && !intel.killed) intel.kill();
}
function shutdown(signal) {
  stopIntelligence();
  if (!child.killed) child.kill(signal);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
child.on("exit", (code, signal) => {
  stopIntelligence();
  process.exit(signal ? 1 : (code ?? 1));
});
