import { defineConfig, devices } from "@playwright/test";

/** 15-step seller -> buyer E2E over persisted data.
 *  Requires a seeded database. The webServer below runs an isolated `next dev`
 *  on :3100 with its own `.next_e2e` distDir, so it can never clobber the
 *  production `.next` build. Point at an already-running app with E2E_BASE_URL.
 *  Run: `npm run test:e2e` (browsers: `npx playwright install chromium`).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium-1920", use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } } },
    { name: "mobile-390", use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } } },
  ],
  ...(process.env.E2E_BASE_URL
    ? {}
    : {
        webServer: {
          command: "node scripts/e2e-server.mjs",
          url: "http://127.0.0.1:3100",
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
        },
      }),
});
