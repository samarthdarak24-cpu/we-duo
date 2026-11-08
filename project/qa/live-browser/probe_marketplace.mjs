import path from "node:path";
import { fileURLToPath } from "node:url";
import { BASE, newContext, waitForHydration, closeAll } from "../live/harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VEHICLE = process.argv[2] || "v-1793959415934";

const ctx = await newContext();
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 200)); });
page.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 200)));

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await waitForHydration(page, "#login-email");
await page.locator("#login-email").fill("rohan@trustdrive.dev");
await page.locator("#login-password").fill("demo1234");
await page.locator('form button[type="submit"]').click();
await page.waitForURL(/\/buyer/, { timeout: 30000 }).catch(() => {});
console.log("logged in at", page.url());

await page.goto(`${BASE}/vehicle/${VEHICLE}`, { waitUntil: "domcontentloaded" });
await page.addStyleTag({ content: "html{scroll-behavior:auto !important}" });
await page.getByText(/Recorded Defects/i).first().waitFor({ timeout: 60000 });
console.log("defects chip visible");
await page.locator('button[aria-label*="damage records"]').first().waitFor({ state: "visible", timeout: 30000 });
console.log("hotspot pin visible");
for (const t of [5, 15, 30, 60]) {
  await page.waitForTimeout(t * 1000 - (t === 5 ? 0 : 0));
  const state = await page.evaluate(() => {
    const pins = document.querySelectorAll('button[aria-label*="damage records"]');
    const canvases = document.querySelectorAll("canvas");
    const c = canvases[0];
    return {
      pins: pins.length,
      pinLabels: Array.from(pins).map((p) => p.getAttribute("aria-label")).slice(0, 5),
      canvases: canvases.length,
      canvasSize: c ? `${c.width}x${c.height}` : null,
      loadingText: document.body.innerText.includes("Loading 3D viewer"),
      failedText: document.body.innerText.includes("could not be parsed"),
    };
  });
  console.log(`t=${t}s`, JSON.stringify(state));
  if (state.pins > 0) break;
}
await page.screenshot({ path: path.join(__dirname, "shots-six", "probe-3d.png"), fullPage: false });

const contact = page.getByRole("button", { name: /Contact seller/i });
console.log("contact count", await contact.count(), "visible", await contact.first().isVisible().catch(() => false));
const t0 = Date.now();
await contact.first().click({ timeout: 20000 }).then(() => console.log("normal click worked", Date.now() - t0, "ms")).catch((e) => console.log("normal click failed", e.message.split("\n")[0]));
if (!(await page.locator("#vehicle-inquiry").isVisible().catch(() => false))) {
  await contact.first().evaluate((el) => el.click());
}
await page.locator("#vehicle-inquiry").waitFor({ state: "visible", timeout: 15000 });
console.log("inquiry form opened");
await page.locator("#vehicle-inquiry").fill("Probe message — ignore");
const send = page.getByRole("button", { name: /^Send inquiry$/i });
const ts = Date.now();
await send.click({ timeout: 20000 }).then(() => console.log("send click worked", Date.now() - ts, "ms")).catch((e) => console.log("send click failed", e.message.split("\n")[0]));
await page.waitForTimeout(1200);
console.log("info:", await page.locator("body").innerText().then((t) => t.includes("Inquiry sent")));
await page.screenshot({ path: path.join(__dirname, "shots-six", "probe-inquiry.png"), fullPage: false });

await closeAll();
