// Isolated development server for Playwright.
//
// `next dev` and `next start` must never share one `.next` directory: the dev
// server rewrites the manifest and deletes BUILD_ID, which makes `next start`
// fail with "Could not find a production build" and silently turns every API
// call into an on-demand recompilation (multi-second responses, then timeouts).
// This wrapper gives the browser tests their own distDir and their own port.
import { spawn } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = path.resolve(
  path.dirname(require.resolve("next/package.json")),
  "dist/bin/next"
);

const port = process.env.E2E_PORT || "3100";

const child = spawn(process.execPath, [nextBin, "dev", "--port", port], {
  stdio: "inherit",
  env: { ...process.env, NEXT_DIST_DIR: ".next_e2e" },
});

child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
