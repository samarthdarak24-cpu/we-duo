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
export const SHOTS = path.join(__dirname, "shots");
export const RESULTS = path.join(__dirname, "results");

for (const d of [SHOTS, RESULTS]) fs.mkdirSync(d, { recursive: true });

export const ACCOUNTS = {
  seller: { email: "samarth@trustdrive.dev", password: "demo1234", home: /\/seller/ },
  seller2: { email: "aditya@trustdrive.dev", password: "demo1234", home: /\/seller/ },
  buyer: { email: "rohan@trustdrive.dev", password: "demo1234", home: /\/buyer/ },
  buyer2: { email: "priya@trustdrive.dev", password: "demo1234", home: /\/buyer/ },
  admin: { email: "admin@trustdrive.dev", password: "demo1234", home: /\/admin/ },
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
  return browser.newContext({
    baseURL: BASE,
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    ...opts,
  });
}

/** Wait until React has hydrated a node, so clicks hit real handlers (not native form GET). */
export async function waitForHydration(page, selector = "#login-email") {
  const el = page.locator(selector).first();
  await el.waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(
    (sel) => {
      const n = document.querySelector(sel);
      return !!n && Object.keys(n).some((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactProps$"));
    },
    selector,
    { timeout: 30000 }
  ).catch(() => {});
}

/** Sign in through the REAL login form (not by injecting a cookie). */
export async function loginViaUI(page, role = "seller") {
  const acc = ACCOUNTS[role];
  if (!acc) throw new Error(`unknown role ${role}`);
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page, "#login-email");
  await page.locator("#login-email").fill(acc.email);
  await page.locator("#login-password").fill(acc.password);
  const responsePromise = page.waitForResponse(
    (r) => r.url().includes("/api/v1/auth/login") && r.request().method() === "POST"
  );
  await page.locator('form button[type="submit"]').click();
  const loginResponse = await responsePromise;
  // Read the body BEFORE following the redirect; navigation disposes the response.
  const raw = await loginResponse.text().catch(() => "");
  let body = null;
  try { body = JSON.parse(raw); } catch { /* keep null */ }
  await page.waitForURL(acc.home, { timeout: 20000 }).catch(() => {});
  return {
    status: loginResponse.status(),
    body,
    url: page.url(),
    cookies: await page.context().cookies(),
  };
}

/** Same-origin fetch from inside the real browser page (session cookie included). */
export async function api(page, method, pathname, body) {
  return page.evaluate(
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
