import * as H from "./harness.mjs";
const ctx = await H.newContext();
const page = await ctx.newPage();
page.on("framenavigated", (f) => { if (f === page.mainFrame()) console.log("NAV", f.url()); });
page.on("response", (r) => { if (r.url().includes("/api/")) console.log("API", r.status(), r.request().method(), r.url().replace(H.BASE, "")); });
page.on("console", (m) => console.log("CONSOLE", m.type(), m.text().slice(0, 200)));
page.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 300)));
await H.loginViaUI(page, "seller");
console.log("LOGGED IN AT", page.url());
await page.goto(`${H.BASE}/seller`, { waitUntil: "domcontentloaded" });
await H.waitForHydration(page, "details summary");
await page.locator("details summary").first().click();
await page.getByRole("button", { name: /sign out/i }).first().click();
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(1000);
  console.log(`T+${i + 1}s URL`, page.url());
}
console.log("BODY", (await page.locator("body").innerText()).slice(0, 400).replace(/\n/g, " | "));
await H.shot(page, "debug-logout");
await H.closeAll();
