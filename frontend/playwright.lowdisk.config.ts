import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * Low-disk Playwright profile.
 *
 * The full config keeps traces, video and two viewport projects, which needs
 * roughly a gigabyte of free space per suite. On a constrained runner this
 * profile keeps the same application, database, assertions and explicit
 * in-test screenshots, and only drops the automatic failure artefacts and the
 * secondary viewport project.
 *
 *   npx playwright test --config=playwright.lowdisk.config.ts e2e/live-audit.spec.ts
 *
 * Use `playwright.config.ts` (npm run test:e2e) for the complete matrix.
 */
export default defineConfig({
  ...base,
  reporter: [["list"]],
  use: { ...base.use, trace: "off", screenshot: "off", video: "off" },
  projects: base.projects?.filter((p) => p.name === "chromium-1920"),
});
