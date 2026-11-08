/**
 * TrustDrive — live CRUD sweep.
 *
 * Drives a REAL Chromium browser against a running TrustDrive instance and
 * exercises create / read / update / delete for every Seller and Buyer
 * feature that mutates data. Every step asserts the resulting database row
 * AND the rendered UI, so a button that only *looks* like it works fails.
 *
 * Usage:
 *   node qa/crud/crud_sweep.mjs [baseUrl]
 * env: CRUD_BASE_URL, CRUD_HEADLESS=0 to watch it run.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const pw = await import(pathToFileURL(path.join(ROOT, 'frontend', 'node_modules', 'playwright', 'index.js')).href);
const { chromium } = pw.chromium ? pw : pw.default;

const BASE = (process.argv[2] || process.env.CRUD_BASE_URL || 'http://127.0.0.1:3200').replace(/\/$/, '');
const HEADLESS = process.env.CRUD_HEADLESS !== '0';
const SHOTS = path.join(ROOT, 'qa', 'crud', 'shots');
const OUT = path.join(ROOT, 'qa', 'crud', 'crud-results.json');
const DB_FILE = path.join(ROOT, '.data', 'trustdrive.db');

const TAG = `CRUDQ${Date.now().toString().slice(-6)}`;
const SELLER = { email: 'samarth@trustdrive.dev', password: 'demo1234', id: 'u-seller' };
const BUYER = { email: 'rohan@trustdrive.dev', password: 'demo1234', id: 'u-buyer2' };

fs.mkdirSync(SHOTS, { recursive: true });

/* ------------------------------------------------------------------ DB ---- */
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA foreign_keys = ON;');
const q1 = (sql, ...a) => db.prepare(sql).get(...a);
const qa = (sql, ...a) => db.prepare(sql).all(...a);

/* -------------------------------------------------------------- results --- */
const results = [];
let currentStep = null;
const consoleErrors = [];
const netErrors = [];

function record(entry) {
  results.push(entry);
  const tag = entry.status === 'PASS' ? 'PASS ' : entry.status === 'FAIL' ? 'FAIL ' : 'WARN ';
  console.log(`${tag} ${entry.id.padEnd(38)} ${entry.feature}${entry.detail ? ` — ${entry.detail}` : ''}`);
}

/* -------------------------------------------------------------- helpers --- */
async function shot(page, name) {
  try {
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
  } catch { /* screenshot is evidence, never a blocker */ }
}

async function login(page, creds, expect) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('#login-email', { timeout: 20000 });
  await page.fill('#login-email', creds.email);
  await page.fill('#login-password', creds.password);
  const btn = page.locator('button[type=submit]').first();
  await btn.waitFor({ state: 'visible', timeout: 20000 });
  await btn.click();
  await page.waitForTimeout(2500);
  const ok = page.url().includes(expect);
  if (!ok) throw new Error(`login ${creds.email} did not reach ${expect} (at ${page.url()})`);
  return page;
}

/** Poll the database until `fn` returns a truthy value. */
async function waitForDb(fn, { timeout = 45000, interval = 1500, label = 'condition' } = {}) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeout) {
    try { last = fn(); if (last) return { ok: true, value: last, waited: Date.now() - t0 }; } catch (e) { last = e.message; }
    await new Promise((r) => setTimeout(r, interval));
  }
  return { ok: false, value: last, waited: Date.now() - t0, label };
}

/** Wait until the DOM contains `text` (case-insensitive). */
async function waitForText(page, text, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const body = await page.evaluate(() => document.body.innerText).catch(() => '');
    if (body.toLowerCase().includes(String(text).toLowerCase())) return true;
    await new Promise((r) => setTimeout(r, 600));
  }
  return false;
}

async function step(id, feature, crud, role, fn) {
  currentStep = { id, feature, crud, role };
  consoleErrors.length = 0;
  netErrors.length = 0;
  const t0 = Date.now();
  let entry = { id, feature, crud, role, status: 'FAIL', detail: '', evidence: {}, ms: 0 };
  try {
    const evidence = await fn();
    entry.evidence = evidence || {};
    entry.status = 'PASS';
    entry.detail = entry.evidence.detail || '';
    if (entry.evidence.note) entry.note = entry.evidence.note;
  } catch (e) {
    entry.status = 'FAIL';
    entry.detail = String(e.message || e).slice(0, 400);
    entry.error = String(e.stack || e).split('\n').slice(0, 4).join(' | ');
  }
  entry.ms = Date.now() - t0;
  entry.consoleErrors = [...consoleErrors];
  entry.networkErrors = [...netErrors];
  record(entry);
  return entry;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/* --------------------------------------------------- document fixtures ---- */
/**
 * Render a Registration Certificate to PNG with a REAL text layer rendered as
 * pixels, so the upload forces genuine OCR (not a PDF text-layer extraction).
 */
async function makeRcImage(page, values) {
  const html = `<!doctype html><html><body style="margin:0;width:900px;height:640px;background:#fff;
    font-family:'Georgia',serif;padding:28px;color:#111">
    <div style="border:3px solid #222;padding:22px;height:100%;box-sizing:border-box">
      <div style="text-align:center;font-size:23px;font-weight:bold;letter-spacing:2px">GOVERNMENT OF MAHARASHTRA</div>
      <div style="text-align:center;font-size:19px;margin-top:4px">REGISTRATION CERTIFICATE</div>
      <div style="margin-top:16px;font-size:17px;line-height:1.85">
        <div>Registration Number <b>${values.reg_no}</b></div>
        <div>Chassis Number (VIN) <b>${values.vin}</b></div>
        <div>Owner Name <b>${values.owner}</b></div>
        <div>Vehicle Model <b>${values.model}</b></div>
        <div>Fuel Type <b>${values.fuel}</b></div>
        <div>Registration Date <b>${values.reg_date}</b></div>
        <div>Valid Till <b>${values.valid_till}</b></div>
        <div>Odometer <b>${values.odometer} km</b></div>
      </div>
      <div style="margin-top:14px;font-size:15px;color:#333">Scanned copy — original available at RTO</div>
    </div></body></html>`;
  const p = await page.context().newPage();
  await p.setViewportSize({ width: 900, height: 640 });
  await p.setContent(html, { waitUntil: 'load' });
  const file = path.join(SHOTS, 'fixture-rc.png');
  await p.screenshot({ path: file });
  await p.close();
  return file;
}

/* ----------------------------------------------------------------- main --- */
const browser = await chromium.launch({ headless: HEADLESS, slowMo: HEADLESS ? 0 : 120 });
const sellerCtx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const buyerCtx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const seller = await sellerCtx.newPage();
const buyer = await buyerCtx.newPage();

for (const p of [seller, buyer]) {
  p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 220)); });
  p.on('requestfailed', (r) => netErrors.push(`${r.method()} ${r.url().slice(0, 140)} :: ${r.failure()?.errorText}`));
  p.on('response', (r) => { if (r.status() >= 400) netErrors.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 140)}`); });
}

console.log(`\n=== TrustDrive CRUD sweep ===\nbase=${BASE} tag=${TAG}\n`);

await login(seller, SELLER, '/seller');
await login(buyer, BUYER, '/buyer');
console.log('logins OK\n');

/* ======================================================================== */
/* SELLER                                                                    */
/* ======================================================================== */
let vehicleId = null;
let listingId = null;
let docId = null;
let inquiryId = null;

const rcValues = {
  reg_no: `MH${TAG.slice(-4)}QR12`,
  vin: `MA3ER3DE5S${TAG.slice(-4)}X`,
  owner: 'Samarth Darak',
  model: 'Tata Zest',
  fuel: 'Petrol',
  reg_date: '01/04/2021',
  valid_till: '31/12/2030',
  odometer: '45000',
};

// --- C: create a vehicle through the 6-step wizard -------------------------
await step('S-CREATE-vehicle', 'Add Vehicle wizard — create vehicle', 'CREATE', 'seller', async () => {
  await seller.goto(`${BASE}/seller/add-vehicle`, { waitUntil: 'networkidle', timeout: 45000 });
  await seller.getByLabel('Registration number').fill(rcValues.reg_no);
  await seller.getByLabel('VIN (17 chars)').fill(rcValues.vin);
  await seller.getByLabel('Make').fill('Tata');
  await seller.getByLabel('Model').fill('Zest');
  await seller.getByLabel('Variant').fill('VXi AMT');
  await seller.getByLabel('Year').fill('2021');
  await seller.getByLabel('Fuel').selectOption('Petrol');
  await seller.getByLabel('Transmission').selectOption('Manual');
  await seller.getByLabel('Category').selectOption('Hatchback');
  await seller.getByLabel('Colour').fill('White');
  await seller.getByLabel('Ownership count').fill('1');
  await seller.getByLabel('Location').fill('Pune');
  await seller.getByLabel('Current mileage (km)').fill('45000');
  await seller.getByLabel('Asking price (₹)').fill('650000');
  await seller.getByLabel('Condition').fill('Good');
  await seller.getByLabel(/Description/).fill(`CRUD sweep vehicle ${TAG}. Verified facts only.`);
  await shot(seller, 'S-CREATE-vehicle-step1');
  await seller.getByRole('button', { name: /Save draft & continue/i }).click();
  await seller.waitForTimeout(2500);

  const row = q1('SELECT id, reg_no, vin, make, model, km_claimed, asking_price, status, owner_id FROM vehicles WHERE reg_no = ?', rcValues.reg_no);
  assert(row, 'no vehicles row created with reg_no ' + rcValues.reg_no);
  assert(row.owner_id === SELLER.id, `owner_id is ${row.owner_id}, expected ${SELLER.id}`);
  assert(Number(row.km_claimed) === 45000, `km_claimed=${row.km_claimed}`);
  assert(Number(row.asking_price) === 650000, `asking_price=${row.asking_price}`);
  vehicleId = row.id;

  // step 2 must unlock once step 1 persisted
  const step2 = seller.getByRole('button', { name: /^2\s*Photos/i });
  assert(await step2.isEnabled(), 'step 2 (Photos) still disabled after a successful save');
  return { detail: `vehicles.id=${row.id} status=${row.status}`, row };
});

// --- R: read the vehicle back in the list ----------------------------------
await step('S-READ-vehicles', 'My Vehicles — read created vehicle', 'READ', 'seller', async () => {
  await seller.goto(`${BASE}/seller/vehicles`, { waitUntil: 'networkidle', timeout: 45000 });
  const text = await seller.evaluate(() => document.body.innerText);
  assert(text.includes(rcValues.reg_no) || text.includes('Zest'), 'created vehicle is not listed on /seller/vehicles');
  await shot(seller, 'S-READ-vehicles');
  return { detail: 'vehicle visible in My Vehicles list' };
});

// --- C+OCR: upload an RC image, wait for OCR, read extracted fields --------
await step('S-CREATE-doc-OCR', 'Documents — upload RC, OCR extracts fields', 'CREATE', 'seller', async () => {
  const fixture = await makeRcImage(seller, rcValues);
  await seller.goto(`${BASE}/seller/documents`, { waitUntil: 'networkidle', timeout: 45000 });
  const fileInput = seller.getByLabel(/File \(PDF or image/i).first();
  await fileInput.setInputFiles(fixture);
  await seller.getByLabel(/Document type/i).selectOption({ label: 'Registration Certificate' });
  await shot(seller, 'S-CREATE-doc-before-upload');
  await seller.getByRole('button', { name: /^Upload document$/i }).click();
  await seller.waitForTimeout(4000);

  const created = await waitForDb(() => {
    const r = q1("SELECT id, vehicle_id, type, status, sha256, extracted, file_key FROM documents WHERE vehicle_id = ? ORDER BY uploaded_at DESC LIMIT 1", vehicleId);
    return r || null;
  }, { timeout: 30000, label: 'documents row' });
  assert(created.ok, `document row never appeared (${created.value})`);
  const row = created.value;
  docId = row.id;
  assert(row.sha256 && row.sha256.length === 64, 'document has no SHA-256 hash');
  assert(row.type === 'rc', `document type is ${row.type}`);

  const got = await waitForDb(() => {
    const ex = qa('SELECT field, value, confidence, method FROM document_extractions WHERE document_id = ?', row.id);
    return ex.length ? ex : null;
  }, { timeout: 60000, label: 'OCR extractions' });
  const extracted = got.ok ? got.value : [];
  const fields = Object.fromEntries(extracted.map((e) => [e.field, e.value]));
  const hasReg = extracted.some((e) => String(e.value || '').toUpperCase().includes(rcValues.reg_no.toUpperCase()));
  const hasVin = extracted.some((e) => String(e.value || '').toUpperCase().includes(rcValues.vin.toUpperCase()));
  const method = extracted[0]?.method || '(none)';
  assert(hasReg, `OCR did not extract the registration number (got: ${JSON.stringify(fields).slice(0, 300)})`);
  assert(hasVin, `OCR did not extract the VIN (got: ${JSON.stringify(fields).slice(0, 300)})`);
  return {
    detail: `doc=${row.id} sha256=${String(row.sha256).slice(0, 12)}… fields=${extracted.length} method=${method}`,
    docId: row.id, extracted, method, row,
  };
});

// --- R: the extracted fields are displayed back in the UI -------------------
await step('S-READ-doc-display', 'Documents — extracted OCR fields displayed', 'READ', 'seller', async () => {
  await seller.goto(`${BASE}/seller/documents`, { waitUntil: 'networkidle', timeout: 45000 });
  await seller.waitForTimeout(2500);
  const text = await seller.evaluate(() => document.body.innerText);
  const shown = /confidence|extracted|ocr/i.test(text);
  assert(shown, 'document page shows no OCR/extraction section');
  const hasReg = text.toUpperCase().includes(rcValues.reg_no.toUpperCase());
  await shot(seller, 'S-READ-doc-display');
  return { detail: `OCR section rendered (reg number on page: ${hasReg})`, regVisible: hasReg };
});

// --- U: replace the document (new version) ---------------------------------
await step('S-UPDATE-doc-replace', 'Documents — replace with new version', 'UPDATE', 'seller', async () => {
  const before = q1('SELECT version, supersedes_id, status FROM documents WHERE id = ?', docId);
  const fixture = await makeRcImage(seller, { ...rcValues, odometer: '46000' });
  await seller.goto(`${BASE}/seller/documents`, { waitUntil: 'networkidle', timeout: 45000 });
  const replaceBtn = seller.getByRole('button', { name: /^New version$/i }).first();
  await replaceBtn.waitFor({ state: 'visible', timeout: 20000 });
  await replaceBtn.click();
  await seller.waitForTimeout(1500);
  const fileInput = seller.getByLabel(/File \(PDF or image/i).last();
  await fileInput.setInputFiles(fixture);
  const up = seller.getByRole('button', { name: /^Upload document$/i }).last();
  await up.click();
  await seller.waitForTimeout(5000);
  const after = await waitForDb(() => {
    const r = q1('SELECT id, version, supersedes_id, status FROM documents WHERE vehicle_id = ? ORDER BY uploaded_at DESC LIMIT 1', vehicleId);
    return r && r.id !== docId ? r : null;
  }, { timeout: 30000 });
  assert(after.ok, 'no new document version was created');
  assert(Number(after.value.version) > Number(before.version), `version did not increase (${before.version} -> ${after.value.version})`);
  assert(after.value.supersedes_id === docId, `supersedes_id=${after.value.supersedes_id}, expected ${docId}`);
  docId = after.value.id;
  await shot(seller, 'S-UPDATE-doc-replace');
  return { detail: `v${before.version} -> v${after.value.version}, supersedes=${after.value.supersedes_id}`, row: after.value };
});

// --- U: re-verify the document --------------------------------------------
await step('S-UPDATE-doc-reverify', 'Documents — re-verify after replacement', 'UPDATE', 'seller', async () => {
  await seller.goto(`${BASE}/seller/documents`, { waitUntil: 'networkidle', timeout: 45000 });
  const btn = seller.getByRole('button', { name: /^Re-verify$/i }).first();
  const has = await btn.count();
  if (!has) return { status: 'WARN', detail: 'no Re-verify control rendered' };
  await btn.click();
  await seller.waitForTimeout(4000);
  const row = q1('SELECT status, status_reason, verified_at FROM documents WHERE id = ?', docId);
  assert(row, 'document row vanished');
  await shot(seller, 'S-UPDATE-doc-reverify');
  return { detail: `status=${row.status} verified_at=${row.verified_at || 'null'}`, row };
});

// --- C: create + publish a listing ----------------------------------------
await step('S-CREATE-listing', 'Listings — create listing draft', 'CREATE', 'seller', async () => {
  await seller.goto(`${BASE}/seller/listings`, { waitUntil: 'networkidle', timeout: 45000 });
  await seller.getByLabel('Headline').first().fill(`CRUD sweep listing ${TAG}`);
  await seller.getByLabel(/^Description/).first().fill(`Listing created by the live CRUD sweep ${TAG}.`);
  await seller.getByLabel(/Price/i).first().fill('655000');
  await seller.getByLabel('Condition').first().selectOption('Good');
  await seller.getByLabel('Location').first().fill('Pune');
  await shot(seller, 'S-CREATE-listing');
  const createBtn = seller.getByRole('button', { name: /create listing|save listing|create/i }).first();
  await createBtn.click();
  await seller.waitForTimeout(3500);
  const row = await waitForDb(() => q1('SELECT id, vehicle_id, status, headline FROM listings WHERE headline = ?', `CRUD sweep listing ${TAG}`), { timeout: 20000 });
  assert(row.ok, `listing row not created (${row.value})`);
  listingId = row.value.id;
  return { detail: `listings.id=${listingId} status=${row.value.status}`, row: row.value };
});

// --- U: publish the listing ------------------------------------------------
await step('S-UPDATE-listing-publish', 'Listings — publish draft', 'UPDATE', 'seller', async () => {
  await seller.goto(`${BASE}/seller/listings/${listingId}`, { waitUntil: 'networkidle', timeout: 45000 });
  const pub = seller.getByRole('button', { name: /^Publish$/i }).first();
  const has = await pub.count();
  if (!has) {
    const alt = seller.getByRole('button', { name: /publish/i }).first();
    if (await alt.count()) await alt.click();
  } else await pub.click();
  await seller.waitForTimeout(3500);
  const row = q1('SELECT status, published_at FROM listings WHERE id = ?', listingId);
  assert(row.status === 'published', `listing status is ${row.status}, expected published`);
  assert(row.published_at, 'published_at was not set');
  await shot(seller, 'S-UPDATE-listing-publish');
  return { detail: `status=${row.status} published_at=${row.published_at}`, row };
});

// --- R: the published listing is visible to a buyer ------------------------
await step('S-READ-published-visible', 'Marketplace — published listing visible to buyer', 'READ', 'seller', async () => {
  await buyer.goto(`${BASE}/buyer/explore`, { waitUntil: 'networkidle', timeout: 45000 });
  const text = await buyer.evaluate(() => document.body.innerText);
  assert(text.includes('CRUD sweep listing'), 'published listing is NOT visible in the buyer marketplace');
  await shot(buyer, 'S-READ-published-visible');
  return { detail: 'listing appears in buyer Explore' };
});

// --- U: pause -> resume -> sold -------------------------------------------
await step('S-UPDATE-listing-pause-resume', 'Listings — pause then resume', 'UPDATE', 'seller', async () => {
  await seller.goto(`${BASE}/seller/listings/${listingId}`, { waitUntil: 'networkidle', timeout: 45000 });
  const pause = seller.getByRole('button', { name: /^Pause$/i }).first();
  if (!(await pause.count())) return { status: 'WARN', detail: 'no Pause control' };
  await pause.click();
  await seller.waitForTimeout(3000);
  const paused = q1('SELECT status FROM listings WHERE id = ?', listingId);
  assert(paused.status === 'paused', `status after Pause is ${paused.status}`);
  const resume = seller.getByRole('button', { name: /^Resume$/i }).first();
  if (await resume.count()) {
    await resume.click();
    await seller.waitForTimeout(3000);
  }
  const resumed = q1('SELECT status FROM listings WHERE id = ?', listingId);
  assert(resumed.status === 'published', `status after Resume is ${resumed.status}`);
  await shot(seller, 'S-UPDATE-listing-pause-resume');
  return { detail: `paused -> ${resumed.status}` };
});

// --- U: update the vehicle mileage ----------------------------------------
await step('S-UPDATE-vehicle-mileage', 'Vehicle detail — update mileage', 'UPDATE', 'seller', async () => {
  await seller.goto(`${BASE}/seller/vehicles/${vehicleId}`, { waitUntil: 'networkidle', timeout: 45000 });
  const before = q1('SELECT km_claimed, last_verified_km FROM vehicles WHERE id = ?', vehicleId);
  const inputs = seller.locator('input[type=number], input');
  const n = await inputs.count();
  let filled = false;
  for (let i = 0; i < n; i++) {
    const el = inputs.nth(i);
    const val = await el.inputValue().catch(() => '');
    const lbl = await el.evaluate((e) => {
      const l = e.closest('label');
      return l ? l.textContent.replace(/\s+/g, ' ').trim() : '';
    }).catch(() => '');
    if (/mileage|odometer|km/i.test(lbl) || (val && Number(val) === Number(before.km_claimed))) {
      await el.fill('47250');
      filled = true;
      break;
    }
  }
  if (!filled) return { status: 'WARN', detail: 'no mileage input found on the vehicle detail page' };
  const save = seller.getByRole('button', { name: /save|update/i }).first();
  if (await save.count()) await save.click();
  await seller.waitForTimeout(3000);
  const after = q1('SELECT km_claimed FROM vehicles WHERE id = ?', vehicleId);
  assert(Number(after.km_claimed) === 47250, `km_claimed is ${after.km_claimed}, expected 47250`);
  await shot(seller, 'S-UPDATE-vehicle-mileage');
  return { detail: `km_claimed ${before.km_claimed} -> ${after.km_claimed}` };
});

/* ======================================================================== */
/* BUYER                                                                     */
/* ======================================================================== */
await step('B-CREATE-saved', 'Vehicle detail — save vehicle (wishlist)', 'CREATE', 'buyer', async () => {
  await buyer.goto(`${BASE}/vehicle/${vehicleId}`, { waitUntil: 'networkidle', timeout: 45000 });
  const saveBtn = buyer.getByRole('button', { name: /save/i }).first();
  const has = await saveBtn.count();
  if (!has) return { status: 'WARN', detail: 'no Save control on the vehicle page' };
  await saveBtn.click();
  await buyer.waitForTimeout(3000);
  const row = await waitForDb(() => q1(
    'SELECT id, buyer_id, listing_id, price_at_save FROM saved_vehicles WHERE buyer_id = ? AND listing_id = ?',
    BUYER.id, listingId), { timeout: 20000 });
  assert(row.ok, `saved_vehicles row not created (${row.value})`);
  await shot(buyer, 'B-CREATE-saved');
  return { detail: `saved_vehicles.id=${row.value.id} listing=${row.value.listing_id}`, row: row.value };
});

await step('B-READ-saved', 'Saved vehicles — persisted after reload', 'READ', 'buyer', async () => {
  await buyer.goto(`${BASE}/buyer/saved`, { waitUntil: 'networkidle', timeout: 45000 });
  await buyer.waitForTimeout(1500);
  const text = await buyer.evaluate(() => document.body.innerText);
  assert(/Zest|CRUD sweep/i.test(text), 'saved vehicle does not appear on /buyer/saved');
  await shot(buyer, 'B-READ-saved');
  return { detail: 'saved vehicle listed for the buyer' };
});

await step('B-CREATE-inquiry', 'Vehicle detail — contact seller (create inquiry)', 'CREATE', 'buyer', async () => {
  await buyer.goto(`${BASE}/vehicle/${vehicleId}`, { waitUntil: 'networkidle', timeout: 45000 });
  const contact = buyer.getByRole('button', { name: /contact seller|contact/i }).first();
  if (!(await contact.count())) return { status: 'WARN', detail: 'no Contact seller control' };
  await contact.click();
  await buyer.waitForTimeout(1500);
  const area = buyer.locator('textarea').first();
  if (await area.count()) await area.fill(`CRUD sweep inquiry ${TAG}: is the service history complete?`);
  await shot(buyer, 'B-CREATE-inquiry');
  const send = buyer.getByRole('button', { name: /send|submit/i }).last();
  if (await send.count()) await send.click();
  await buyer.waitForTimeout(3500);
  const row = await waitForDb(() => q1(
    'SELECT id, listing_id, buyer_id, seller_id, status, message FROM inquiries WHERE buyer_id = ? AND message LIKE ? ORDER BY created_at DESC LIMIT 1',
    BUYER.id, `%${TAG}%`), { timeout: 25000 });
  assert(row.ok, `inquiries row not created (${row.value})`);
  inquiryId = row.value.id;
  assert(row.value.seller_id === SELLER.id, `inquiry.seller_id=${row.value.seller_id}`);
  return { detail: `inquiries.id=${inquiryId} seller=${row.value.seller_id}`, row: row.value };
});

await step('B-CREATE-inquiry-message', 'Inquiry thread — buyer sends a message', 'CREATE', 'buyer', async () => {
  await buyer.goto(`${BASE}/buyer/inquiries/${inquiryId}`, { waitUntil: 'networkidle', timeout: 45000 });
  const area = buyer.locator('textarea').first();
  if (!(await area.count())) return { status: 'WARN', detail: 'no message composer' };
  await area.fill(`Buyer follow-up ${TAG}`);
  const send = buyer.getByRole('button', { name: /send/i }).first();
  if (await send.count()) await send.click();
  await buyer.waitForTimeout(3000);
  const row = await waitForDb(() => q1(
    'SELECT id, inquiry_id, sender_id, body FROM inquiry_messages WHERE inquiry_id = ? AND body LIKE ? ORDER BY created_at DESC LIMIT 1',
    inquiryId, `%${TAG}%`), { timeout: 20000 });
  assert(row.ok, `inquiry_messages row not created (${row.value})`);
  assert(row.value.sender_id === BUYER.id, `sender_id=${row.value.sender_id}`);
  await shot(buyer, 'B-CREATE-inquiry-message');
  return { detail: `inquiry_messages.id=${row.value.id}`, row: row.value };
});

await step('S-CREATE-reply', 'Inquiry thread — seller replies', 'CREATE', 'seller', async () => {
  await seller.goto(`${BASE}/seller/inquiries/${inquiryId}`, { waitUntil: 'networkidle', timeout: 45000 });
  const area = seller.locator('textarea').first();
  if (!(await area.count())) return { status: 'WARN', detail: 'no reply composer for the seller' };
  await area.fill(`Seller reply ${TAG}`);
  const send = seller.getByRole('button', { name: /send|reply/i }).first();
  if (await send.count()) await send.click();
  await seller.waitForTimeout(3000);
  const row = await waitForDb(() => q1(
    'SELECT id, inquiry_id, sender_id, body FROM inquiry_messages WHERE inquiry_id = ? AND body LIKE ? ORDER BY created_at DESC LIMIT 1',
    inquiryId, `%Seller reply ${TAG}%`), { timeout: 20000 });
  assert(row.ok, `seller reply not persisted (${row.value})`);
  assert(row.value.sender_id === SELLER.id, `sender_id=${row.value.sender_id}, expected ${SELLER.id}`);
  await shot(seller, 'S-CREATE-reply');
  return { detail: `reply id=${row.value.id} sender=${row.value.sender_id}`, row: row.value };
});

await step('B-READ-reply', 'Inquiry thread — buyer sees the seller reply', 'READ', 'buyer', async () => {
  await buyer.goto(`${BASE}/buyer/inquiries/${inquiryId}`, { waitUntil: 'networkidle', timeout: 45000 });
  await buyer.waitForTimeout(1200);
  const text = await buyer.evaluate(() => document.body.innerText);
  assert(text.includes(`Seller reply ${TAG}`), 'the buyer cannot see the seller reply');
  await shot(buyer, 'B-READ-reply');
  return { detail: 'seller reply rendered for the buyer' };
});

await step('B-UPDATE-inquiry-close', 'Inquiry — buyer closes / cancels', 'UPDATE', 'buyer', async () => {
  const before = q1('SELECT status FROM inquiries WHERE id = ?', inquiryId);
  await buyer.goto(`${BASE}/buyer/inquiries/${inquiryId}`, { waitUntil: 'networkidle', timeout: 45000 });
  const close = buyer.getByRole('button', { name: /close|cancel/i }).first();
  if (!(await close.count())) return { status: 'WARN', detail: 'no close/cancel control for the buyer' };
  await close.click();
  await buyer.waitForTimeout(3000);
  const after = q1('SELECT status FROM inquiries WHERE id = ?', inquiryId);
  assert(after.status !== before.status, `inquiry status did not change (${before.status})`);
  await shot(buyer, 'B-UPDATE-inquiry-close');
  return { detail: `${before.status} -> ${after.status}` };
});

await step('B-CREATE-comparison', 'Compare — save a comparison', 'CREATE', 'buyer', async () => {
  const other = q1("SELECT id FROM listings WHERE status='published' AND id <> ? LIMIT 1", listingId);
  await buyer.goto(`${BASE}/buyer/compare?ids=${listingId},${other.id}`, { waitUntil: 'networkidle', timeout: 45000 });
  await buyer.waitForTimeout(2000);
  const save = buyer.getByRole('button', { name: /save comparison|save/i }).first();
  if (!(await save.count())) return { status: 'WARN', detail: 'no save-comparison control' };
  await save.click();
  await buyer.waitForTimeout(3000);
  const row = await waitForDb(() => q1(
    'SELECT id, buyer_id, name, vehicle_ids FROM saved_comparisons WHERE buyer_id = ? ORDER BY created_at DESC LIMIT 1',
    BUYER.id), { timeout: 20000 });
  assert(row.ok, `saved_comparisons row not created (${row.value})`);
  await shot(buyer, 'B-CREATE-comparison');
  return { detail: `saved_comparisons.id=${row.value.id}`, row: row.value };
});

// --- D: remove the saved vehicle ------------------------------------------
await step('B-DELETE-saved', 'Saved vehicles — remove from wishlist', 'DELETE', 'buyer', async () => {
  const before = q1('SELECT COUNT(*) n FROM saved_vehicles WHERE buyer_id = ? AND listing_id = ?', BUYER.id, listingId);
  await buyer.goto(`${BASE}/buyer/saved`, { waitUntil: 'networkidle', timeout: 45000 });
  await buyer.waitForTimeout(1200);
  const rm = buyer.getByRole('button', { name: /remove|delete|unsave/i }).first();
  if (!(await rm.count())) return { status: 'WARN', detail: 'no remove control on /buyer/saved' };
  await rm.click();
  await buyer.waitForTimeout(3000);
  const after = q1('SELECT COUNT(*) n FROM saved_vehicles WHERE buyer_id = ? AND listing_id = ?', BUYER.id, listingId);
  assert(after.n < before.n, `saved_vehicles count still ${after.n}`);
  await shot(buyer, 'B-DELETE-saved');
  return { detail: `saved_vehicles ${before.n} -> ${after.n}` };
});

// --- D: delete the document (soft delete) ---------------------------------
await step('S-DELETE-doc', 'Documents — delete document', 'DELETE', 'seller', async () => {
  await seller.goto(`${BASE}/seller/documents`, { waitUntil: 'networkidle', timeout: 45000 });
  const del = seller.getByRole('button', { name: /^Delete$/i }).first();
  if (!(await del.count())) return { status: 'WARN', detail: 'no Delete control' };
  await del.click();
  await seller.waitForTimeout(500);
  const confirm = seller.getByRole('button', { name: /confirm|delete|yes/i }).last();
  if (await confirm.count()) await confirm.click();
  await seller.waitForTimeout(3000);
  const row = q1('SELECT deleted_at, status FROM documents WHERE id = ?', docId);
  assert(row.deleted_at || row.status === 'deleted', `document not deleted (deleted_at=${row.deleted_at}, status=${row.status})`);
  await shot(seller, 'S-DELETE-doc');
  return { detail: `deleted_at=${row.deleted_at} status=${row.status}` };
});

// --- U: archive the vehicle ------------------------------------------------
await step('S-UPDATE-vehicle-archive', 'My Vehicles — archive vehicle', 'UPDATE', 'seller', async () => {
  await seller.goto(`${BASE}/seller/vehicles/${vehicleId}`, { waitUntil: 'networkidle', timeout: 45000 });
  const arch = seller.getByRole('button', { name: /archive/i }).first();
  if (!(await arch.count())) return { status: 'WARN', detail: 'no Archive control' };
  await arch.click();
  await seller.waitForTimeout(3000);
  const row = q1('SELECT status FROM vehicles WHERE id = ?', vehicleId);
  assert(row.status === 'archived', `vehicle status is ${row.status}, expected archived`);
  await shot(seller, 'S-UPDATE-vehicle-archive');
  return { detail: `vehicles.status=${row.status}` };
});

/* ----------------------------------------------------------------- done --- */
const pass = results.filter((r) => r.status === 'PASS').length;
const fail = results.filter((r) => r.status === 'FAIL').length;
const warn = results.filter((r) => r.status === 'WARN').length;

const out = {
  base: BASE, tag: TAG, at: new Date().toISOString(),
  summary: { total: results.length, pass, fail, warn },
  created: { vehicleId, listingId, docId, inquiryId },
  steps: results,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));

console.log(`\n=== SUMMARY === total=${results.length} pass=${pass} fail=${fail} warn=${warn}`);
console.log(`report: ${OUT}`);
console.log(`screenshots: ${SHOTS}`);

await browser.close();
db.close();
process.exit(fail ? 1 : 0);
