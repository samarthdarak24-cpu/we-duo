import { chromium } from "../../frontend/node_modules/playwright/index.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const OUT = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.TD_BASE_URL || "http://127.0.0.1:3000";
const SHOT = process.env.TD_SHOTS === "0" ? null : OUT;
const results = { base: BASE, startedAt: new Date().toISOString(), pages: [], logins: [], checks: [], consoleErrors: [] };

function check(name, ok, detail = "") {
  results.checks.push({ name, pass: Boolean(ok), detail: String(detail).slice(0, 300) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " :: " + String(detail).slice(0, 160) : ""}`);
}

async function attachDiagnostics(page) {
  // The marketing home page streams a background video that holds an HTTP/1.1
  // connection open and starves subsequent navigations. Block media in tests.
  await page.route("**/*", (route) => {
    const req = route.request();
    if (req.resourceType() === "media" || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(req.url())) return route.abort();
    return route.continue();
  });
  page.on("console", (m) => {
    if (m.type() === "error") results.consoleErrors.push({ page: page.url(), text: m.text().slice(0, 400) });
  });
  page.on("pageerror", (e) => results.consoleErrors.push({ page: page.url(), text: "PAGEERROR " + String(e).slice(0, 400) }));
}

async function navigate(page, pathname, timeout = 150000) {
  let res;
  try {
    res = await page.goto(BASE + pathname, { waitUntil: "commit", timeout });
  } catch (err) {
    res = await page.goto(BASE + pathname, { waitUntil: "commit", timeout });
  }
  await page.waitForLoadState("domcontentloaded", { timeout: 20000 }).catch(() => {});
  return res;
}

function save() {
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
}

async function visit(page, pathname, opts = {}) {
  const { name = pathname.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home",
          markers = [], screenshot = false, fullPage = false, wait = 900 } = opts;
  const entry = { path: pathname, name };
  const before = results.consoleErrors.length;
  try {
    const res = await navigate(page, pathname);
    await page.waitForTimeout(wait);
    entry.status = res ? res.status() : null;
    entry.url = page.url();
    entry.title = await page.title().catch(() => "");
    entry.h1 = (await page.locator("h1").first().textContent().catch(() => ""))?.trim().slice(0, 120) || "";
    const body = (await page.locator("body").innerText().catch(() => "")) || "";
    entry.textLength = body.length;
    entry.canvas = await page.locator("canvas").count().catch(() => 0);
    entry.svg = await page.locator("svg").count().catch(() => 0);
    entry.markers = Object.fromEntries(markers.map((m) => [m, body.includes(m)]));
    entry.redirectedToLogin = /\/login/.test(page.url());
    if (SHOT && screenshot) {
      const file = path.join(OUT, `${name}.png`);
      await page.screenshot({ path: file, fullPage }).catch(() => {});
      entry.screenshot = path.relative(process.cwd(), file);
    }
  } catch (err) {
    entry.error = String(err).slice(0, 300);
  }
  entry.consoleErrors = results.consoleErrors.length - before;
  results.pages.push(entry);
  save();
  console.log(`VISIT ${entry.status ?? "ERR"} ${pathname} -> ${(entry.url || "").replace(BASE, "")} | h1="${entry.h1}" | canvas=${entry.canvas} svg=${entry.svg} errors=${entry.consoleErrors}`);
  return entry;
}

async function login(page, email, password, role) {
  await navigate(page, "/login");
  await page.waitForTimeout(900);
  const diag = await page.evaluate(() => ({
    forms: document.querySelectorAll("form").length,
    inputs: [...document.querySelectorAll("form input")].map((i) => ({ type: i.type, name: i.name, id: i.id, label: i.getAttribute("aria-label") })).slice(0, 8),
    submits: [...document.querySelectorAll('form button[type="submit"]')].map((b) => b.textContent?.trim()).slice(0, 5),
  }));
  const rec = { role, email, formDiagnostics: diag };
  try {
    let emailEl = page.locator('form input[type="email"]').first();
    if (await emailEl.count() === 0) emailEl = page.locator("form input").nth(0);
    let passEl = page.locator('form input[type="password"]').first();
    if (await passEl.count() === 0) passEl = page.locator("form input").nth(1);
    await emailEl.fill(email, { timeout: 10000 });
    await passEl.fill(password, { timeout: 10000 });
    let submit = page.locator('form button[type="submit"]').first();
    if (await submit.count() === 0) submit = page.getByRole("button", { name: /sign in/i }).last();
    await submit.click({ timeout: 10000 });
    await page.waitForURL(new RegExp(`/${role}`), { timeout: 90000 }).catch(() => {});
    rec.url = page.url();
    rec.ok = new RegExp(`/${role}`).test(page.url());
    if (!rec.ok) rec.errorText = (await page.locator("body").innerText().catch(() => "")).slice(0, 400);
    if (SHOT) {
      await page.screenshot({ path: path.join(OUT, `login-${role}.png`) }).catch(() => {});
      rec.screenshot = `qa/live-browser/login-${role}.png`;
    }
  } catch (err) {
    rec.ok = false;
    rec.error = String(err).slice(0, 300);
  }
  results.logins.push(rec);
  check(`${role} login redirects to /${role}`, rec.ok, rec.url || rec.error || rec.errorText || "");
  return rec.ok;
}

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

try {
  // ---------- public ----------
  const pub = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await pub.newPage();
  await attachDiagnostics(p);
  const home = await visit(p, "/", { name: "01-home", markers: ["Every Car Has a Story", "TRUSTDRIVE"], screenshot: true });
  check("public home renders hero", home.status === 200 && home.markers["Every Car Has a Story"]);
  await visit(p, "/technology", { name: "02-technology", markers: ["Technology", "OCR"], screenshot: true });
  await visit(p, "/marketplace", { name: "03-marketplace" });
  await visit(p, "/inspection", { name: "04-inspection" });

  // ---------- seller ----------
  const sellerCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const s = await sellerCtx.newPage();
  await attachDiagnostics(s);
  const sellerOk = await login(s, "samarth@trustdrive.dev", "demo123456", "seller");
  if (sellerOk) {
    for (const [route, name, markers] of [
      ["/seller", "05-seller-dashboard", ["Overview"]],
      ["/seller/vehicles", "06-seller-vehicles", []],
      ["/seller/documents", "07-seller-documents", []],
      ["/seller/verification", "08-seller-verification", []],
      ["/seller/fraud", "09-seller-fraud", []],
      ["/seller/listings", "10-seller-listings", []],
      ["/seller/inquiries", "11-seller-inquiries", []],
      ["/seller/reports", "12-seller-reports", []],
      ["/seller/notifications", "13-seller-notifications", []],
      ["/seller/add-vehicle", "14-seller-add-vehicle", []],
    ]) {
      await visit(s, route, { name, markers, screenshot: ["05-seller-dashboard", "07-seller-documents", "09-seller-fraud"].includes(name) });
    }
  }
  const sellerPages = results.pages.filter((x) => x.path.startsWith("/seller"));
  check("all 10 seller pages return 200 and stay authenticated", sellerPages.length === 10 && sellerPages.every((x) => x.status === 200 && !x.redirectedToLogin),
    sellerPages.map((x) => `${x.path}:${x.status}${x.redirectedToLogin ? "->login" : ""}`).join(" "));

  // ---------- vehicle detail: 3D + evidence graph + rollback ----------
  const vehicle = await visit(s, "/vehicle/v-camry", {
    name: "15-vehicle-detail", markers: ["86,400", "51,200", "35,200", "ODOMETER_ROLLBACK", "Evidence"], screenshot: true, wait: 3500,
  });
  check("vehicle detail shows rollback evidence", Boolean(vehicle.markers?.["86,400"] || vehicle.markers?.["35,200"]), JSON.stringify(vehicle.markers));
  await s.locator("canvas").first().waitFor({ state: "attached", timeout: 45000 }).catch(() => {});
  const vehicleGlb = await s.evaluate(() => performance.getEntriesByType("resource").filter((e) => e.name.includes(".glb")).map((e) => e.name.split("/").pop())).catch(() => []);
  const canvasNow = await s.locator("canvas").count().catch(() => 0);
  check("real GLB model requested by the page", vehicleGlb.length > 0, vehicleGlb.join(",") || "no .glb request observed");
  check("3D canvas mounted", canvasNow > 0, `canvas=${canvasNow}`);
  const hotspotNames = await s.evaluate(() => [...document.querySelectorAll("button")].map((b) => b.textContent?.trim()).filter((t) => /bonnet|bumper|door|damage|inspect/i.test(t || "")).slice(0, 12)).catch(() => []);
  results.hotspotNames = hotspotNames;
  check("3D hotspot controls present", hotspotNames.length > 0, hotspotNames.join(" | "));
  if (SHOT) await s.screenshot({ path: path.join(OUT, "15b-3d-viewer.png") }).catch(() => {});
  try {
    const bonnet = s.getByRole("button", { name: /bonnet/i }).first();
    if (await bonnet.count()) {
      await bonnet.click({ timeout: 8000 });
      await s.waitForTimeout(700);
      const txt = (await s.locator("body").innerText().catch(() => "")) || "";
      check("clicking a 3D hotspot shows a database damage record", /damage|repair|stone chips|inspection/i.test(txt), txt.slice(0, 120));
      if (SHOT) await s.screenshot({ path: path.join(OUT, "15c-hotspot-detail.png") }).catch(() => {});
    }
  } catch (err) { check("clicking a 3D hotspot shows a database damage record", false, String(err).slice(0, 150)); }

  // ---------- buyer ----------
  const buyerCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const b = await buyerCtx.newPage();
  await attachDiagnostics(b);
  const buyerOk = await login(b, "rohan@trustdrive.dev", "demo123456", "buyer");
  if (buyerOk) {
    for (const [route, name, markers] of [
      ["/buyer", "16-buyer-dashboard", []],
      ["/buyer/explore", "17-buyer-explore", []],
      ["/buyer/history", "18-buyer-history", []],
      ["/buyer/reports", "19-buyer-reports", []],
      ["/buyer/compare", "20-buyer-compare", []],
      ["/buyer/saved", "21-buyer-saved", []],
      ["/buyer/inquiries", "22-buyer-inquiries", []],
      ["/buyer/risk", "23-buyer-risk", []],
    ]) {
      await visit(b, route, { name, markers, screenshot: ["16-buyer-dashboard", "17-buyer-explore", "18-buyer-history"].includes(name) });
    }
  }
  const buyerPages = results.pages.filter((x) => x.path.startsWith("/buyer"));
  check("all 8 buyer pages return 200 and stay authenticated", buyerPages.length === 8 && buyerPages.every((x) => x.status === 200 && !x.redirectedToLogin),
    buyerPages.map((x) => `${x.path}:${x.status}${x.redirectedToLogin ? "->login" : ""}`).join(" "));

  // RBAC: buyer must not see seller pages
  const rbac = await visit(b, "/seller/vehicles", { name: "24-rbac-buyer-on-seller" });
  const rbacBody = await b.locator("body").innerText().catch(() => "");
  check("buyer blocked from seller route", /\/login/.test(rbac.url) || /access denied|not authorized|forbidden|sign in/i.test(rbacBody), rbac.url);

  // public QR route
  const qr = await visit(b, "/verify/unknown-token", { name: "25-verify-unknown" });
  check("unknown QR token renders safe response", qr.status === 200 || qr.status === 404, `status=${qr.status}`);

  // ---------- mobile ----------
  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const m = await mobileCtx.newPage();
  await attachDiagnostics(m);
  const mobileHome = await visit(m, "/", { name: "26-mobile-home", screenshot: true, wait: 1200 });
  check("mobile home renders", mobileHome.status === 200 && mobileHome.textLength > 200);
  const overflow = await m.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  check("no horizontal overflow on mobile home", overflow.scrollWidth <= overflow.innerWidth + 2, JSON.stringify(overflow));

  results.summary = {
    pagesVisited: results.pages.length,
    pagesWithErrors: results.pages.filter((x) => x.error || x.status >= 400).map((x) => x.path),
    consoleErrorCount: results.consoleErrors.length,
    checksPassed: results.checks.filter((c) => c.pass).length,
    checksFailed: results.checks.filter((c) => !c.pass).length,
  };
} finally {
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  await browser.close();
}

console.log("\nSUMMARY " + JSON.stringify(results.summary));
console.log("Results: " + path.join(OUT, "results.json"));
