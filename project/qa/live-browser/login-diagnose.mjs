import { chromium } from "../../frontend/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const OUT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://127.0.0.1:3000";
const log = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route("**/*", (r) => (r.request().resourceType() === "media" ? r.abort() : r.continue()));
page.on("console", (m) => log.push(`console.${m.type()}: ${m.text().slice(0, 300)}`));
page.on("pageerror", (e) => log.push(`pageerror: ${String(e).slice(0, 300)}`));
page.on("response", async (r) => {
  if (r.url().includes("/api/v1/auth/login")) {
    let body = "";
    try { body = (await r.text()).slice(0, 500); } catch {}
    log.push(`LOGIN_RESPONSE status=${r.status()} body=${body}`);
  }
});
page.on("request", (r) => {
  if (r.url().includes("/api/v1/auth/login")) log.push(`LOGIN_REQUEST ${r.method()} ${r.url()} body=${(r.postData() || "").slice(0, 200)}`);
});

await page.goto(BASE + "/login", { waitUntil: "commit", timeout: 120000 });
await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);
log.push(`initial url=${page.url()}`);
log.push(`forms=${await page.locator("form").count()} emailInputs=${await page.locator('form input[type="email"]').count()} passInputs=${await page.locator('form input[type="password"]').count()} submits=${await page.locator('form button[type="submit"]').count()}`);

await page.locator('form input[type="email"]').first().fill("samarth@trustdrive.dev");
await page.locator('form input[type="password"]').first().fill("demo123456");
const t0 = Date.now();
await page.locator('form button[type="submit"]').first().click();
await page.waitForURL(/\/seller/, { timeout: 90000 }).catch((e) => log.push(`waitForURL: ${String(e).slice(0, 120)}`));
log.push(`redirect elapsed=${Date.now() - t0}ms`);
await page.waitForTimeout(1000);
log.push(`final url=${page.url()}`);
log.push(`body=${(await page.locator("body").innerText().catch(() => "")).slice(0, 700).replace(/\n+/g, " | ")}`);
await page.screenshot({ path: path.join(OUT, "login-diagnose.png"), fullPage: false }).catch(() => {});
fs.writeFileSync(path.join(OUT, "login-diagnose.txt"), log.join("\n"));
console.log(log.join("\n"));
await browser.close();
