import fs from "node:fs";
import path from "node:path";

// Shared repo-root .env (see ../next.config.mjs).
const repoRoot = path.resolve(__dirname, "..");
const envFile = path.join(repoRoot, ".env");
if (fs.existsSync(envFile)) {
  for (const raw of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    const value = rest.join("=").trim().replace(/^["']|["']$/g, "");
    if (key.trim() && process.env[key.trim()] === undefined) process.env[key.trim()] = value;
  }
}
for (const key of ["TD_DATA_DIR", "TD_DB_FILE", "TD_UPLOAD_DIR", "TD_MODEL_DIR"]) {
  const value = process.env[key];
  if (value && !path.isAbsolute(value) && !value.startsWith("sqlite")) {
    process.env[key] = path.resolve(repoRoot, value);
  }
}
import { defineConfig } from "vitest/config";

export default defineConfig({
  // App components use the automatic JSX runtime (Next.js/SWC). Vitest's
  // esbuild transform must match, otherwise classic `React.createElement`
  // output throws "React is not defined" in component tests.
  esbuild: { jsx: "automatic" },
  test: {
    // Only Vitest suites. Playwright specs live in e2e/ and are run by
    // `npm run test:e2e`; letting Vitest collect them breaks both runners.
    include: ["tests/**/*.test.{ts,tsx}"],
    // Redirect TD_DB_FILE to a throwaway snapshot before any test module (and
    // therefore `lib/server/db`) is imported. Without this, DB suites wrote
    // straight into the live `.data/trustdrive.db`.
    setupFiles: ["./tests/setup-db.ts"],
    pool: "forks",
    fileParallelism: false,
    // `node:sqlite` is a runtime builtin; Vite must not try to resolve it as a
    // package or DB-backed tests fail to even load.
    server: { deps: { external: [/^node:/] } },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      "node:sqlite": path.resolve(__dirname, "./tests/sqlite-shim.mjs"),
      sqlite: path.resolve(__dirname, "./tests/sqlite-shim.mjs"),
    },
  },
});
