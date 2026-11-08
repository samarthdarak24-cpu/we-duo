import { defineConfig, devices } from "@playwright/test";

/** QA regression config. Points at the isolated, clean dev server started by
 *  the QA harness (default 3301). No webServer process is spawned here so the
 *  harness controls lifecycle; set QA_BASE_URL to override. */
const base = process.env.QA_BASE_URL || "http://127.0.0.1:3301";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "results/playwright.json" }]],
  outputDir: "results/pw-artifacts",
  use: {
    baseURL: base,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
  },
  projects: [
    { name: "desktop-1920", use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } } },
    { name: "mobile-390", use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } } },
  ],
});
