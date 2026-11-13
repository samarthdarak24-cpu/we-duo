// Live E2E CRUD harness — real Chromium against the running Next.js frontend.
// Every test: browser UI action -> capture API response -> assert SQLite row -> assert UI update.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "../..");
// Playwright is installed under frontend/node_modules; resolve it from there.
const frontendRequire = createRequire(path.join(ROOT, "frontend", "package.json"));
const { chromium } = frontendRequire("@playwright/test");
export const BASE = process.env.TD_BASE_URL || "http://127.0.0.1:3000";
export const DB_FILE = path.join(ROOT, ".data", "trustdrive.db");

/**
 * Wait until the app answers again. `next dev` can restart on its own while a
 * suite runs; a refused connection is an environment event, not a product
 * defect, so the runner must recover instead of failing every later step.
 */
export async function awaitServer(ms = 120000) {
  const started = Date.now();
  for (;;) {
    try {
      const res = await fetch(`${BASE}/api/v1/health/ready`, { signal: AbortSignal.timeout(6000) });
      if (res.ok) return true;
    } catch {
      /* still restarting */
    }
    if (Date.now() - started > ms) return false;
    await new Promise((r) => setTimeout(r, 2000));
  }
}
export const SHOTS = path.join(__dirname, "shots");
export const RESULTS = path.join(__dirname, "results");

for (const d of [SHOTS, RESULTS]) fs.mkdirSync(d, { recursive: true });

export const ACCOUNTS = {
  seller: { email: "samarth@trustdrive.dev", password: "demo123456", home: /\/seller/ },
  // u-seller2 — the seeded dealer account. aditya@ is a buyer, so it can never
  // stand in for a second seller in a same-role/different-owner probe.
  seller2: { email: "weduo@trustdrive.dev", password: "demo123456", home: /\/seller/ },
  buyer: { email: "rohan@trustdrive.dev", password: "demo123456", home: /\/buyer/ },
  buyer2: { email: "priya@trustdrive.dev", password: "demo123456", home: /\/buyer/ },
  admin: { email: "admin@trustdrive.dev", password: "demo123456", home: /\/admin/ },
};

/** Read-only SQL against the SAME database the Next.js runtime writes to. */
export function sql(query, ...params) {
  const db = new DatabaseSync(DB_FILE, { readOnly: true });
  try {
    return db.prepare(query).all(...params);
  } finally {
    db.close();
  }
}

export function sqlOne(query, ...params) {
  return sql(query, ...params)[0] ?? null;
}

/** Cleanup-only: remove rows created by the live test so seed data stays pristine. */
export function sqlExec(query, ...params) {
  const db = new DatabaseSync(DB_FILE);
  try {
    db.exec("PRAGMA busy_timeout = 10000");
    return db.prepare(query).run(...params);
  } finally {
    db.close();
  }
}

let browserInstance;

export async function launchBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return browserInstance;
}

export async function newContext(opts = {}) {
  const browser = await launchBrowser();
  const context = await browser.newContext({
    baseURL: BASE,
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    ...opts,
  });
  // `next dev` compiles a route on its first hit, which can exceed 25 s on this
  // machine. The 30 s Playwright default then fails for reasons unrelated to the
  // feature under test, so raise the floor for navigation and action waits.
  context.setDefaultNavigationTimeout(120000);
  context.setDefaultTimeout(60000);
  // Keep a copy of every same-origin API payload the app's own fetch() received.
  // Playwright drops a response body when the page navigates immediately after it.
  await context.addInitScript(() => {
    window.__tdApiCapture = [];
    const orig = window.fetch;
    window.fetch = async function (...args) {
      const res = await orig.apply(this, args);
      try {
        const url = typeof args[0] === "string" ? args[0] : String(args[0]?.url || "");
        if (url.includes("/api/")) {
          const text = await res.clone().text();
          window.__tdApiCapture.push({ url, status: res.status, text, method: (args[1]?.method || "GET").toUpperCase() });
          try { sessionStorage.setItem("__tdApiCapture", JSON.stringify(window.__tdApiCapture)); } catch { /* storage disabled */ }
        }
      } catch { /* ignore capture failures */ }
      return res;
    };
  });
  return context;
}

export async function capturedApi(page, urlPart) {
  const list = await page.evaluate(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem("__tdApiCapture") || "[]");
      return saved.length ? saved : (window.__tdApiCapture || []);
    } catch { return window.__tdApiCapture || []; }
  });
  return list.filter((x) => x.url.includes(urlPart));
}

/** Wait until React has hydrated a node, so clicks hit real handlers (not native form GET). */
export async function waitForHydration(page, selector = "#login-email") {
  const el = page.locator(selector).first();
  await el.waitFor({ state: "visible", timeout: 90000 });
  await page.waitForFunction(
    (sel) => {
      const n = document.querySelector(sel);
      return !!n && Object.keys(n).some((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactProps$"));
    },
    selector,
    { timeout: 90000, polling: 500 }
  ).catch(() => {});
}

/**
 * Navigate without failing when a cold Next.js dev server abandons the initial
 * HTML request mid-compile but leaves the route rendered client-side.
 */
export async function gotoSafe(page, url, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
      return;
    } catch (err) {
      lastError = err;
      if (page.url().startsWith(url.split("?")[0])) {
        await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
        return;
      }
      if (/ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE|ERR_NETWORK_CHANGED/.test(String(err.message))) {
        await awaitServer();
      }
      await page.waitForTimeout(1500 * attempt);
    }
  }
  throw lastError;
}

/**
 * Sign in through the REAL login form (not by injecting a cookie).
 * Retries because a cold dev server can serve /login un-hydrated, which makes
 * the first submit a plain GET with no POST response to wait for.
 */
export async function loginViaUI(page, role = "seller", attempts = 4) {
  const acc = ACCOUNTS[role];
  if (!acc) throw new Error(`unknown role ${role}`);
  let lastStatus = null;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await gotoSafe(page, `${BASE}/login`);
      // A previous attempt may already have signed in; the redirect away from
      // /login is the proof, so do not fail on a missing form.
      if (acc.home.test(page.url())) {
        const me = await page.evaluate(async () => {
          const r = await fetch("/api/v1/me", { credentials: "same-origin" });
          return { status: r.status };
        }).catch(() => ({ status: 0 }));
        if (me.status === 200) {
          return { status: 200, body: null, url: page.url(), cookies: await page.context().cookies() };
        }
      }
      await waitForHydration(page, "#login-email").catch(() => {});
      await page.locator("#login-email").fill(acc.email);
      await page.locator("#login-password").fill(acc.password);
      const responsePromise = page
        .waitForResponse(
          (r) => r.url().includes("/api/v1/auth/login") && r.request().method() === "POST",
          { timeout: 60000 }
        )
        .catch(() => null);
      // evaluate().click() hits the React handler even when the button is still
      // covered by an entering animation that Playwright's actionability check
      // would wait out.
      await page.locator('form button[type="submit"]').evaluate((el) => el.click()).catch(() => {});
      const res = await responsePromise;
      lastStatus = res ? res.status() : null;
      if (res && res.status() === 200) {
        await page.waitForURL(acc.home, { timeout: 45000 }).catch(() => {});
        await page.waitForLoadState("domcontentloaded").catch(() => {});
        await page.waitForTimeout(600);
        const captured = await capturedApi(page, "/api/v1/auth/login").catch(() => []);
        let body = null;
        try { body = JSON.parse(captured[captured.length - 1]?.text || "null"); } catch { /* keep null */ }
        return { status: res.status(), body, url: page.url(), cookies: await page.context().cookies() };
      }
    } catch (err) {
      lastError = err;
    }
    await page.waitForTimeout(1500 * attempt);
  }
  throw new Error(
    `${role} login failed after ${attempts} attempts (last HTTP ${lastStatus ?? "no response"}, url=${page.url()})` +
    (lastError ? ` lastError=${String(lastError.message ?? lastError).split("\n")[0]}` : "")
  );
}

/** Same-origin fetch from inside the real browser page (session cookie included). */
export async function api(page, method, pathname, body) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await page.evaluate(
        async ({ method, pathname, body }) => {
          const res = await fetch(pathname, {
            method,
            headers: body === undefined ? {} : { "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
            credentials: "same-origin",
          });
          const text = await res.text();
          let json = null;
          try { json = JSON.parse(text); } catch { /* non-JSON (PDF etc.) */ }
          return { status: res.status, ok: res.ok, json, text: text.slice(0, 4000), headers: Object.fromEntries(res.headers.entries()) };
        },
        { method, pathname, body }
      );
    } catch (err) {
      // A client-side redirect can destroy the execution context between the
      // login POST and the first API call, and `next dev` can restart mid-suite.
      // Wait for the app to answer again, then retry from the browser.
      if (attempt === 3) {
        await awaitServer();
        throw err;
      }
      if (!(await awaitServer(60000))) throw err;
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await new Promise((r) => setTimeout(r, 700));
    }
  }
  throw new Error("unreachable");
}

/**
 * Remove a test vehicle without fighting the immutable chain_records ledger.
 * The app never hard-deletes a vehicle that has been updated (its chain record
 * makes the row immutable), so we archive (soft-delete) via the app's own API
 * in that case. Returns whether the row was hard-removed or archived.
 */
export async function cleanupVehicle(page, id) {
  if (!id) return { removed: false, archived: false };
  try { sqlExec("DELETE FROM listings WHERE vehicle_id = ?", id); } catch { /* ignore */ }
  try { sqlExec("DELETE FROM audit_logs WHERE entity_type = 'vehicle' AND entity_id = ?", id); } catch { /* ignore */ }
  let removed = false;
  try {
    const r = sqlExec("DELETE FROM vehicles WHERE id = ?", id);
    removed = (r?.changes ?? 0) > 0;
  } catch { removed = false; }
  if (removed) return { removed: true, archived: false };
  const del = await api(page, "DELETE", `/api/v1/seller/vehicles/${id}`).catch(() => null);
  const row = sqlOne("SELECT status FROM vehicles WHERE id = ?", id);
  return { removed: false, archived: row?.status === "archived", apiStatus: del?.status };
}

/** Poll a condition that the app satisfies asynchronously (OCR, job status). */
export async function until(fn, ms = 30000, every = 800) {
  const started = Date.now();
  let last = null;
  for (;;) {
    last = await fn();
    if (last) return last;
    if (Date.now() - started > ms) return null;
    await new Promise((r) => setTimeout(r, every));
  }
}

/** Multipart POST from inside the real page (same origin, real session cookie). */
export async function uiUpload(page, pathname, fields, files) {
  return page.evaluate(
    async ({ pathname, fields, files }) => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields ?? {})) fd.append(k, String(v));
      for (const f of files) {
        const bin = atob(f.b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
        fd.append(f.field, new File([bytes], f.name, { type: f.type }));
      }
      const res = await fetch(pathname, { method: "POST", body: fd, credentials: "same-origin" });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* keep raw */ }
      return { status: res.status, json, text: text.slice(0, 3000) };
    },
    { pathname, fields, files }
  );
}

/** Attach a network recorder so we can prove which API calls the UI actually made. */
export function recordNetwork(page) {
  const calls = [];
  page.on("response", (r) => {
    const u = r.url();
    if (u.includes("/api/")) {
      calls.push({ method: r.request().method(), url: u.replace(BASE, ""), status: r.status() });
    }
  });
  return calls;
}

export class Recorder {
  constructor(featureId, featureName) {
    this.featureId = featureId;
    this.featureName = featureName;
    this.checks = [];
    this.notes = [];
    this.errors = [];
    this.startedAt = new Date().toISOString();
  }
  check(op, label, condition, detail = "") {
    const ok = !!condition;
    this.checks.push({ op, label, ok, detail: String(detail).slice(0, 800) });
    console.log(`  ${ok ? "PASS" : "FAIL"} [${op}] ${label}${detail ? ` :: ${String(detail).slice(0, 220)}` : ""}`);
    return ok;
  }
  note(text) { this.notes.push(text); console.log(`  NOTE ${text}`); }
  error(where, err) {
    const msg = err?.stack || err?.message || String(err);
    this.errors.push({ where, msg });
    console.log(`  ERROR @${where}: ${String(msg).split("\n")[0]}`);
  }
  get passed() { return this.errors.length === 0 && this.checks.every((c) => c.ok) && this.checks.length > 0; }
  finish() {
    const out = {
      featureId: this.featureId,
      featureName: this.featureName,
      passed: this.passed,
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      total: this.checks.length,
      failed: this.checks.filter((c) => !c.ok).length,
      errors: this.errors,
      notes: this.notes,
      checks: this.checks,
    };
    fs.writeFileSync(path.join(RESULTS, `${this.featureId}.json`), JSON.stringify(out, null, 2));
    console.log(`\n=== ${this.featureId} ${this.featureName}: ${out.passed ? "PASS" : "FAIL"} (${out.total - out.failed}/${out.total} checks, ${out.errors.length} errors) ===`);
    return out;
  }
}

export async function shot(page, name) {
  const p = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false }).catch(() => {});
  return p;
}

/** Run a named step, capture exceptions, continue. */
export async function step(rec, op, label, fn) {
  try {
    return await fn();
  } catch (e) {
    rec.error(`${op}:${label}`, e);
    return null;
  }
}

export async function closeAll() {
  if (browserInstance?.isConnected()) await browserInstance.close();
  browserInstance = undefined;
}

export const uid = (prefix = "QA") => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
