// Live-browser sweep: logs in per role, visits every portal page, records console
// errors, unhandled page errors, non-2xx API calls and visible failure text.
const { chromium } = require("@playwright/test");
const fs = require("fs");

const BASE = "http://127.0.0.1:3000";
const SHOTS = "../qa/shots";
fs.mkdirSync(SHOTS, { recursive: true });

const ROLE_PAGES = {
  seller: [
    "/seller", "/seller/vehicles", "/seller/add-vehicle", "/seller/documents",
    "/seller/verification", "/seller/fraud", "/seller/history", "/seller/listings",
    "/seller/inquiries", "/seller/reports", "/seller/notifications", "/seller/settings",
  ],
  buyer: [
    "/buyer", "/buyer/explore", "/buyer/search", "/buyer/verification", "/buyer/risk",
    "/buyer/history", "/buyer/saved", "/buyer/compare", "/buyer/inquiries",
    "/buyer/reports", "/buyer/notifications", "/buyer/settings",
  ],
  admin: ["/admin/queue", "/admin/kyc", "/admin/audit", "/admin/users", "/admin/notifications", "/admin/settings"],
};
const CREDS = {
  seller: ["samarth@trustdrive.dev", "demo1234"],
  buyer: ["rohan@trustdrive.dev", "demo1234"],
  admin: ["admin@trustdrive.dev", "demo1234"],
};

const FAIL_TEXT = [
  "Failed to load", "Something went wrong", "failed", "error", "could not",
  "undefined", "NaN", "[object Object]", "not available", "No data",
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const report = [];

  for (const role of ["seller", "buyer", "admin"]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const [email, pw] = CREDS[role];

    // login through the real UI form
    await page.goto(BASE + "/login", { waitUntil: "networkidle" });
    await page.fill('input[type="email"], input[name="email"]', email);
    await page.fill('input[type="password"], input[name="password"]', pw);
    await page.click('button[type="submit"]');
    await page.waitForURL(/seller|buyer|admin|dashboard|overview/, { timeout: 15000 }).catch(() => {});
    await page.waitForLoadState("networkidle");
    const landed = page.url();
    if (!new RegExp("/" + role).test(landed)) {
      report.push({ role, page: "LOGIN", status: "FAIL", detail: "landed on " + landed });
    } else {
      report.push({ role, page: "LOGIN", status: "OK", detail: landed });
    }

    for (const path of ROLE_PAGES[role]) {
      const errors = [];
      const api = [];
      const onConsole = (m) => {
        if (m.type() === "error") errors.push(m.text().slice(0, 220));
      };
      const onReqFail = (r) => api.push({ url: r.url().replace(BASE, ""), status: r.status() || "NETERR" });
      page.on("console", onConsole);
      page.on("response", (r) => {
        if (r.url().includes("/api/") && (r.status() >= 400 || r.status() === 0)) {
          api.push({ url: r.url().replace(BASE, "").slice(0, 120), status: r.status() });
        }
      });
      page.on("requestfailed", (r) => {
        if (r.url().includes("/api/")) api.push({ url: r.url().replace(BASE, "").slice(0, 120), status: "REQFAIL" });
      });
      page.on("pageerror", (e) => errors.push("PAGEERROR: " + String(e).slice(0, 220)));

      let nav = "OK";
      try {
        await page.goto(BASE + path, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(2500);
      } catch (e) {
        nav = "NAVFAIL " + String(e).slice(0, 100);
      }
      const title = await page.title().catch(() => "");
      const url = page.url();
      const bodyText = (await page.locator("body").innerText().catch(() => "")) || "";
      const hits = FAIL_TEXT.filter((t) => new RegExp(t.replace(/[\[\]]/g, ""), "i").test(bodyText));
      const long = bodyText.replace(/\s+/g, " ").trim().length;
      if (url.replace(BASE, "") !== path && !url.includes(path.split("/")[1])) nav += " REDIRECT->" + url.replace(BASE, "");
      try {
        await page.screenshot({ path: `${SHOTS}/${role}${path.replace(/[^a-z0-9]/gi, "_")}.png`, fullPage: false });
      } catch {}
      report.push({
        role, page: path, status: errors.length || api.length || nav !== "OK" ? "ISSUE" : "OK",
        nav, title: title.slice(0, 40), chars: long,
        apiFails: api.slice(0, 8), errors: [...new Set(errors)].slice(0, 6), suspectText: hits.slice(0, 6),
      });
      page.off("console", onConsole);
    }
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync("../qa/browser-sweep.json", JSON.stringify(report, null, 1));
  for (const r of report) {
    console.log(`${r.status.padEnd(5)} ${r.role.padEnd(6)} ${String(r.page).padEnd(24)} ${r.nav === "OK" ? "" : r.nav} ${r.chars || ""}`);
    if (r.apiFails?.length) console.log("        API:", JSON.stringify(r.apiFails));
    if (r.errors?.length) console.log("        ERR :", JSON.stringify(r.errors));
    if (r.suspectText?.length) console.log("        TEXT:", JSON.stringify(r.suspectText));
  }
})();
