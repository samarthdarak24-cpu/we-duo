// Reproduce the reported symptom: an anonymous visitor opens the Seller portal.
const { chromium } = require("@playwright/test");
const BASE = "http://127.0.0.1:3000";

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const api = [];
  page.on("requestresponse", (r) => {
    if (r.url().includes("/api/")) api.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, "").slice(0, 90)}`);
  });

  console.log("--- ANONYMOUS (no login cookie) -> /seller ---");
  await page.goto(BASE + "/seller", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(2500);
  const who = await page.locator("text=/Samarth|Aditya|Rohan|Priya|Demo|Admin/i").first().innerText().catch(() => "(no name found)");
  console.log("renders as user:", JSON.stringify(who));
  console.log("cookies:", (await ctx.cookies()).map((c) => c.name).join(",") || "NONE");
  console.log("api calls:", api.length ? api : "(none made on load)");

  console.log("\n--- click every actionable control, record API result ---");
  for (const sel of ['a[href="/seller/add-vehicle"]', 'button:has-text("Upload document")', 'a[href*="seller/listings"]']) {
    const el = page.locator(sel).first();
    if (!(await el.count())) { console.log(`  ${sel}: NOT PRESENT`); continue; }
    api.length = 0;
    await el.click({ timeout: 5000 }).catch((e) => console.log(`  ${sel}: click failed ${String(e).slice(0, 60)}`));
    await page.waitForTimeout(2000);
    console.log(`  ${sel} -> url=${page.url().replace(BASE, "")} api=[${api.join(" | ")}]`);
  }

  console.log("\n--- anonymous /vehicle page actions ---");
  await page.goto(BASE + "/seller/listings", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(2000);
  const href = await page.locator('a[href^="/seller/listings/"]').first().getAttribute("href").catch(() => null);
  console.log("listing detail:", href);
  if (href) {
    api.length = 0;
    await page.goto(BASE + href, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(2500);
    const btns = await page.locator("button").allInnerTexts();
    console.log("buttons present:", JSON.stringify(btns.filter((b) => b.trim()).slice(0, 14)));
    for (const t of ["Add Photos", "Set Price", "Preview Listing", "Share Listing", "Get Report", "Track Inquiries", "Upload Documents", "Write Description"]) {
      const b = page.locator(`button:has-text("${t}")`).first();
      if (!(await b.count())) continue;
      api.length = 0;
      await b.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(1500);
      console.log(`  ACTION ${t.padEnd(18)} api=[${api.join(" | ") || "NO CALL"}]`);
    }
  }
  await browser.close();
})();
