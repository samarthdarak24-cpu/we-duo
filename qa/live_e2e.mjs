// ---------------------------------------------------------------------------
// TrustDrive — multi-category LIVE functional audit.
//
// Real Chromium + running Next.js (:3000) + running FastAPI (:8000) + the shared
// SQLite database. No mocks, no injected cookies, no direct DB writes to make a
// check pass. Every assertion below is an observed HTTP body, rendered DOM text,
// screenshot or SQLite row.
//
// Product rules asserted for all six implemented categories:
//   * a two-wheeler NEVER gets a car GLB (labelled schematic instead)
//   * an EV is NEVER asked for engine number / engine CC / PUC
//   * battery State of Health is NEVER stored as / confused with odometer km
//   * NO universal 17-character VIN rule (two-wheelers use 8-22 char frames)
//   * the real Python LangGraph investigator runs the conditional 15/16-node set
//     and adds EVBatteryAnalysisNode only for electric categories
//
// Usage:  node qa/live_e2e.mjs            (writes qa/live-e2e-summary.json
//                                          and SCREENSHOTS/ at the repo root)
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BASE,
  newContext,
  waitForHydration,
  api,
  sql,
  sqlOne,
  closeAll,
} from "./live/harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SHOTS = path.join(ROOT, "SCREENSHOTS");
fs.mkdirSync(SHOTS, { recursive: true });

const STAMP = Date.now();
const RUN_ID = `LIVE-${STAMP.toString(36).toUpperCase()}`;
const BACKEND = process.env.TD_INTELLIGENCE_URL || "http://127.0.0.1:8000";

// Real service credential, read from the same root .env the app uses.
const SERVICE_TOKEN = (() => {
  const raw = fs.existsSync(path.join(ROOT, ".env"))
    ? fs.readFileSync(path.join(ROOT, ".env"), "utf8")
    : "";
  const line = raw.split(/\r?\n/).find((l) => l.startsWith("TD_SERVICE_TOKEN="));
  return line ? line.slice("TD_SERVICE_TOKEN=".length).trim().replace(/^["']|["']$/g, "") : process.env.TD_SERVICE_TOKEN || "";
})();

const ACCOUNTS = {
  seller: { email: "samarth@trustdrive.dev", password: "demo1234", home: /\/seller/ },
  buyer: { email: "rohan@trustdrive.dev", password: "demo1234", home: /\/buyer/ },
};

// Login through the REAL form. Local copy of the proven prove_six.mjs helper:
// the harness version calls page.evaluate after a navigation and loses its
// execution context on a cold Next.js dev server.
async function loginViaUI(page, role) {
  const acc = ACCOUNTS[role];
  let last = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await gotoSafe(page, `${BASE}/login`);
    await waitForHydration(page, "#login-email");
    await page.locator("#login-email").fill(acc.email);
    await page.locator("#login-password").fill(acc.password);
    const responsePromise = page
      .waitForResponse(
        (r) => r.url().includes("/api/v1/auth/login") && r.request().method() === "POST",
        { timeout: 45000 }
      )
      .catch(() => null);
    await page.locator('form button[type="submit"]').evaluate((el) => el.click()).catch(() => {});
    const res = await responsePromise;
    last = res;
    if (res && res.status() === 200) {
      await page.waitForURL(acc.home, { timeout: 45000 }).catch(() => {});
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(700);
      return { status: res.status(), url: page.url() };
    }
    await page.waitForTimeout(1500);
  }
  throw new Error(`${role} login failed after 3 attempts (last HTTP ${last?.status() ?? "no response"})`);
}

// ------------------------------------------------------------------ fixtures
// Every run generates registration numbers and primary identifiers that cannot
// collide with the shared DB. Duplicate detection is tested separately, on
// purpose, rather than accidentally tripped by a hardcoded fixture.
function uniqueReg(index) {
  const prefix = `MH${String(12 + (index % 8))}QA`;
  for (let n = 0; n < 500; n += 1) {
    const serial = String((STAMP % 100000) + index * 977 + n * 13 + Math.floor(Math.random() * 9000))
      .slice(-4)
      .padStart(4, "0");
    const reg = `${prefix}${serial}`;
    if (!sqlOne("SELECT id FROM vehicles WHERE reg_no = ?", reg)) return reg;
  }
  throw new Error("could not allocate a unique registration number");
}
function uniquePrimary(cat, index) {
  for (let n = 0; n < 500; n += 1) {
    const tail = String((STAMP % 1_000_000_000) + index * 1000 + n).padStart(10, "0");
    // Cars: 17 numeric characters (valid ISO 3779 alphabet, no I/O/Q).
    // Two-wheelers: a 19-character stamped frame number, deliberately NOT 17.
    const value = cat.twoWheeler ? `FRM${tail}00${index}` : `9${String(STAMP)}${String(index).padStart(3, "0")}`;
    if (!sqlOne("SELECT id FROM vehicles WHERE vin = ?", value)) return value;
  }
  throw new Error("could not allocate a unique primary identifier");
}

// A deliberately SHORT (10-character) stamped frame number for the "no
// universal 17-character VIN rule" check. It must be unique per run: the shared
// SQLite DB persists across audit runs, and a duplicate VIN is a legitimate
// 409 on its own, which would otherwise mask the rule under test.
function uniqueShortFrame() {
  for (let n = 0; n < 500; n += 1) {
    const value = `F${String((STAMP + n) % 1_000_000_000).padStart(9, "0")}`;
    if (!sqlOne("SELECT id FROM vehicles WHERE vin = ?", value)) return value;
  }
  throw new Error("could not allocate a unique 10-character frame number");
}

const CATEGORY_SEEDS = [
  { id: "petrol_motorcycle", label: "Petrol Motorcycle", make: "Royal Enfield", model: "Classic 350", year: 2022, electric: false, twoWheeler: true, batterySoH: null, km: 18500, price: 165000 },
  { id: "petrol_scooter", label: "Petrol Scooter", make: "Honda", model: "Activa 6G", year: 2023, electric: false, twoWheeler: true, batterySoH: null, km: 9200, price: 92000 },
  { id: "electric_scooter", label: "Electric Scooter", make: "Ola", model: "S1 Pro", year: 2024, electric: true, twoWheeler: true, batterySoH: 92, km: 6400, price: 128000 },
  { id: "electric_motorcycle", label: "Electric Motorcycle", make: "Revolt", model: "RV400", year: 2023, electric: true, twoWheeler: true, batterySoH: 88, km: 11200, price: 149000 },
  { id: "passenger_car", label: "Petrol Car", make: "Hyundai", model: "i20", year: 2021, electric: false, twoWheeler: false, batterySoH: null, km: 45000, price: 675000 },
  { id: "electric_car", label: "Electric Car", make: "Tata", model: "Nexon EV", year: 2023, electric: true, twoWheeler: false, batterySoH: 95, km: 28000, price: 1395000 },
];
const CATEGORIES = CATEGORY_SEEDS.map((c, i) => ({
  ...c,
  regNo: uniqueReg(i),
  primary: uniquePrimary(c, i),
  primaryLabel: c.twoWheeler ? "Chassis / frame number" : "VIN (17 characters)",
  rcType: c.twoWheeler ? "rc_2w" : "rc",
  expectedNodes: c.electric ? 16 : 15,
}));

// TD_ONLY=petrol_motorcycle,electric_car is useful for a fast diagnostic pass.
const ONLY = process.env.TD_ONLY ? process.env.TD_ONLY.split(",").filter(Boolean) : null;
const results = [];
const consoleErrors = [];
const created = []; // { cat, vehicleId, listingId, published, investigation, rc }
const screenshots = [];

function log(...a) { console.log(...a); }
function record(feature, checks, extra = {}) {
  const failed = checks.filter((c) => !c.ok);
  const out = {
    feature,
    status: failed.length === 0 ? "PASS" : "FAIL",
    total: checks.length,
    passed: checks.length - failed.length,
    failed: failed.length,
    checks,
    ...extra,
  };
  results.push(out);
  log(`\n=== ${feature}: ${out.status} (${out.passed}/${out.total}) ===`);
  return out;
}
function check(list, label, ok, detail = "") {
  list.push({ label, ok: !!ok, detail: String(detail ?? "").slice(0, 700) });
  log(`  ${ok ? "PASS" : "FAIL"} ${label}${detail ? ` :: ${String(detail).slice(0, 220)}` : ""}`);
  return !!ok;
}
async function shot(page, name) {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  const rel = path.relative(ROOT, file).replaceAll("\\", "/");
  screenshots.push(rel);
  return rel;
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
async function fillLabel(page, labelRegex, value) {
  const el = page.getByLabel(labelRegex).first();
  await el.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  await el.fill(String(value)).catch(() => {});
}
function watchConsole(page) {
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 400)); });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 400)}`));
}
async function gotoSafe(page, url, attempts = 3) {
  let lastError = null;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
      return;
    } catch (err) {
      lastError = err;
      const target = url.split("?")[0];
      if (page.url().startsWith(target)) {
        await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
        return;
      }
      await page.waitForTimeout(1500 * i);
    }
  }
  throw lastError;
}

/** Multipart upload from INSIDE the page (same origin + real session cookie). */
async function uiUpload(page, pathname, fields, files) {
  return page.evaluate(
    async ({ pathname, fields, files }) => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(fields ?? {})) fd.append(k, v);
      for (const f of files ?? []) {
        const bin = atob(f.b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
        fd.append(f.field, new File([bytes], f.name, { type: f.type }));
      }
      const res = await fetch(pathname, { method: "POST", body: fd, credentials: "same-origin" });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* keep null */ }
      return { status: res.status, json, text: text.slice(0, 4000) };
    },
    { pathname, fields, files }
  );
}

/** Render a real, OCR-readable RC image for this exact vehicle/category. */
async function makeRcPng(context, cat) {
  const p = await context.newPage();
  await p.setViewportSize({ width: 1100, height: 720 });
  const identityLabel = cat.twoWheeler ? "Chassis Number" : "VIN";
  await p.setContent(`<!doctype html><html><body style="margin:0;background:#e8e8e8">
    <div style="width:1000px;margin:36px auto;background:#fff;border:3px solid #111;padding:40px 52px;font-family:Arial,Helvetica,sans-serif;color:#111">
      <div style="text-align:center;font-size:30px;font-weight:700;letter-spacing:2px">GOVERNMENT OF MAHARASHTRA</div>
      <div style="text-align:center;font-size:25px;font-weight:700;margin-top:6px">REGISTRATION CERTIFICATE</div>
      <div style="height:3px;background:#111;margin:20px 0 24px"></div>
      <table style="font-size:29px;line-height:1.75;border-spacing:0 4px">
        <tr><td style="width:420px;color:#333">Registration Number</td><td style="font-weight:700">${cat.regNo}</td></tr>
        <tr><td style="color:#333">${identityLabel}</td><td style="font-weight:700;letter-spacing:1px">${cat.primary}</td></tr>
        <tr><td style="color:#333">Owner Name</td><td>Samarth Deshmukh</td></tr>
        <tr><td style="color:#333">Vehicle Model</td><td>${cat.make} ${cat.model}</td></tr>
        <tr><td style="color:#333">Registration Date</td><td>01/04/${cat.year}</td></tr>
        <tr><td style="color:#333">Valid Till</td><td>31/12/2032</td></tr>
        <tr><td style="color:#333">Odometer</td><td>${cat.km} km</td></tr>
      </table>
    </div></body></html>`);
  await p.waitForTimeout(250);
  const buf = await p.screenshot({ type: "png" });
  await p.close();
  const file = path.join(SHOTS, `rc-${cat.id}-${RUN_ID}.png`);
  fs.writeFileSync(file, buf);
  return { b64: buf.toString("base64"), file };
}

// --------------------------------------------------------------- per category
async function testCategory(seller, sellerCtx, cat) {
  const checks = [];
  const c = [];
  log(`\n########## CATEGORY: ${cat.label} (${cat.id}) ##########`);

  await gotoSafe(seller, `${BASE}/seller/add-vehicle`);
  await waitForHydration(seller, "select");
  const categoryOptions = await seller.getByLabel(/Vehicle category/i).locator("option").allTextContents().catch(() => []);
  await seller.getByLabel(/Vehicle category/i).selectOption(cat.id);
  await seller.waitForTimeout(650);
  check(c, `[${cat.id}] category selectable in the real Seller wizard`, categoryOptions.some((o) => new RegExp(cat.label, "i").test(o)), `${categoryOptions.length} options`);

  // ---- strict rule: category-correct identity label, no universal VIN rule --
  const primaryVisible = await seller.getByText(cat.primaryLabel, { exact: false }).first().isVisible().catch(() => false);
  check(c, `[${cat.id}] primary identifier label is "${cat.primaryLabel}"`, primaryVisible, cat.primaryLabel);
  const vinLabel = await seller.getByText("VIN (17 characters)", { exact: false }).first().isVisible().catch(() => false);
  if (cat.twoWheeler) check(c, `[${cat.id}] two-wheeler does NOT show "VIN (17 characters)"`, !vinLabel, "no universal 17-char VIN rule");
  else check(c, `[${cat.id}] four-wheeler shows "VIN (17 characters)"`, vinLabel, "ISO 3779 applies to cars only");

  // ---- strict rule: no petrol details for EVs ------------------------------
  // Use label-based lookups: the wizard's category note literally says "no
  // engine number" on EVs, so a substring text match would be a false positive.
  const engineCC = await seller.getByLabel(/^Engine capacity \(CC\)/i).first().isVisible().catch(() => false);
  const engineNo = await seller.getByLabel(/^Engine number/i).first().isVisible().catch(() => false);
  if (cat.electric) {
    check(c, `[${cat.id}] EV hides "Engine capacity (CC)"`, !engineCC, "no petrol details for EV");
    check(c, `[${cat.id}] EV hides "Engine number"`, !engineNo, "no combustion engine on an EV");
    const batteryCapacity = await seller.getByLabel(/Battery capacity \(kWh\)/i).first().isVisible().catch(() => false);
    const soh = await seller.getByLabel(/Battery State of Health/i).first().isVisible().catch(() => false);
    const motorNo = await seller.getByLabel(/Motor number/i).first().isVisible().catch(() => false);
    check(c, `[${cat.id}] EV exposes battery fields`, batteryCapacity && soh, `capacity=${batteryCapacity} soh=${soh}`);
    check(c, `[${cat.id}] EV exposes motor number (not engine number)`, motorNo, `motorNumber=${motorNo}`);
  } else {
    check(c, `[${cat.id}] combustion exposes "Engine capacity (CC)"`, engineCC, "petrol field shown");
    check(c, `[${cat.id}] combustion exposes "Engine number"`, engineNo, "engine field shown");
  }
  await shot(seller, `cat-${cat.id}-step0`);

  // ---- create the draft through the real wizard ----------------------------
  await fillLabel(seller, /Registration number/i, cat.regNo);
  await fillLabel(seller, new RegExp(esc(cat.primaryLabel), "i"), cat.primary);
  await fillLabel(seller, /Manufacturer/i, cat.make);
  await fillLabel(seller, /^Model/i, cat.model);
  await fillLabel(seller, /Manufacturing year/i, cat.year);
  await fillLabel(seller, /^Location/i, "Mumbai, Maharashtra");
  await fillLabel(seller, /Asking price/i, cat.price);
  await fillLabel(seller, /reading \(km\)/i, cat.km);
  if (cat.electric) await fillLabel(seller, /Battery State of Health/i, cat.batterySoH);

  const postPromise = seller.waitForResponse(
    (r) => r.url().includes("/api/v1/seller/vehicles") && r.request().method() === "POST",
    { timeout: 60000 }
  );
  await seller.getByRole("button", { name: /Save draft & continue/i }).click();
  const postRes = await postPromise.catch(() => null);
  const postJson = postRes ? await postRes.json().catch(() => ({})) : {};
  const vehicleId = postJson?.data?.id;
  const listingId = postJson?.data?.listingId;
  check(c, `[${cat.id}] vehicle draft created via the real UI`, !!vehicleId, `HTTP ${postRes?.status()} id=${vehicleId} reg=${cat.regNo}`);
  const entry = { cat, vehicleId, listingId, published: false, investigation: null, rc: null, evidence: [] };
  created.push(entry);
  if (!vehicleId) {
    record(`Category: ${cat.label}`, c, { categoryId: cat.id, error: postJson?.error?.message ?? "draft not created" });
    return;
  }

  // ---- DB: category mapping, required fields, SOH/odometer separation ------
  const row = sqlOne("SELECT * FROM vehicles WHERE id = ?", vehicleId);
  check(c, `[${cat.id}] DB vehicle_category_id matches`, row?.vehicle_category_id === cat.id, `${row?.vehicle_category_id} == ${cat.id}`);
  check(c, `[${cat.id}] DB make/model/reg/primary correct`, row?.make === cat.make && row?.model === cat.model && row?.reg_no === cat.regNo && row?.vin === cat.primary, `${row?.make} ${row?.model} ${row?.reg_no} ${row?.vin}`);
  check(c, `[${cat.id}] DB fuel matches powertrain`, row?.fuel === (cat.electric ? "Electric" : "Petrol"), String(row?.fuel));
  check(c, `[${cat.id}] asking price and location persisted`, Number(row?.asking_price) === cat.price && row?.location === "Mumbai, Maharashtra", `price=${row?.asking_price} location=${row?.location}`);
  const specRow = sqlOne("SELECT * FROM vehicle_specs WHERE vehicle_id = ?", vehicleId);
  let specs = {};
  try { specs = JSON.parse(specRow?.specs || "{}"); } catch { /* keep empty */ }
  if (cat.electric) {
    const soh = Number(specs.battery_soh);
    const km = Number(row?.km_claimed);
    check(c, `[${cat.id}] battery SOH stored separately from odometer`, soh === cat.batterySoH && km === cat.km && soh !== km, `soh=${soh} km=${km}`);
    check(c, `[${cat.id}] EV specs contain no engine_cc`, specs.engine_cc === undefined, JSON.stringify(specs).slice(0, 180));
    const battery = sqlOne("SELECT * FROM battery_records WHERE vehicle_id = ?", vehicleId);
    check(c, `[${cat.id}] odometer never written into battery_records`, !battery || battery.soh_percent === undefined || Number(battery.soh_percent) !== km, `batteryRows=${battery ? 1 : 0}`);
  } else {
    check(c, `[${cat.id}] combustion specs contain no battery_soh`, specs.battery_soh === undefined, JSON.stringify(specs).slice(0, 180));
  }

  // ---- publish gate: must BLOCK a bare draft (positive gate test) ----------
  const blocked = await api(seller, "POST", `/api/v1/seller/listings/${listingId}/publish`, {});
  check(c, `[${cat.id}] publish gate blocks a bare draft (HTTP 422)`, blocked.status === 422 && blocked.json?.error?.code === "PUBLISH_BLOCKED", `HTTP ${blocked.status} ${blocked.json?.error?.code}`);

  // ---- real AI investigation on the Python LangGraph agent -----------------
  await gotoSafe(seller, `${BASE}/seller/fraud?vehicle=${vehicleId}`);
  await seller.getByText("AI investigation", { exact: false }).first().waitFor({ timeout: 60000 }).catch(() => {});
  await waitForHydration(seller, "button");
  const runBtn = seller.getByRole("button", { name: /Run investigation/i });
  if (await runBtn.isVisible().catch(() => false)) {
    const invPromise = seller.waitForResponse(
      (r) => r.url().includes(`/api/v1/vehicles/${vehicleId}/ai-investigations`) && r.request().method() === "POST",
      { timeout: 200000 }
    );
    await runBtn.click();
    const invRes = await invPromise.catch(() => null);
    const inv = invRes ? await invRes.json().catch(() => ({})) : {};
    const data = inv?.data ?? {};
    const nodes = Array.isArray(data.nodes) ? data.nodes : [];
    entry.investigation = { source: data.source, orchestrator: data.orchestrator, nodes: nodes.length, status: invRes?.status() };
    check(c, `[${cat.id}] investigation answered by the real Python agent`, data.source === "python-intelligence", String(data.source));
    check(c, `[${cat.id}] orchestrator reported honestly`, ["langgraph", "sequential-fallback"].includes(data.orchestrator), String(data.orchestrator));
    check(c, `[${cat.id}] conditional ${cat.expectedNodes}-node set executed`, nodes.length === cat.expectedNodes, `${nodes.length} nodes (expected ${cat.expectedNodes})`);
    if (cat.electric) check(c, `[${cat.id}] EV node set includes EVBatteryAnalysisNode`, nodes.includes("EVBatteryAnalysisNode"), nodes.join(",").slice(0, 200));
    else check(c, `[${cat.id}] combustion node set omits EVBatteryAnalysisNode`, !nodes.includes("EVBatteryAnalysisNode"), `${nodes.length} nodes`);
    const aiRow = sqlOne("SELECT graph, model_version, status FROM ai_runs WHERE vehicle_id = ? ORDER BY started_at DESC LIMIT 1", vehicleId);
    check(c, `[${cat.id}] ai_runs row persisted with the real graph`, /langgraph|sequential-conditional/.test(aiRow?.graph ?? ""), `${aiRow?.graph} / ${aiRow?.status}`);
    entry.evidence.push(await shot(seller, `cat-${cat.id}-investigation`));
  } else {
    check(c, `[${cat.id}] investigation button reachable`, false, "button not visible");
  }

  // ---- satisfy the publish gate with REAL uploads --------------------------
  const rc = await makeRcPng(sellerCtx, cat);
  const photoFile = { field: "files", name: "vehicle-photo.png", type: "image/png", b64: rc.b64 };
  const photos = await uiUpload(seller, `/api/v1/vehicles/${vehicleId}/photos`, {}, [photoFile, photoFile, photoFile]);
  check(c, `[${cat.id}] 3 real photos uploaded via multipart`, photos.status === 201, `HTTP ${photos.status} ${photos.text.slice(0, 160)}`);

  const doc = await uiUpload(seller, `/api/v1/vehicles/${vehicleId}/documents`, { type: cat.rcType, consent: "true" }, [
    { field: "file", name: `rc-${cat.id}.png`, type: "image/png", b64: rc.b64 },
  ]);
  const ocr = doc.json?.data?.ocr;
  entry.rc = { status: doc.status, documentStatus: ocr?.documentStatus, engine: ocr?.engine, confidence: ocr?.confidence };
  check(c, `[${cat.id}] category-correct RC type accepted (${cat.rcType})`, doc.status === 201, `HTTP ${doc.status} ${doc.text.slice(0, 160)}`);
  check(c, `[${cat.id}] real OCR ran on the RC image`, ocr?.status === "processed" && !!ocr?.engine, `${ocr?.engine} ${ocr?.method} status=${ocr?.status}`);
  check(c, `[${cat.id}] RC auto-verified from extracted evidence`, ocr?.documentStatus === "verified", `status=${ocr?.documentStatus} confidence=${ocr?.confidence}`);
  const docRow = sqlOne("SELECT type, status FROM documents WHERE vehicle_id = ? AND type = ? ORDER BY uploaded_at DESC LIMIT 1", vehicleId, cat.rcType);
  check(c, `[${cat.id}] verified RC row persisted in SQLite`, docRow?.status === "verified" && docRow?.type === cat.rcType, `${docRow?.type} / ${docRow?.status}`);

  const publish = await api(seller, "POST", `/api/v1/seller/listings/${listingId}/publish`, {});
  const lrow = sqlOne("SELECT status FROM listings WHERE id = ?", listingId);
  entry.published = lrow?.status === "published";
  check(c, `[${cat.id}] listing published after the gate is satisfied`, publish.status === 200 && entry.published, `HTTP ${publish.status} DB=${lrow?.status}`);
  entry.evidence.push(await shot(seller, `cat-${cat.id}-published`));

  record(`Category: ${cat.label}`, c, {
    categoryId: cat.id,
    vehicleId,
    listingId,
    regNo: cat.regNo,
    primary: cat.primary,
    electric: cat.electric,
    twoWheeler: cat.twoWheeler,
    expectedNodes: cat.expectedNodes,
    evidence: entry.evidence,
  });
}

// ------------------------------------------------------------------ buyer side
async function testBuyer(buyer, seller) {
  const checks = [];
  log(`\n########## BUYER MARKETPLACE (all six categories) ##########`);

  await gotoSafe(buyer, `${BASE}/buyer`);
  await buyer.getByText(/marketplace|browse|verified/i).first().waitFor({ timeout: 60000 }).catch(() => {});
  await waitForHydration(buyer, "body").catch(() => {});
  await shot(buyer, "buyer-dashboard");

  for (const e of created) {
    if (!e.published || !e.vehicleId) continue;
    const byCategory = await api(buyer, "GET", `/api/v1/marketplace/listings?category=${e.cat.id}&pageSize=48`);
    const items = byCategory.json?.data?.items ?? [];
    const found = items.find((i) => i.id === e.vehicleId || i.listingId === e.listingId);
    check(checks, `[${e.cat.id}] buyer marketplace category filter returns this listing`, !!found, `${items.length} items, match=${!!found}`);
    if (found) {
      check(checks, `[${e.cat.id}] marketplace item keeps the category identity`, found.categoryId === e.cat.id && found.primaryIdentifierLabel === (e.cat.twoWheeler ? "Chassis / frame number" : "VIN"), `${found.categoryId} / ${found.primaryIdentifierLabel}`);
      check(checks, `[${e.cat.id}] marketplace item reports the correct 3D status`, found.model3dStatus === (e.cat.twoWheeler ? "unavailable" : "available"), String(found.model3dStatus));
    }
    const byReg = await api(buyer, "GET", `/api/v1/marketplace/listings?q=${encodeURIComponent(e.cat.regNo)}&pageSize=48`);
    check(checks, `[${e.cat.id}] buyer search by registration finds the listing`, (byReg.json?.data?.items ?? []).some((i) => i.id === e.vehicleId), `q=${e.cat.regNo}`);

    // 3D asset policy for EVERY category — this is the "no car for a scooter" rule.
    const m3d = await api(buyer, "GET", `/api/v1/vehicles/${e.vehicleId}/3d-model`);
    const g = m3d.json?.data ?? {};
    if (e.cat.twoWheeler) {
      check(checks, `[${e.cat.id}] 3D asset is unavailable (no licensed GLB)`, g.assetStatus === "unavailable" && !g.assetUrl, `status=${g.assetStatus} url=${g.assetUrl}`);
      check(checks, `[${e.cat.id}] 3D interactions disabled + labelled schematic`, g.interactionsAvailable === false && g.assetScope === "labelled-schematic", `${g.interactionsAvailable} / ${g.assetScope}`);
      check(checks, `[${e.cat.id}] API states no car GLB is substituted`, /no car GLB|never load the sedan GLB/i.test(g.rule ?? ""), String(g.rule).slice(0, 160));
      check(checks, `[${e.cat.id}] car license/attribution NOT reused for a 2W`, g.license === null && g.manifest === null, `license=${g.license} manifest=${g.manifest}`);
    } else {
      check(checks, `[${e.cat.id}] category-matched car GLB is available`, g.assetStatus === "available" && !!g.assetUrl && g.interactionsAvailable === true, `status=${g.assetStatus} url=${g.assetUrl}`);
      check(checks, `[${e.cat.id}] car GLB is honestly labelled generic-reference`, g.assetScope === "generic-reference" && g.vehicleSpecific === false, `${g.assetScope} / vehicleSpecific=${g.vehicleSpecific}`);
    }
  }

  // Real buyer vehicle pages (screenshots for all six categories).
  for (const e of created) {
    if (!e.vehicleId) continue;
    await gotoSafe(buyer, `${BASE}/vehicle/${e.vehicleId}`);
    await buyer.getByText(new RegExp(e.cat.regNo, "i")).first().waitFor({ timeout: 40000 }).catch(() => {});
    const text = await buyer.locator("body").innerText().catch(() => "");
    check(checks, `[${e.cat.id}] buyer vehicle page renders the real registration`, text.includes(e.cat.regNo), e.cat.regNo);
    if (e.cat.twoWheeler) {
      check(checks, `[${e.cat.id}] buyer page never references a car GLB`, !/trustdrive-sedan|sedan\.glb|car\.glb/i.test(text), "no car GLB in rendered text");
      check(checks, `[${e.cat.id}] buyer page shows a labelled schematic`, /schematic|2D|not available|unavailable/i.test(text), "category schematic labelled");
    }
    e.evidence.push(await shot(buyer, `buyer-${e.cat.id}-detail`));
  }

  // ---- car-specific: DB-backed 3D hotspot + PDF + inquiry + seller reply ----
  const car = created.find((e) => e.cat.id === "passenger_car" && e.published);
  if (car?.vehicleId) {
    const dmg = await api(seller, "POST", `/api/v1/vehicles/${car.vehicleId}/damage`, {
      zoneId: "front_bumper", description: `Live audit dent ${RUN_ID}`, severity: "Moderate", repairStatus: "Repaired",
    });
    check(checks, `[buyer] damage record created for hotspot`, dmg.status === 201, `HTTP ${dmg.status} ${JSON.stringify(dmg.json?.error ?? {}).slice(0, 160)}`);
    await gotoSafe(buyer, `${BASE}/vehicle/${car.vehicleId}`);
    await buyer.getByText(/Recorded Defects/i).first().waitFor({ timeout: 90000 }).catch(() => {});
    const hotspot = buyer.locator('button[aria-label*="damage records"]').first();
    const hsVisible = await hotspot.waitFor({ state: "visible", timeout: 60000 }).then(() => true).catch(() => false);
    check(checks, `[buyer] 3D hotspot present for the stored damage`, hsVisible, "hotspot button");
    car.evidence.push(await shot(buyer, "buyer-car-3d-hotspot"));

    const pdfBtn = buyer.getByRole("button", { name: /PDF report/i });
    if (await pdfBtn.isVisible().catch(() => false)) {
      const pdfPromise = buyer.waitForResponse(
        (r) => r.url().includes(`/api/v1/reports/vehicle/${car.vehicleId}`) && r.request().method() === "POST",
        { timeout: 120000 }
      );
      await pdfBtn.evaluate((el) => el.click());
      const pdfRes = await pdfPromise.catch(() => null);
      const pdfJson = pdfRes ? await pdfRes.json().catch(() => ({})) : {};
      const reportId = pdfJson?.data?.id;
      check(checks, `[buyer] PDF report generated`, [200, 201].includes(pdfRes?.status()) && !!reportId, `HTTP ${pdfRes?.status()} id=${reportId}`);
      if (reportId) {
        const dl = await buyer.context().request.get(`${BASE}/api/v1/reports/${reportId}/download`);
        const body = await dl.body();
        check(checks, `[buyer] PDF download returns real %PDF bytes`, dl.status() === 200 && body.subarray(0, 4).toString() === "%PDF", `${body.length} bytes`);
      }
    }

    let formOpened = false;
    for (let i = 1; i <= 3 && !formOpened; i += 1) {
      await buyer.getByRole("button", { name: /Contact seller/i }).first().evaluate((el) => el.click()).catch(() => {});
      formOpened = await buyer.locator("#vehicle-inquiry").waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false);
      if (!formOpened) await buyer.waitForTimeout(1200);
    }
    check(checks, `[buyer] contact form opens`, formOpened, formOpened ? "visible" : "not visible");
    if (formOpened) {
      await buyer.locator("#vehicle-inquiry").fill(`Is the front-bumper damage repaired? Ref ${RUN_ID}`);
      const inqPromise = buyer.waitForResponse((r) => r.url().includes("/api/v1/inquiries") && r.request().method() === "POST", { timeout: 90000 });
      await buyer.getByRole("button", { name: /^Send inquiry$/i }).evaluate((el) => el.click());
      const inqRes = await inqPromise.catch(() => null);
      const inqJson = inqRes ? await inqRes.json().catch(() => ({})) : {};
      const inquiryId = inqJson?.data?.id;
      check(checks, `[buyer] inquiry returns 201`, inqRes?.status() === 201 && !!inquiryId, `HTTP ${inqRes?.status()} id=${inquiryId}`);
      if (inquiryId) {
        const inqRow = sqlOne("SELECT listing_id, status FROM inquiries WHERE id = ?", inquiryId);
        check(checks, `[buyer] inquiry persisted in SQLite`, !!inqRow && inqRow.listing_id === car.listingId, `${inqRow?.status}`);
        await gotoSafe(seller, `${BASE}/seller/inquiries`);
        await seller.getByPlaceholder("Type a message…").waitFor({ timeout: 90000 }).catch(() => {});
        const seen = await seller.getByText(new RegExp(RUN_ID, "i")).first().isVisible().catch(() => false);
        check(checks, `[seller] inbox shows the buyer message`, seen, RUN_ID);
        if (seen) {
          await seller.getByPlaceholder("Type a message…").fill(`Yes — repaired and documented. Ref ${RUN_ID}`);
          const replyPromise = seller.waitForResponse((r) => r.url().includes(`/api/v1/inquiries/${inquiryId}/messages`) && r.request().method() === "POST", { timeout: 90000 });
          await seller.getByRole("button", { name: /^Send$/i }).evaluate((el) => el.click());
          const replyRes = await replyPromise.catch(() => null);
          check(checks, `[seller] reply returns 201`, replyRes?.status() === 201, `HTTP ${replyRes?.status()}`);
          const thread = await api(buyer, "GET", `/api/v1/inquiries/${inquiryId}`);
          const messages = thread.json?.data?.messages ?? [];
          check(checks, `[buyer] receives the seller reply`, messages.some((m) => String(m.body).includes("repaired and documented")), `${messages.length} messages`);
          car.evidence.push(await shot(seller, "seller-inquiry-reply"));
        }
      }
    }
  }

  record("Buyer marketplace & multi-category", checks, { evidence: screenshots.filter((s) => s.startsWith("SCREENSHOTS/buyer-")) });
}

// --------------------------------------------------------------- backend API
async function testBackendDirect() {
  const checks = [];
  log(`\n########## BACKEND SERVICE (direct, real HTTP) ##########`);
  const health = await fetch(`${BACKEND}/health`).then((r) => r.json()).catch(() => null);
  check(checks, "[backend] /health reports the multicategory service", health?.version === "intelligence-2.0.0-multicategory", String(health?.version));
  check(checks, "[backend] shared SQLite is connected", health?.database?.shared_with_nextjs === true && health?.database?.tables === 54, JSON.stringify(health?.database));
  check(checks, "[backend] LangGraph orchestrator with 16-node registry", health?.agent?.orchestrator === "langgraph" && health?.agent?.node_registry_count === 16, `${health?.agent?.orchestrator} / ${health?.agent?.node_registry_count}`);
  for (const cat of CATEGORIES) {
    const profile = health?.agent?.category_profiles?.[cat.id];
    check(checks, `[backend] ${cat.id} profile declares ${cat.expectedNodes} conditional nodes`, profile?.count === cat.expectedNodes, String(profile?.count));
    if (profile) {
      const hasEv = (profile.nodes ?? []).includes("EVBatteryAnalysisNode");
      check(checks, `[backend] ${cat.id} ${cat.electric ? "includes" : "omits"} EVBatteryAnalysisNode`, hasEv === cat.electric, `hasEvNode=${hasEv}`);
    }
  }

  // Service-token gate: anonymous intelligence calls must be rejected.
  const anon = await fetch(`${BACKEND}/api/intelligence/investigate`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vehicle_id: created[0]?.vehicleId ?? "none", question: "probe", thread_id: null }),
  }).catch(() => null);
  check(checks, "[security] anonymous intelligence call is rejected", [401, 403, 422].includes(anon?.status), `HTTP ${anon?.status}`);

  // Direct agent call per category: proves the conditional graph, not just /health.
  for (const e of created) {
    if (!e.vehicleId) continue;
    const res = await fetch(`${BACKEND}/api/intelligence/investigate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Service-Token": SERVICE_TOKEN },
      body: JSON.stringify({ vehicle_id: e.vehicleId, question: "Summarise the verified evidence and open findings.", thread_id: null }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    const nodes = Array.isArray(json.nodes) ? json.nodes : [];
    check(checks, `[backend] ${e.cat.id} investigation HTTP 200 on the real agent`, res?.status === 200, `HTTP ${res?.status}`);
    check(checks, `[backend] ${e.cat.id} executed ${e.cat.expectedNodes} LangGraph nodes`, nodes.length === e.cat.expectedNodes, `${nodes.length} nodes / ${json.orchestrator}`);
    check(checks, `[backend] ${e.cat.id} EV node conditional is correct`, nodes.includes("EVBatteryAnalysisNode") === e.cat.electric, nodes.includes("EVBatteryAnalysisNode") ? "EV node present" : "EV node absent");
    const row = sqlOne("SELECT COUNT(*) AS n FROM agent_investigations WHERE vehicle_id = ?", e.vehicleId);
    check(checks, `[backend] ${e.cat.id} agent_investigations row persisted`, Number(row?.n) > 0, `${row?.n} rows`);
  }
  record("Backend service & API", checks);
}

// --------------------------------------------------------- security / edges
async function testSecurity(seller, buyer) {
  const checks = [];
  log(`\n########## SECURITY & EDGE CASES ##########`);

  await gotoSafe(seller, `${BASE}/admin`);
  await seller.waitForTimeout(1200);
  const adminUrl = seller.url();
  const adminText = await seller.locator("body").innerText().catch(() => "");
  check(checks, "[rbac] seller cannot open /admin", !adminUrl.includes("/admin") || /not authorized|access denied|403|forbidden/i.test(adminText), `final url=${adminUrl}`);

  const target = created[0];
  if (target?.vehicleId) {
    const cross = await api(buyer, "GET", `/api/v1/seller/vehicles/${target.vehicleId}`);
    check(checks, "[rbac] buyer blocked from seller vehicle endpoint", [401, 403].includes(cross.status), `HTTP ${cross.status}`);
    const createAsBuyer = await api(buyer, "POST", "/api/v1/seller/vehicles", { make: "X", model: "Y", regNo: "MH01ZZ0001", vin: "9".repeat(17), categoryId: "passenger_car" });
    check(checks, "[rbac] buyer cannot create a seller vehicle", [401, 403].includes(createAsBuyer.status), `HTTP ${createAsBuyer.status}`);
    const pubAsBuyer = await api(buyer, "POST", `/api/v1/seller/listings/${target.listingId}/publish`, {});
    check(checks, "[rbac] buyer cannot publish a listing", [401, 403].includes(pubAsBuyer.status), `HTTP ${pubAsBuyer.status}`);
  }

  if (target?.cat) {
    const dup = await api(seller, "POST", "/api/v1/seller/vehicles", {
      make: target.cat.make, model: target.cat.model, year: target.cat.year,
      regNo: target.cat.regNo, vin: target.cat.primary, fuel: target.cat.electric ? "Electric" : "Petrol",
      category: target.cat.label, categoryId: target.cat.id, condition: "Good",
    });
    check(checks, "[edge] duplicate registration is detected with HTTP 409", dup.status === 409 && dup.json?.error?.code === "DUPLICATE_REG", `HTTP ${dup.status} ${dup.json?.error?.code}`);
  }

  // No universal 17-char VIN rule: a 10-char frame is valid for a 2W, invalid for a car.
  const tw = CATEGORIES.find((c) => c.twoWheeler && !c.electric);
  const car = CATEGORIES.find((c) => !c.twoWheeler && !c.electric);
  const shortFrame = uniqueShortFrame(); // 10 chars, unique per run
  const twReg = uniqueReg(20);
  const carReg = uniqueReg(21);
  const twCreate = await api(seller, "POST", "/api/v1/seller/vehicles", {
    make: "Bajaj", model: "FrameBike", year: 2020, regNo: twReg, vin: shortFrame,
    fuel: "Petrol", category: tw.label, categoryId: tw.id, condition: "Good",
    location: "Pune, Maharashtra", price: 55000, km: 30000,
  });
  check(checks, "[edge] 2W 10-char frame number is ACCEPTED (no universal VIN rule)", twCreate.status === 201, `frame=${shortFrame} (${shortFrame.length} chars) HTTP ${twCreate.status} ${JSON.stringify(twCreate.json?.error ?? {}).slice(0, 160)}`);
  const carCreate = await api(seller, "POST", "/api/v1/seller/vehicles", {
    make: "Test", model: "ShortVin", year: 2020, regNo: carReg, vin: shortFrame,
    fuel: "Petrol", category: car.label, categoryId: car.id, condition: "Good",
  });
  check(checks, "[edge] car with the same 10-char frame is REJECTED", carCreate.status === 400 && carCreate.json?.error?.code === "VALIDATION_FAILED", `HTTP ${carCreate.status} ${carCreate.json?.error?.code}`);

  // EVs must not be given combustion identifiers.
  const ev = CATEGORIES.find((c) => c.electric);
  const evReg = uniqueReg(22);
  const evPrimary = uniquePrimary(ev, 23);
  const evCreate = await api(seller, "POST", "/api/v1/seller/vehicles", {
    make: "Ather", model: "450X", year: 2024, regNo: evReg, vin: evPrimary,
    fuel: "Electric", category: ev.label, categoryId: ev.id, condition: "Good",
    specs: { engine_number: "PETROL123", engine_cc: "150" },
  });
  check(checks, "[edge] EV draft with petrol fields is not silently turned into a combustion vehicle", evCreate.status === 201 || evCreate.status === 400, `HTTP ${evCreate.status}`);
  if (evCreate.status === 201) {
    const evId = evCreate.json?.data?.id;
    const evRow = sqlOne("SELECT fuel, vehicle_category_id FROM vehicles WHERE id = ?", evId);
    check(checks, "[edge] EV keeps Electric fuel + EV category", evRow?.fuel === "Electric" && evRow?.vehicle_category_id === ev.id, `${evRow?.fuel} / ${evRow?.vehicle_category_id}`);
  }

  // Malicious / malformed identity inputs must be rejected, not stored.
  const badReg = await api(seller, "POST", "/api/v1/seller/vehicles", {
    make: "<script>alert(1)</script>", model: "XSS", year: 2020,
    regNo: "MH01' OR 1=1--", vin: "9".repeat(17), categoryId: "passenger_car",
  });
  check(checks, "[security] malformed/injection-style registration is rejected", badReg.status === 400, `HTTP ${badReg.status}`);

  // Planned categories must NOT be offered as implemented in the wizard.
  await gotoSafe(seller, `${BASE}/seller/add-vehicle`);
  await waitForHydration(seller, "select");
  const options = await seller.getByLabel(/Vehicle category/i).locator("option").evaluateAll((els) => els.map((e) => e.value)).catch(() => []);
  check(checks, "[taxonomy] wizard offers exactly the 6 implemented categories", options.filter(Boolean).length === 6, options.join(","));
  check(checks, "[taxonomy] planned categories are NOT selectable", !options.some((o) => /moped|three_wheeler|suv|hybrid/.test(o)), options.join(","));
  await shot(seller, "security-category-taxonomy");

  record("Security & edge cases", checks);
}

// ------------------------------------------------------------------------ main
async function main() {
  log(`RUN ${RUN_ID} · base=${BASE} · backend=${BACKEND}`);
  log(`fixtures: ${CATEGORIES.map((c) => `${c.id}=${c.regNo}/${c.primary}`).join("\n          ")}`);

  const sellerCtx = await newContext();
  const seller = await sellerCtx.newPage();
  watchConsole(seller);
  const login = await loginViaUI(seller, "seller");
  log(`seller login: HTTP ${login.status} → ${login.url}`);
  record("Seller login", [
    { label: "Seller login succeeds through the real form", ok: login.status === 200 && /\/seller/.test(login.url), detail: login.url },
  ]);
  await shot(seller, "seller-dashboard");

  for (const cat of CATEGORIES.filter((c) => !ONLY || ONLY.includes(c.id))) {
    try { await testCategory(seller, sellerCtx, cat); }
    catch (e) { log(`ERROR in ${cat.id}: ${e?.message || e}`); record(`Category: ${cat.label}`, [{ label: "category run completed without an exception", ok: false, detail: String(e?.stack || e).slice(0, 600) }], { categoryId: cat.id, error: String(e?.message || e) }); }
  }

  const buyerCtx = await newContext();
  const buyer = await buyerCtx.newPage();
  watchConsole(buyer);
  const buyerLogin = await loginViaUI(buyer, "buyer");
  log(`buyer login: HTTP ${buyerLogin.status} → ${buyerLogin.url}`);
  record("Buyer login", [
    { label: "Buyer login succeeds through the real form", ok: buyerLogin.status === 200 && /\/buyer/.test(buyerLogin.url), detail: buyerLogin.url },
  ]);

  try { await testBuyer(buyer, seller); } catch (e) { log(`ERROR in buyer: ${e?.message || e}`); record("Buyer marketplace & multi-category", [{ label: "buyer run completed without an exception", ok: false, detail: String(e?.stack || e).slice(0, 600) }]); }
  try { await testBackendDirect(); } catch (e) { log(`ERROR in backend: ${e?.message || e}`); record("Backend service & API", [{ label: "backend run completed without an exception", ok: false, detail: String(e?.stack || e).slice(0, 600) }]); }
  try { await testSecurity(seller, buyer); } catch (e) { log(`ERROR in security: ${e?.message || e}`); record("Security & edge cases", [{ label: "security run completed without an exception", ok: false, detail: String(e?.stack || e).slice(0, 600) }]); }

  const expectedConsole = consoleErrors.filter((t) => /\b(400|401|403|409|422)\b/.test(t));
  const unexpectedConsole = consoleErrors.filter((t) => !/\b(400|401|403|409|422)\b/.test(t));
  const summary = {
    runId: RUN_ID,
    base: BASE,
    backend: BACKEND,
    generatedAt: new Date().toISOString(),
    categoriesTested: CATEGORIES.map((c) => c.id),
    created: created.map((e) => ({
      categoryId: e.cat.id,
      vehicleId: e.vehicleId,
      listingId: e.listingId,
      regNo: e.cat.regNo,
      primary: e.cat.primary,
      published: e.published,
      investigation: e.investigation,
      rc: e.rc,
      evidence: e.evidence,
    })),
    totals: {
      features: results.length,
      passedFeatures: results.filter((r) => r.status === "PASS").length,
      failedFeatures: results.filter((r) => r.status === "FAIL").length,
      checks: results.reduce((n, r) => n + r.total, 0),
      passedChecks: results.reduce((n, r) => n + r.passed, 0),
      failedChecks: results.reduce((n, r) => n + r.failed, 0),
    },
    screenshotCount: screenshots.length,
    screenshots,
    consoleErrors: {
      total: consoleErrors.length,
      expectedHttpErrors: expectedConsole.length,
      unexpected: unexpectedConsole,
      sample: consoleErrors.slice(0, 30),
    },
    features: results,
  };
  fs.writeFileSync(path.join(__dirname, "live-e2e-summary.json"), JSON.stringify(summary, null, 2));
  log(`\nresults → qa/live-e2e-summary.json`);
  log(`screenshots → SCREENSHOTS/ (${screenshots.length})`);
  log(`console errors: ${consoleErrors.length} (${expectedConsole.length} expected HTTP rejections, ${unexpectedConsole.length} unexpected)`);
  for (const r of results) log(`${r.status.padEnd(4)} ${r.feature} (${r.passed}/${r.total})`);

  await closeAll();
  if (results.some((r) => r.status !== "PASS")) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error("FATAL", err);
  try { await closeAll(); } catch { /* ignore */ }
  process.exitCode = 1;
});
