/**
 * Live DOM reconnaissance for the CRUD sweep.
 *
 * Logs in as Seller and Buyer against a running TrustDrive instance and dumps
 * the interactive surface (forms, inputs, buttons, selects, links) of every
 * page that participates in a create / read / update / delete flow.
 *
 * Usage: node qa/crud/recon.mjs [baseUrl]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

// The Playwright package lives in frontend/node_modules; this script runs from
// the repo-root qa/ folder, so resolve it by absolute path instead of by name.
const pw = await import(pathToFileURL(path.join(ROOT, 'frontend', 'node_modules', 'playwright', 'index.js')).href);
const { chromium } = pw.chromium ? pw : pw.default;
const BASE = (process.argv[2] || process.env.CRUD_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const OUT = path.join(ROOT, 'qa', 'crud', 'recon.json');

const SELLER = { email: 'samarth@trustdrive.dev', password: 'demo123456' };
const BUYER = { email: 'rohan@trustdrive.dev', password: 'demo123456' };

const SELLER_PAGES = [
  ['/seller', 'seller-overview'],
  ['/seller/vehicles', 'seller-vehicles'],
  ['/seller/add-vehicle', 'seller-add-vehicle'],
  ['/seller/documents', 'seller-documents'],
  ['/seller/verification', 'seller-verification'],
  ['/seller/fraud', 'seller-fraud'],
  ['/seller/history', 'seller-history'],
  ['/seller/listings', 'seller-listings'],
  ['/seller/inquiries', 'seller-inquiries'],
  ['/seller/reports', 'seller-reports'],
  ['/seller/notifications', 'seller-notifications'],
  ['/seller/settings', 'seller-settings'],
];

const BUYER_PAGES = [
  ['/buyer', 'buyer-overview'],
  ['/buyer/explore', 'buyer-explore'],
  ['/buyer/search', 'buyer-search'],
  ['/buyer/history', 'buyer-history'],
  ['/buyer/risk', 'buyer-risk'],
  ['/buyer/reports', 'buyer-reports'],
  ['/buyer/compare', 'buyer-compare'],
  ['/buyer/saved', 'buyer-saved'],
  ['/buyer/inquiries', 'buyer-inquiries'],
  ['/buyer/notifications', 'buyer-notifications'],
  ['/buyer/settings', 'buyer-settings'],
  ['/buyer/verification', 'buyer-verification'],
];

async function dumpPage(page, url) {
  const res = await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 45000 }).catch((e) => {
    console.error('  goto failed', url, e.message);
    return null;
  });
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => {
    const txt = (el) => (el && el.textContent ? el.textContent : '').replace(/\s+/g, ' ').trim().slice(0, 90);
    const labelOf = (el) => {
      if (el.id) {
        const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (l) return txt(l);
      }
      const wrap = el.closest('label');
      if (wrap) return txt(wrap);
      const aria = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name');
      return aria ? String(aria).slice(0, 60) : '';
    };
    return {
      title: document.title,
      h1: txt(document.querySelector('h1')),
      url: location.href,
      forms: [...document.querySelectorAll('form')].map((f) => ({
        action: f.getAttribute('action') || '',
        method: (f.getAttribute('method') || 'get').toUpperCase(),
        id: f.id || '',
        testid: f.getAttribute('data-testid') || '',
        buttonText: txt(f.querySelector('button[type=submit], button:not([type])')),
      })),
      inputs: [...document.querySelectorAll('input, textarea, select')].map((i) => ({
        tag: i.tagName.toLowerCase(),
        type: i.getAttribute('type') || '',
        name: i.getAttribute('name') || '',
        id: i.id || '',
        label: labelOf(i),
        placeholder: i.getAttribute('placeholder') || '',
        options: i.tagName === 'SELECT' ? [...i.options].map((o) => o.text.trim()).slice(0, 20) : undefined,
      })),
      buttons: [...document.querySelectorAll('button, [role=button]')].map((b) => ({
        text: txt(b),
        type: b.getAttribute('type') || '',
        disabled: b.disabled === true,
        title: b.getAttribute('title') || b.getAttribute('aria-label') || '',
        testid: b.getAttribute('data-testid') || '',
      })).filter((b) => b.text || b.title),
      links: [...document.querySelectorAll('a[href]')].map((a) => ({
        text: txt(a),
        href: a.getAttribute('href'),
      })).filter((l) => l.text).slice(0, 60),
      buttonsNoText: [...document.querySelectorAll('button')]
        .filter((b) => !(b.textContent || '').trim())
        .map((b) => ({ title: b.getAttribute('title') || b.getAttribute('aria-label') || '(no label)', testid: b.getAttribute('data-testid') || '' })),
    };
  });
  return { status: res ? res.status() : 0, ...info };
}

async function login(page, creds, expectPath) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('#login-email', { timeout: 20000 });
  await page.fill('#login-email', creds.email);
  await page.fill('#login-password', creds.password);

  // Capture the auth API answer so a rejected login is diagnosable instead of
  // silently reporting "still on /login".
  const api = page.waitForResponse(
    (r) => r.url().includes('/api/v1/auth/login') && r.request().method() === 'POST',
    { timeout: 30000 }
  ).catch(() => null);

  const btn = page.locator('button[type=submit]').first();
  await btn.waitFor({ state: 'visible', timeout: 20000 });
  await btn.click();
  const resp = await api;
  let apiStatus = resp ? resp.status() : 'no-response';
  let apiBody = '';
  if (resp) {
    try { apiBody = (await resp.text()).slice(0, 220); } catch { /* body already consumed */ }
  }
  await page.waitForTimeout(2500);
  const ok = page.url().includes(expectPath);
  console.log(`  login ${creds.email} -> api=${apiStatus} url=${page.url()} ${ok ? 'OK' : 'UNEXPECTED'}`);
  if (!ok) console.log(`    api body: ${apiBody}`);
  const pageErr = await page.locator('[role=alert], .error, [data-error]').allTextContents().catch(() => []);
  if (pageErr.length) console.log(`    page error: ${pageErr.join(' | ').slice(0, 300)}`);
  return { ok, apiStatus, apiBody };
}

const browser = await chromium.launch({ headless: true });
const out = { base: BASE, at: new Date().toISOString(), pages: {}, logins: {} };

async function role(creds, expectPath, pages) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  const ok = await login(page, creds, expectPath);
  out.logins[creds.email] = { url: page.url(), ok: ok.ok, apiStatus: ok.apiStatus, apiBody: ok.apiBody };
  for (const [url, name] of pages) {
    console.log(`  ${name} ${url}`);
    const d = await dumpPage(page, url);
    d.consoleErrors = consoleErrors.splice(0);
    out.pages[name] = d;
  }
  await ctx.close();
}

console.log(`RECON base=${BASE}`);
await role(SELLER, '/seller', SELLER_PAGES);
await role(BUYER, '/buyer', BUYER_PAGES);

await browser.close();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`\nwrote ${OUT}`);
for (const [name, d] of Object.entries(out.pages)) {
  console.log(`${name.padEnd(24)} status=${d.status} forms=${d.forms.length} inputs=${d.inputs.length} buttons=${d.buttons.length} noTextBtns=${d.buttonsNoText.length}`);
}
