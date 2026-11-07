import { webkit } from "../../frontend/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const OUT = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.TD_BASE_URL || "http://127.0.0.1:3001";
const log = [];
const browser = await webkit.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on("console", (m) => { if (m.type() === "error") log.push(`console.error: ${m.text().slice(0, 300)}`); });
page.on("pageerror", (e) => log.push(`pageerror: ${String(e).slice(0, 300)}`));
page.on("requestfailed", (r) => log.push(`requestfailed: ${r.url().split("/").pop()} :: ${r.failure()?.errorText}`));
page.on("response", (r) => { if (r.status() >= 400) log.push(`HTTP ${r.status()} ${r.url().split("/").pop()}`); });

for (const route of ["/", "/login", "/technology"]) {
  await page.goto(BASE + route, { waitUntil: "commit", timeout: 60000 }).catch((e) => log.push(`goto ${route}: ${String(e).slice(0, 150)}`));
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const text = (await page.locator("body").innerText().catch(() => "")) || "";
  log.push(`${route} | url=${page.url()} | emailInputs=${await page.locator('form input[type="email"]').count()} | runtimeFault=${text.includes("Something broke")} | body=${text.slice(0, 180).replace(/\n+/g, " | ")}`);
  await page.screenshot({ path: path.join(OUT, `webkit-${route.replace(/\//g, "_") || "home"}.png`) }).catch(() => {});
}
fs.writeFileSync(path.join(OUT, "webkit-check.txt"), log.join("\n"));
console.log(log.join("\n"));
await browser.close();
