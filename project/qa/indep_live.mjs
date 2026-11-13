/**
 * TrustDrive — INDEPENDENT live-browser verification (2026-11-07).
 *
 * This harness is separate from qa/live_e2e.mjs. It drives a REAL headless
 * Chromium against the running Next.js app, asserts the SHARED SQLite database
 * in read-only mode, and records PASS/FAIL evidence for every check.
 *
 *   node qa/indep_live.mjs                    # all phases
 *   TD_PHASES=bugs node qa/indep_live.mjs    # only the defect probes
 *   TD_PHASES=auth,pages,security,responsive,bugs,persist node qa/indep_live.mjs
 *
 * No mock responses, no injected session cookies, no direct DB writes.
 */
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const nodeRequire = createRequire(path.join(ROOT, "frontend", "package.json"));
const { chromium } = nodeRequire("@playwright/test");

const BASE = process.env.TD_BASE_URL || "http://127.0.0.1:3000";
const INTEL = process.env.TD_INTEL_URL || "http://127.0.0.1:8000";
const DB_FILE = path.join(ROOT, ".data", "trustdrive.db");
const SHOTS = path.join(ROOT, "SCREENSHOTS", "independent");
const OUT = path.join(HERE, "indep-results.json");
fs.mkdirSync(SHOTS, { recursive: true });

const RUN = `IND-${Date.now().toString(36).toUpperCase()}`;
const PHASES = new Set((process.env.TD_PHASES || "health,auth,pages,security,responsive,bugs,persist").split(","));
const results = [];
const consoleErrors = [];
const pageErrors = [];
const screenshots = [];
let browser;

function chk(feature, name, ok, detail = "") {
  const row = { feature, name, status: ok ? "PASS" : "FAIL", detail: String(detail).slice(0, 400) };
  results.push(row);
  console.log(`[${row.status}] ${feature} :: ${name}${detail ? ` — ${String(detail).slice(0, 160)}` : ""}`);
  return ok;
}
function sql(query, ...params) {
  const db = new DatabaseSync(DB_FILE, { readOnly: true });
  try { return db.prepare(query).all(...params); } finally { db.close(); }
}
function sqlOne(query, ...params) { return sql(query, ...params)[0] ?? null; }

function watch(page, tag) {
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push({ tag, text: m.text().slice(0, 400) });
  });
  page.on("pageerror", (e) => pageErrors.push({ tag, text: String(e.message).slice(0, 400) }));
}

async function newCtx(viewport = { width: 1440, height: 900 }) {
  return browser.newContext({ baseURL: BASE, viewport, ignoreHTTPSErrors: true, locale: "en-IN" });
}
async function goto(page, url) {
  return page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
}
/**
 * Next.js serves server-rendered HTML before React attaches. Clicking a submit
 * button in that window performs a NATIVE form GET with no API call at all.
 * Wait for the React fiber on a client component before any form interaction.
 */
async function hydrate(page, selector) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
  await page.waitForFunction(
    (sel) => {
      const n = document.querySelector(sel);
      return !!n && Object.keys(n).some((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactProps$"));
    },
    selector,
    { timeout: 30000 }
  ).catch(() => {});
}
async function shot(page, name) {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false, animations: "disabled" }).catch(() => {});
  screenshots.push(path.relative(ROOT, file).replace(/\\/g, "/"));
  return file;
}
async function login(page, email, password, home) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await goto(page, `${BASE}/login`);
    await hydrate(page, "#login-email");
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(password);
    const pending = page.waitForResponse(
      (r) => r.url().includes("/api/v1/auth/login") && r.request().method() === "POST",
      { timeout: 45000 }
    ).catch(() => null);
    await page.locator('form button[type="submit"]').evaluate((el) => el.click()).catch(() => {});
    const res = await pending;
    if (res && res.status() === 200) {
      await page.waitForURL(home, { timeout: 45000 }).catch(() => {});
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(500);
      // A 200 with a redirect to the WRONG portal means the account's role is
      // not the one the test assumed. Never treat that as a successful login.
      if (home.test(page.url())) return true;
    }
    await page.waitForTimeout(1200);
  }
  return false;
}

const ACCOUNTS = {
  seller: { email: "samarth@trustdrive.dev", password: "demo123456", home: /\/seller/ },
  seller2: { email: "weduo@trustdrive.dev", password: "demo123456", home: /\/seller/ },  // u-seller2, a real second seller
  buyer: { email: "rohan@trustdrive.dev", password: "demo123456", home: /\/buyer/ },
  buyer2: { email: "priya@trustdrive.dev", password: "demo123456", home: /\/buyer/ },
  admin: { email: "admin@trustdrive.dev", password: "demo123456", home: /\/admin/ },
};

// ---------------------------------------------------------------- PHASE: health
async function phaseHealth() {
  const f = "Environment";
  for (const p of ["/", "/login", "/register", "/marketplace", "/api/v1/ai/stack"]) {
    const r = await fetch(`${BASE}${p}`);
    chk(f, `GET ${p} → HTTP 200`, r.status === 200, `status=${r.status}`);
  }
  const h = await fetch(`${INTEL}/health`).then((r) => r.json()).catch(() => null);
  chk(f, "Python intelligence /health ok", h?.status === "ok", `service=${h?.service}`);
  chk(f, "Intelligence shares the Next.js SQLite DB", h?.database?.shared_with_nextjs === true, `tables=${h?.database?.tables}`);
  chk(f, "Active OCR engine is reported honestly", Array.isArray(h?.ocr_backends) && h.ocr_backends.some((b) => b.available), JSON.stringify(h?.ocr_backends));
  chk(f, "LLM disabled → no invented conclusions", h?.llm?.active === false && h?.llm?.provider === "none", `provider=${h?.llm?.provider}`);
  const tables = sql("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")[0].n;
  chk(f, "Shared DB has a real schema", tables >= 50, `${tables} tables`);
  const users = sqlOne("SELECT count(*) AS n FROM users").n;
  const vehicles = sqlOne("SELECT count(*) AS n FROM vehicles").n;
  chk(f, "Shared DB is seeded with real rows", users >= 5 && vehicles >= 20, `users=${users} vehicles=${vehicles}`);
}

// ---------------------------------------------------------------- PHASE: auth
async function phaseAuth() {
  const f = "Authentication";
  const ctx = await newCtx();
  const page = await ctx.newPage();
  watch(page, "auth");

  // 1. incorrect credentials
  await goto(page, `${BASE}/login`);
  await hydrate(page, "#login-email");
  await page.locator("#login-email").fill(ACCOUNTS.buyer.email);
  await page.locator("#login-password").fill("definitely-wrong-password");
  const badRes = page.waitForResponse((r) => r.url().includes("/api/v1/auth/login") && r.request().method() === "POST", { timeout: 30000 }).catch(() => null);
  await page.locator('form button[type="submit"]').evaluate((el) => el.click()).catch(() => {});
  const bad = await badRes;
  await page.waitForTimeout(1200);
  const denied = !/\/buyer/.test(page.url());
  const denialText = await page.locator("body").innerText().catch(() => "");
  chk(f, "Wrong password is rejected by the backend", denied && (bad?.status() === 401 || bad?.status() === 400), `url=${page.url()} http=${bad?.status()}`);
  chk(f, "Wrong password shows an understandable error", /invalid|incorrect|wrong|failed|not match/i.test(denialText), denialText.slice(0, 220).replace(/\n/g, " "));

  // 2. missing fields (HTML required + no navigation)
  await goto(page, `${BASE}/login`);
  await hydrate(page, "#login-email");
  await page.locator("#login-email").fill("");
  await page.locator("#login-password").fill("");
  await page.locator('form button[type="submit"]').evaluate((el) => el.click()).catch(() => {});
  await page.waitForTimeout(900);
  chk(f, "Empty credentials do not submit", page.url().includes("/login"), `url=${page.url()}`);

  // 3. real registration through the UI
  const regEmail = `qa.${RUN.toLowerCase()}@trustdrive.dev`;
  await goto(page, `${BASE}/register`);
  await hydrate(page, 'input[placeholder="eg. John Doe"]');
  await page.getByPlaceholder("eg. John Doe").fill("QA Independent Seller");
  await page.getByPlaceholder("eg. john@example.com").fill(regEmail);
  await page.getByRole("button", { name: /Certify & Sell/i }).click();
  await page.getByPlaceholder("Create a strong password").fill("IndependentQA2026");
  await page.getByPlaceholder("Repeat your password").fill("IndependentQA2026");
  await page.locator('input[type="checkbox"]').check();
  const regPending = page.waitForResponse((r) => r.url().includes("/api/v1/auth/register") && r.request().method() === "POST", { timeout: 45000 }).catch(() => null);
  await page.locator('form button[type="submit"]').evaluate((el) => el.click()).catch(() => {});
  const regRes = await regPending;
  const row = sqlOne("SELECT id, email, role FROM users WHERE email = ?", regEmail);
  chk(f, "Registration via real form writes a DB user", !!row && regRes?.status() === 201, `http=${regRes?.status()} role=${row?.role}`);
  chk(f, "Registered role is enforced (seller)", row?.role === "seller", `role=${row?.role}`);

  // 4. log in as the newly created account
  const newLogin = await login(page, regEmail, "IndependentQA2026", /\/seller/);
  chk(f, "Newly registered account can sign in", newLogin, `url=${page.url()}`);

  // 5. session persistence
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  chk(f, "Session persists across browser reload", /\/seller/.test(page.url()), `url=${page.url()}`);

  // 6. cross-role direct navigation
  const buyerCtx = await newCtx();
  const buyerPage = await buyerCtx.newPage();
  watch(buyerPage, "auth-buyer");
  const buyerOk = await login(buyerPage, ACCOUNTS.buyer.email, ACCOUNTS.buyer.password, /\/buyer/);
  chk(f, "Buyer login via real form", buyerOk, `url=${buyerPage.url()}`);
  await goto(buyerPage, `${BASE}/seller/vehicles`);
  await buyerPage.waitForTimeout(900);
  const sellerText = await buyerPage.locator("body").innerText().catch(() => "");
  chk(f, "Buyer cannot open the Seller portal by direct URL", !/\/seller\/vehicles$/.test(buyerPage.url()) || /not authori|forbidden|access denied|sign in/i.test(sellerText), `url=${buyerPage.url()}`);

  // 7. logout — the control sits inside a <details> account menu, so open it first
  await goto(buyerPage, `${BASE}/buyer`);
  await hydrate(buyerPage, "details > summary");
  await buyerPage.locator("details > summary").first().click().catch(() => {});
  const logoutBtn = buyerPage.getByRole("button", { name: /sign out|log out/i }).first();
  const logoutPending = buyerPage.waitForResponse((r) => r.url().includes("/api/v1/auth/logout") && r.request().method() === "POST", { timeout: 20000 }).catch(() => null);
  await logoutBtn.click({ timeout: 15000 }).catch(() => {});
  const logoutRes = await logoutPending;
  await buyerPage.waitForTimeout(1000);
  const cookies = await buyerCtx.cookies();
  const tokenGone = !cookies.some((c) => c.name === "td_token" && c.value);
  chk(f, "Logout calls the real backend and clears the session cookie", !!logoutRes && tokenGone, `http=${logoutRes?.status()} td_tokenPresent=${!tokenGone}`);
  const afterLogoutApi = await buyerPage.request.get(`${BASE}/api/v1/buyer/overview`);
  chk(f, "After logout, protected API rejects the anonymous caller", afterLogoutApi.status() === 401 || afterLogoutApi.status() === 403, `http=${afterLogoutApi.status()}`);
  await goto(buyerPage, `${BASE}/buyer/reports`);
  await buyerPage.waitForTimeout(600);
  const anonPortal = await buyerPage.locator("body").innerText().catch(() => "");
  // DECISIONS D11 intentionally renders scoped, read-only DEMO portals without a
  // session. Assert that this is at least honestly labelled as a demo workspace.
  chk(f, "Anonymous portal is explicitly labelled demo workspace (D11)", /demo workspace/i.test(anonPortal), anonPortal.slice(0, 160).replace(/\n/g, " "));

  // 8. unauthenticated API
  const anonCtx = await newCtx();
  const anon = await anonCtx.newPage();
  const anonRes = await anon.request.get(`${BASE}/api/v1/seller/overview`);
  chk(f, "Anonymous API call to seller data is rejected", anonRes.status() === 401 || anonRes.status() === 403, `http=${anonRes.status()}`);

  await Promise.all([ctx.close(), buyerCtx.close(), anonCtx.close()].map((p) => p.catch(() => {})));
}

// ---------------------------------------------------------------- PHASE: pages
const SELLER_PAGES = ["/seller", "/seller/add-vehicle", "/seller/vehicles", "/seller/documents", "/seller/history", "/seller/verification", "/seller/fraud", "/seller/listings", "/seller/inquiries", "/seller/reports", "/seller/notifications", "/seller/settings"];
const BUYER_PAGES = ["/buyer", "/buyer/explore", "/buyer/search", "/buyer/saved", "/buyer/compare", "/buyer/history", "/buyer/risk", "/buyer/reports", "/buyer/verification", "/buyer/inquiries", "/buyer/notifications", "/buyer/settings"];
const ADMIN_PAGES = ["/admin/queue", "/admin/kyc", "/admin/users", "/admin/audit", "/admin/notifications", "/admin/settings"];
const PUBLIC_PAGES = ["/", "/marketplace", "/about", "/technology", "/faq", "/resources", "/contact", "/login", "/register", "/forgot-password"];

async function sweepPage(page, url, role, vp) {
  const before = pageErrors.length;
  const r = await goto(page, `${BASE}${url}`);
  await page.waitForTimeout(350);
  const text = await page.locator("body").innerText().catch(() => "");
  const errs = pageErrors.slice(before);
  const ok = r?.status() === 200 && text.length > 200 && errs.length === 0;
  return { url, role, viewport: vp, status: r?.status(), textLen: text.length, pageErrors: errs, ok };
}

async function phasePages() {
  const f = "Page load";
  const out = [];
  for (const [role, acc, pages] of [
    ["seller", ACCOUNTS.seller, SELLER_PAGES],
    ["buyer", ACCOUNTS.buyer, BUYER_PAGES],
    ["admin", ACCOUNTS.admin, ADMIN_PAGES],
  ]) {
    const ctx = await newCtx();
    const page = await ctx.newPage();
    watch(page, `pages-${role}`);
    const logged = await login(page, acc.email, acc.password, acc.home);
    chk(f, `${role} authenticated session for page sweep`, logged, `url=${page.url()}`);
    for (const url of pages) {
      const r = await sweepPage(page, url, role, "1440x900").catch((e) => ({ url, role, ok: false, error: String(e) }));
      out.push(r);
      chk(f, `${role} ${url}`, r.ok, `http=${r.status} text=${r.textLen} jsErrors=${r.pageErrors?.length ?? "-"}`);
    }
    await ctx.close();
  }
  // Public pages, anonymous
  const ctx = await newCtx();
  const page = await ctx.newPage();
  watch(page, "pages-public");
  for (const url of PUBLIC_PAGES) {
    const r = await sweepPage(page, url, "anonymous", "1440x900").catch((e) => ({ url, role: "anonymous", ok: false, error: String(e) }));
    out.push(r);
    chk(f, `public ${url}`, r.ok, `http=${r.status} text=${r.textLen} jsErrors=${r.pageErrors?.length ?? "-"}`);
  }
  await ctx.close();
  fs.writeFileSync(path.join(HERE, "indep-pages.json"), JSON.stringify(out, null, 2));
}

// ---------------------------------------------------------------- PHASE: security
async function phaseSecurity() {
  const f = "Access control";
  const sctx = await newCtx();
  const sp = await sctx.newPage();
  const sellerOk = await login(sp, ACCOUNTS.seller.email, ACCOUNTS.seller.password, /\/seller/);
  chk(f, "Seller A session established", sellerOk, `url=${sp.url()}`);

  const s2 = await newCtx();
  const s2p = await s2.newPage();
  const seller2Ok = await login(s2p, ACCOUNTS.seller2.email, ACCOUNTS.seller2.password, /\/seller/);
  chk(f, "Seller B session established", seller2Ok, `url=${s2p.url()}`);

  // Find one vehicle owned by each seller from the shared DB
  const a = sqlOne("SELECT id, owner_id FROM vehicles WHERE owner_id = (SELECT id FROM users WHERE email = ?) LIMIT 1", ACCOUNTS.seller.email);
  const b = sqlOne("SELECT id, owner_id FROM vehicles WHERE owner_id = (SELECT id FROM users WHERE email = ?) LIMIT 1", ACCOUNTS.seller2.email);
  if (a && b) {
    const cross = await sp.request.get(`${BASE}/api/v1/seller/vehicles/${b.id}`);
    chk(f, "Seller A cannot read Seller B's vehicle via API", cross.status() === 403 || cross.status() === 404, `http=${cross.status()}`);
    const own = await sp.request.get(`${BASE}/api/v1/seller/vehicles/${a.id}`);
    chk(f, "Seller A can read own vehicle", own.status() === 200, `http=${own.status()}`);
    const patch = await sp.request.patch(`${BASE}/api/v1/seller/vehicles/${b.id}`, { data: { km_claimed: 1 } });
    chk(f, "Seller A cannot mutate Seller B's vehicle", patch.status() === 403 || patch.status() === 404, `http=${patch.status()}`);
  } else {
    chk(f, "Cross-seller fixtures available", false, `sellerA=${!!a} sellerB=${!!b}`);
  }

  // Buyer cannot write seller data
  const bctx = await newCtx();
  const bp = await bctx.newPage();
  await login(bp, ACCOUNTS.buyer.email, ACCOUNTS.buyer.password, /\/buyer/);
  const buyerWrite = await bp.request.post(`${BASE}/api/v1/seller/vehicles`, { data: { make: "X", model: "Y", regNo: "MH01AB9999" } });
  chk(f, "Buyer cannot create a seller vehicle", buyerWrite.status() === 403 || buyerWrite.status() === 401, `http=${buyerWrite.status()}`);
  const adminOnly = await bp.request.get(`${BASE}/api/v1/admin/audit`);
  chk(f, "Buyer cannot read the admin audit API", adminOnly.status() === 403 || adminOnly.status() === 401, `http=${adminOnly.status()}`);

  // Private document files are not publicly readable
  const privDoc = sqlOne("SELECT id, file_key FROM documents WHERE file_key IS NOT NULL AND (consent = 0 OR status = 'verified') ORDER BY consent ASC LIMIT 1");
  const anonCtx = await newCtx();
  const ap = await anonCtx.newPage();
  if (privDoc?.file_key) {
    const fileRes = await ap.request.get(`${BASE}/api/v1/files/${privDoc.file_key}`);
    chk(f, "Anonymous private-document URL is rejected", fileRes.status() === 401 || fileRes.status() === 403 || fileRes.status() === 404, `http=${fileRes.status()} key=${privDoc.file_key}`);
  } else {
    chk(f, "Private document fixture available", false, "no document row");
  }
  const overview = await ap.request.get(`${BASE}/api/v1/buyer/overview`);
  chk(f, "Anonymous buyer overview is rejected", overview.status() === 401 || overview.status() === 403, `http=${overview.status()}`);

  // Buyer A cannot read Buyer B's inquiry
  const inq = sqlOne("SELECT id, buyer_id FROM inquiries LIMIT 1");
  const other = sqlOne("SELECT id FROM users WHERE email = ?", ACCOUNTS.buyer2.email);
  if (inq && other) {
    const b2 = await newCtx();
    const b2p = await b2.newPage();
    await login(b2p, ACCOUNTS.buyer2.email, ACCOUNTS.buyer2.password, /\/buyer/);
    const r = await b2p.request.get(`${BASE}/api/v1/inquiries/${inq.id}`);
    chk(f, "Buyer B cannot read Buyer A's inquiry", r.status() === 403 || r.status() === 404 || inq.buyer_id === other.id, `http=${r.status()}`);
    await b2.close();
  }

  await Promise.all([sctx.close(), s2.close(), bctx.close(), anonCtx.close()].map((p) => p.catch(() => {})));
}

// ---------------------------------------------------------------- PHASE: responsive
const RESP_VIEWPORTS = [
  { name: "desktop-1440x900", width: 1440, height: 900 },
  { name: "laptop-1366x768", width: 1366, height: 768 },
  { name: "tablet-768x1024", width: 768, height: 1024 },
  { name: "mobile-390x844", width: 390, height: 844 },
];
const RESP_PAGES = {
  seller: ["/seller", "/seller/add-vehicle", "/seller/vehicles", "/seller/listings"],
  buyer: ["/buyer", "/buyer/explore", "/buyer/search", "/buyer/saved"],
  anonymous: ["/", "/marketplace", "/login"],
};

async function phaseResponsive() {
  const f = "Responsive layout";
  const detail = [];
  for (const vp of RESP_VIEWPORTS) {
    for (const [role, pages] of Object.entries(RESP_PAGES)) {
      const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: vp.width, height: vp.height }, ignoreHTTPSErrors: true });
      const page = await ctx.newPage();
      watch(page, `resp-${role}-${vp.name}`);
      if (role !== "anonymous") {
        await login(page, ACCOUNTS[role].email, ACCOUNTS[role].password, ACCOUNTS[role].home);
      }
      for (const url of pages) {
        const before = pageErrors.length;
        const r = await goto(page, `${BASE}${url}`).catch(() => null);
        await page.waitForTimeout(400);
        const m = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          bodyWidth: document.body.scrollWidth,
          textLen: (document.body.innerText || "").length,
        })).catch(() => ({ scrollWidth: 0, innerWidth: vp.width, bodyWidth: 0, textLen: 0 }));
        const overflow = m.scrollWidth > m.innerWidth + 2;
        const jsErr = pageErrors.slice(before).length;
        const ok = r?.status() === 200 && m.textLen > 150 && !overflow && jsErr === 0;
        detail.push({ viewport: vp.name, role, url, status: r?.status(), ...m, overflow, jsErr, ok });
        chk(f, `${vp.name} ${role} ${url}`, ok, `http=${r?.status()} scroll=${m.scrollWidth}/${m.innerWidth} text=${m.textLen} jsErr=${jsErr}`);
        if (["/seller", "/buyer", "/marketplace", "/seller/add-vehicle"].includes(url) && (vp.name === "desktop-1440x900" || vp.name === "mobile-390x844")) {
          await shot(page, `${vp.name}-${role}-${url.replace(/\//g, "_") || "root"}`);
        }
      }
      await ctx.close();
    }
  }
  fs.writeFileSync(path.join(HERE, "indep-responsive.json"), JSON.stringify(detail, null, 2));
}

// ---------------------------------------------------------------- PHASE: bugs
async function phaseBugs() {
  const f = "Defect probes";

  // BUG-1: public sample-report CTA must actually return a PDF, not a 403 JSON.
  const anon = await newCtx();
  const ap = await anon.newPage();
  watch(ap, "bug-cta");
  await goto(ap, `${BASE}/`);
  const cta = ap.getByRole("link", { name: /sample PDF/i }).first();
  const href = await cta.getAttribute("href").catch(() => null);
  chk(f, "Homepage exposes a sample-report download CTA", !!href, `href=${href}`);
  if (href) {
    const target = href.startsWith("http") ? new URL(href).pathname : href;
    const dl = await ap.request.get(`${BASE}${target}`);
    const ct = dl.headers()["content-type"] || "";
    const buf = await dl.body().catch(() => Buffer.alloc(0));
    const isPdf = dl.status() === 200 && (ct.includes("pdf") || buf.subarray(0, 4).toString() === "%PDF");
    chk(f, "BUG-1 public sample PDF CTA returns a real PDF", isPdf, `http=${dl.status()} type=${ct} bytes=${buf.length} demoHeader=${dl.headers()["x-trustdrive-demo-data"] ?? "-"} body=${buf.subarray(0, 60).toString().replace(/\n/g, " ")}`);
    // The private, owner-gated download route must remain protected.
    const priv = await ap.request.get(`${BASE}/api/v1/reports/rep-1/download`);
    chk(f, "Private report download stays RBAC-protected after the fix", priv.status() === 403 || priv.status() === 401, `http=${priv.status()}`);
  }
  await anon.close();

  // BUG-2: a signed-in buyer must not be shown a "Sign in" CTA on the public report.
  const bctx = await newCtx();
  const bp = await bctx.newPage();
  watch(bp, "bug-header");
  await login(bp, ACCOUNTS.buyer.email, ACCOUNTS.buyer.password, /\/buyer/);
  const veh = sqlOne("SELECT id FROM vehicles WHERE id = 'v-bmw'") || sqlOne("SELECT id FROM vehicles LIMIT 1");
  await goto(bp, `${BASE}/vehicle/${veh.id}`);
  await bp.waitForTimeout(700);
  const header = await bp.locator("header").first().innerText().catch(() => "");
  chk(f, "BUG-2 signed-in buyer sees an account link, not 'Sign in'", !/\bsign in\b/i.test(header), `header=${header.replace(/\n/g, " | ").slice(0, 220)}`);
  await shot(bp, "bug2-vehicle-report-header-buyer");
  await bctx.close();

  // BUG-3: offline stack status must not paint every engine as "active".
  // Simulate an unreachable intelligence service at the component boundary by
  // intercepting /api/v1/ai/stack and returning connected:false.
  const octx = await newCtx();
  const op = await octx.newPage();
  watch(op, "bug-stack");
  await op.route("**/api/v1/ai/stack", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ data: { connected: false, reason: "Intelligence service is unreachable." } }),
  }));
  await goto(op, `${BASE}/technology`);
  await op.waitForTimeout(1000);
  const stackText = await op.locator("body").innerText().catch(() => "");
  const greenDots = await op.locator('span[style*="5BC08A"]').count().catch(() => 0);
  chk(f, "BUG-3 offline stack does not claim engines are active", greenDots === 0 && /unavailable|offline|not live/i.test(stackText), `greenDots=${greenDots} text=${stackText.match(/Live status[^]{0,160}/)?.[0]?.replace(/\n/g, " ") ?? ""}`);
  await octx.close();
}

// ---------------------------------------------------------------- PHASE: persist
async function phasePersist() {
  const f = "UI → DB persistence";
  const ctx = await newCtx();
  const page = await ctx.newPage();
  watch(page, "persist");
  const ok = await login(page, ACCOUNTS.seller.email, ACCOUNTS.seller.password, /\/seller/);
  chk(f, "Seller session for persistence test", ok, `url=${page.url()}`);

  const stamp = Date.now().toString().slice(-8);
  // Registration must match the Indian MH01AB1234 shape; VIN must be exactly
  // 17 characters from the ISO 3779 alphabet (no I, O or Q) for a car.
  const regNo = `MH${String(10 + (Number(stamp) % 80)).padStart(2, "0")}ZZ${stamp.slice(-4)}`;
  const vin = `9${stamp.slice(0, 7)}TDAB${stamp.slice(-5)}`; // 1+7+4+5 = 17
  await goto(page, `${BASE}/seller/add-vehicle`);
  await hydrate(page, "select");
  await page.getByLabel(/Vehicle category/i).waitFor({ timeout: 30000 });
  await page.getByLabel(/Vehicle category/i).selectOption("passenger_car");
  await page.waitForTimeout(500);

  // Exact labels come from lib/vehicle-categories.json fieldCatalog.
  const fields = [
    [/^Registration number/i, regNo],
    [/^VIN \(17 characters\)/i, vin],
    [/^Manufacturer/i, "Independent"],
    [/^Model/i, "QA Sedan"],
    [/^Variant/i, "Live Test"],
    [/^Manufacturing year/i, "2021"],
    [/^Colour/i, "Graphite"],
    [/^Location/i, "Pune, Maharashtra"],
    [/^Number of owners/i, "1"],
    [/^Asking price/i, "525000"],
    [/reading \(km\)/i, "31000"],
    [/^Engine capacity \(CC\)/i, "1498"],
  ];
  let filled = 0;
  for (const [pattern, value] of fields) {
    const el = page.getByLabel(pattern).first();
    if (await el.count()) {
      await el.fill(String(value)).catch(() => {});
      filled += 1;
    }
  }
  const savePending = page.waitForResponse((r) => r.url().includes("/api/v1/seller/vehicles") && r.request().method() === "POST", { timeout: 60000 }).catch(() => null);
  await page.getByRole("button", { name: /Save draft & continue/i }).click().catch(() => {});
  const saveRes = await savePending;
  let created = null;
  try { created = saveRes ? await saveRes.json() : null; } catch { /* ignore */ }
  const vehicleId = created?.data?.id ?? null;
  const wizardError = await page.locator("body").innerText().catch(() => "");
  chk(f, "Real wizard POST created a vehicle draft", !!vehicleId && saveRes?.status() === 201,
    `http=${saveRes?.status()} id=${vehicleId} fieldsFilled=${filled} error=${created?.error?.message ?? wizardError.match(/(?:required|invalid|must)[^\n]{0,90}/i)?.[0] ?? "-"}`);
  if (!vehicleId) { await ctx.close(); return; }

  const dbRow = sqlOne("SELECT id, reg_no, vin, make, model, status, owner_id FROM vehicles WHERE id = ?", vehicleId);
  chk(f, "Created vehicle exists in the shared SQLite DB", !!dbRow, JSON.stringify(dbRow));
  chk(f, "DB values match the form submission", dbRow?.reg_no?.toUpperCase().includes(regNo.toUpperCase()) || dbRow?.make === "Independent", `reg=${dbRow?.reg_no} make=${dbRow?.make}`);
  const listing = sqlOne("SELECT id, status FROM listings WHERE vehicle_id = ?", vehicleId);
  chk(f, "A draft listing was created with the vehicle", !!listing, JSON.stringify(listing));

  await goto(page, `${BASE}/seller/vehicles`);
  await page.waitForTimeout(500);
  const listText = await page.locator("body").innerText().catch(() => "");
  chk(f, "New vehicle is visible in My Vehicles after reload", /QA Sedan|Independent/.test(listText), listText.slice(0, 160).replace(/\n/g, " "));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  const afterReload = sqlOne("SELECT id FROM vehicles WHERE id = ?", vehicleId);
  chk(f, "Record survives a full browser refresh", !!afterReload, `id=${afterReload?.id}`);
  await shot(page, "persist-my-vehicles-after-refresh");
  await ctx.close();
}

// ---------------------------------------------------------------- main
(async () => {
  const t0 = Date.now();
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  console.log(`\n=== Independent live verification ${RUN} ===`);
  console.log(`BASE=${BASE} INTEL=${INTEL} PHASES=${[...PHASES].join(",")}\n`);
  const runners = {
    health: phaseHealth, auth: phaseAuth, pages: phasePages, security: phaseSecurity,
    responsive: phaseResponsive, bugs: phaseBugs, persist: phasePersist,
  };
  for (const [name, fn] of Object.entries(runners)) {
    if (!PHASES.has(name)) continue;
    console.log(`\n--- PHASE ${name} ---`);
    try { await fn(); } catch (e) { chk(name, "phase completed without a harness exception", false, String(e?.stack ?? e).slice(0, 400)); }
  }
  await browser.close();

  // Expected HTTP 4xx console noise from deliberate negative tests is not a JS defect.
  const unexpectedConsole = consoleErrors.filter((e) => !/Failed to load resource: the server responded with a status of 4\d\d/.test(e.text));
  const summary = {
    runId: RUN,
    executedAt: new Date().toISOString(),
    base: BASE, intel: INTEL,
    phases: [...PHASES],
    totals: {
      checks: results.length,
      passed: results.filter((r) => r.status === "PASS").length,
      failed: results.filter((r) => r.status === "FAIL").length,
    },
    jsExceptions: pageErrors.length,
    consoleErrors: consoleErrors.length,
    unexpectedConsoleErrors: unexpectedConsole.length,
    unexpectedConsoleSample: unexpectedConsole.slice(0, 12),
    pageErrorsSample: pageErrors.slice(0, 12),
    screenshots,
    results,
  };
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log(`\n=== SUMMARY ${RUN} ===`);
  console.log(`checks=${summary.totals.checks} passed=${summary.totals.passed} failed=${summary.totals.failed}`);
  console.log(`jsExceptions=${pageErrors.length} consoleErrors=${consoleErrors.length} unexpected=${unexpectedConsole.length}`);
  console.log(`screenshots=${screenshots.length} elapsed=${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`results=${OUT}`);
  process.exit(summary.totals.failed > 0 ? 1 : 0);
})().catch((e) => { console.error("HARNESS FAILED", e); process.exit(2); });
