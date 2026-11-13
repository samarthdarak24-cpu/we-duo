import { webkit } from "../../frontend/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const OUT = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.TD_BASE_URL || "http://127.0.0.1:3001";
const log = [];
const browser = await webkit.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on("console", (m) => { if (m.type() === "error") log.push(`console.error: ${m.text().slice(0, 250)}`); });
page.on("pageerror", (e) => log.push(`pageerror: ${String(e).slice(0, 250)}`));
page.on("response", async (r) => {
  if (r.url().includes("/api/v1/auth/login")) log.push(`LOGIN_RESPONSE ${r.status()} ${(await r.text().catch(() => "")).slice(0, 300)}`);
});

await page.goto(BASE + "/login", { waitUntil: "commit", timeout: 60000 });
await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);
const emailLocator = page.getByLabel(/email/i);
log.push(`email matches=${await emailLocator.count()} formEmailInputs=${await page.locator('form input[type="email"]').count()}`);
await emailLocator.fill("samarth@trustdrive.dev");
await page.getByLabel(/password/i).fill("demo123456");
log.push(`values after fill: email="${await page.locator('form input[type="email"]').first().inputValue()}" password="${await page.locator('form input[type="password"]').first().inputValue()}"`);
await page.locator('form button[type="submit"]').click();
await page.waitForTimeout(8000);
log.push(`final url=${page.url()}`);
log.push(`body=${(await page.locator("body").innerText().catch(() => "")).slice(0, 500).replace(/\n+/g, " | ")}`);
await page.screenshot({ path: path.join(OUT, "webkit-login.png") }).catch(() => {});
fs.writeFileSync(path.join(OUT, "webkit-login.txt"), log.join("\n"));
console.log(log.join("\n"));
await browser.close();
