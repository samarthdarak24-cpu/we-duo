import { chromium } from "playwright";

const base = "http://localhost:3000";
const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({
  headless: false,
  executablePath: chrome,
  args: ["--no-proxy-server", "--ignore-gpu-blocklist", "--enable-webgl"],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

const logs = [];
const failed = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("requestfailed", (r) => failed.push(`${r.failure()?.errorText} ${r.url()}`));
page.on("response", (r) => {
  if (r.status() >= 400) failed.push(`HTTP ${r.status()} ${r.url()}`);
});

await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);
await page.locator("#login-email").fill("aditya@trustdrive.dev");
await page.locator("#login-password").fill("demo123456");
await page.locator("form button[type=submit]").click();
try {
  await page.waitForURL(/\/buyer$/, { timeout: 12000 });
} catch {
  console.log("click did not submit; retrying with native requestSubmit()");
  await page.evaluate(() => document.forms[0].requestSubmit());
  await page.waitForURL(/\/buyer$/, { timeout: 20000 });
}
console.log("logged in:", page.url());

for (const url of ["/vehicle/v-bmw", "/inspection?vehicle=v-bmw"]) {
  logs.length = 0;
  failed.length = 0;
  await page.goto(`${base}${url}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const samples = [];
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(2000);
    const s = await page.evaluate(() => ({
      canvases: document.querySelectorAll("canvas").length,
      loadingText: document.body.innerText.includes("Loading 3D viewer")
        ? "Loading 3D viewer…"
        : document.body.innerText.includes("Initializing 3D Inspection Studio")
          ? "Initializing 3D Inspection Studio…"
          : document.body.innerText.includes("Initialising 3D Inspection Engine")
            ? "Initialising 3D Inspection Engine"
            : "none",
    }));
    samples.push(`${(i + 1) * 2}s canvas=${s.canvases} fallback=${s.loadingText}`);
    if (s.canvases > 0) break;
  }
  console.log(`\n=== ${url} ===`);
  console.log(samples.join("\n"));
  console.log("FAILED:", failed.length ? failed.slice(0, 20).join("\n  ") : "(none)");
  console.log("LOGS:", logs.length ? logs.slice(0, 20).join("\n  ") : "(none)");
}

await browser.close();
