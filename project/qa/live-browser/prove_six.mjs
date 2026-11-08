// ---------------------------------------------------------------------------
// Live proof: the six mandatory TrustDrive features, driven through the real
// Chromium UI against the running Next.js + Python services and the shared DB.
//
//   RC upload + OCR | Mileage detection | AI investigation
//   Damage inspection | Marketplace | Buyer inquiries
//
// Every check below is an observed result (HTTP body, rendered text or a SQLite
// row), not a source-code claim. Screenshots are written to qa/live-browser.
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
  shot,
  closeAll,
} from "../live/harness.mjs";

const ACCOUNTS = {
  seller: { email: "samarth@trustdrive.dev", password: "demo1234", home: /\/seller/ },
  buyer: { email: "rohan@trustdrive.dev", password: "demo1234", home: /\/buyer/ },
};

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
    await page
      .locator('form button[type="submit"]')
      .evaluate((el) => (el).click())
      .catch(() => {});
    const res = await responsePromise;
    last = res;
    if (res && res.status() === 200) {
      await page.waitForURL(acc.home, { timeout: 45000 }).catch(() => {});
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await page.waitForTimeout(600);
      return { status: res.status(), url: page.url() };
    }
    // A native form GET means React had not hydrated yet; wait and retry.
    await page.waitForTimeout(1500);
  }
  throw new Error(`${role} login failed after 3 attempts (last HTTP ${last?.status() ?? "no response"})`);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots-six");
fs.mkdirSync(SHOTS, { recursive: true });

const RUN_ID = Date.now().toString(36).toUpperCase();
const results = [];
const consoleErrors = [];

function record(feature, checks, extra = {}) {
  const failed = checks.filter((c) => !c.ok);
  results.push({
    feature,
    status: failed.length === 0 ? "PASS" : "FAIL",
    total: checks.length,
    failed: failed.length,
    checks,
    ...extra,
  });
  console.log(`\n=== ${feature}: ${failed.length === 0 ? "PASS" : "FAIL"} (${checks.length - failed.length}/${checks.length}) ===`);
  return failed.length === 0;
}

function check(list, label, ok, detail = "") {
  list.push({ label, ok: !!ok, detail: String(detail ?? "").slice(0, 900) });
  console.log(`  ${ok ? "PASS" : "FAIL"} ${label}${detail ? ` :: ${String(detail).slice(0, 240)}` : ""}`);
  return !!ok;
}

/**
 * Multipart upload from inside the page's own origin. Playwright's
 * `APIRequestContext.multipart` cannot send a Node Buffer in this version
 * (`stream.on is not a function`), so the real browser FormData path is used
 * instead — which is also exactly what the UI does.
 */
async function uiUpload(page, pathname, files) {
  return page.evaluate(
    async ({ pathname, files }) => {
      const fd = new FormData();
      for (const f of files) {
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
    { pathname, files }
  );
}

async function screenshot(page, name) {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  return path.relative(path.join(__dirname, "..", ".."), file).replaceAll("\\", "/");
}

/**
 * Next.js dev compiles a route on first request. On a cold server that can take
 * far longer than Playwright's 30 s default, which produced false "navigation
 * timeout" failures even though the page rendered. Retry with a realistic
 * budget and accept the document once the URL has actually changed.
 */
async function gotoSafe(page, url, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
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
      await page.waitForTimeout(1500 * attempt);
    }
  }
  throw lastError;
}

function watchConsole(page) {
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 400));
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${String(err).slice(0, 400)}`));
}

/** Render an RC-like document and screenshot it so RapidOCR has real pixels to read. */
async function makeRcImage(context, { regNo, vin, file }) {
  const p = await context.newPage();
  await p.setViewportSize({ width: 1100, height: 760 });
  await p.setContent(`<!doctype html><html><body style="margin:0;background:#e8e8e8">
    <div id="rc" style="width:1000px;margin:40px auto;background:#fff;border:3px solid #111;padding:44px 54px;font-family:Arial,Helvetica,sans-serif;color:#111">
      <div style="text-align:center;font-size:30px;font-weight:700;letter-spacing:2px">GOVERNMENT OF MAHARASHTRA</div>
      <div style="text-align:center;font-size:26px;font-weight:700;margin-top:6px">REGISTRATION CERTIFICATE</div>
      <div style="height:3px;background:#111;margin:22px 0 26px"></div>
      <table style="font-size:30px;line-height:1.72;border-spacing:0 4px">
        <tr><td style="width:420px;color:#333">Registration Number</td><td style="font-weight:700">${regNo}</td></tr>
        <tr><td style="color:#333">Chassis Number (VIN)</td><td style="font-weight:700;letter-spacing:1px">${vin}</td></tr>
        <tr><td style="color:#333">Owner Name</td><td>Samarth Deshmukh</td></tr>
        <tr><td style="color:#333">Vehicle Model</td><td>Honda City</td></tr>
        <tr><td style="color:#333">Fuel Type</td><td>Petrol</td></tr>
        <tr><td style="color:#333">Registration Date</td><td>01/04/2021</td></tr>
        <tr><td style="color:#333">Valid Till</td><td>31/12/2030</td></tr>
        <tr><td style="color:#333">Odometer</td><td>45000 km</td></tr>
      </table>
    </div></body></html>`);
  await p.waitForTimeout(300);
  const buf = await p.screenshot({ type: "png" });
  fs.writeFileSync(file, buf);
  await p.close();
  return buf;
}

function randomVin() {
  const digits = String(Date.now()).slice(-10);
  const letters = "ABCDEFGHJKLMNPRSTUVWXYZ";
  let tail = "";
  for (let i = 0; i < 4; i += 1) tail += letters[Math.floor(Math.random() * letters.length)];
  return `MAT${digits}${tail}`;
}

async function main() {
  const sellerCtx = await newContext();
  const seller = await sellerCtx.newPage();
  watchConsole(seller);

  // ---------------------------------------------------------------- setup ---
  const login = await loginViaUI(seller, "seller");
  console.log(`seller login: HTTP ${login.status} → ${login.url}`);

  const regNo = `MH12QA${String(1000 + Math.floor(Math.random() * 9000))}`;
  const vin = randomVin();
  const create = await api(seller, "POST", "/api/v1/vehicles", {
    regNo,
    vin,
    make: "Honda",
    model: "City",
    variant: "VX",
    year: 2021,
    fuel: "Petrol",
    transmission: "Automatic",
    color: "White",
    category: "Sedan",
    askingPrice: 875000,
    mileage: 45000,
    location: "Mumbai, Maharashtra",
    description: `Live integration proof vehicle ${RUN_ID}`,
  });
  const vehicleId = create.json?.data?.id;
  if (!vehicleId) throw new Error(`vehicle create failed: HTTP ${create.status} ${create.text}`);
  console.log(`created vehicle ${vehicleId} (${regNo} / ${vin})`);

  const sellerId = sqlOne("SELECT id FROM users WHERE email = ?", "samarth@trustdrive.dev")?.id;

  // =============================================== 1. RC upload + OCR ======
  {
    const checks = [];
    const rcPath = path.join(SHOTS, `rc-${RUN_ID}.png`);
    await makeRcImage(sellerCtx, { regNo, vin, file: rcPath });

    await gotoSafe(seller, `${BASE}/seller/documents?vehicle=${vehicleId}`);
    await seller.getByText("Upload a document").waitFor({ timeout: 60000 });
    await waitForHydration(seller, "select.td-select");
    await seller.getByLabel("Document type").selectOption("rc");
    await seller.locator('input[type="file"]').last().setInputFiles(rcPath);

    const uploadPromise = seller.waitForResponse(
      (r) => r.url().includes(`/api/v1/vehicles/${vehicleId}/documents`) && r.request().method() === "POST",
      { timeout: 240000 }
    );
    await seller.getByRole("button", { name: /Upload document/i }).click();
    const uploadRes = await uploadPromise;
    const upload = await uploadRes.json().catch(() => ({}));
    const ocr = upload?.data?.ocr;
    const documentId = upload?.data?.id;

    check(checks, "upload returns 201 + document id", uploadRes.status() === 201 && !!documentId, `HTTP ${uploadRes.status()} id=${documentId}`);
    check(checks, "OCR really ran (status processed)", ocr?.status === "processed", JSON.stringify(ocr));
    check(checks, "engine + OCR method reported", !!ocr?.engine && !!ocr?.method && ocr?.isOcr === true, `${ocr?.engine} / ${ocr?.method} / isOcr=${ocr?.isOcr}`);
    check(checks, "confidence reported", typeof ocr?.confidence === "number" && ocr.confidence > 0, String(ocr?.confidence));
    check(checks, "extracted fields stored", (ocr?.fieldsStored ?? 0) > 0, `${ocr?.fieldsStored} rows`);

    const docRow = sqlOne("SELECT * FROM documents WHERE id = ?", documentId);
    let extracted = {};
    try { extracted = JSON.parse(docRow?.extracted || "{}"); } catch { /* keep */ }
    check(checks, "documents row persisted with python source", docRow && extracted.source === "python-intelligence", `status=${docRow?.status}`);
    check(checks, "extracted registration number matches", extracted?.fields?.registration_number === regNo, JSON.stringify(extracted?.fields ?? {}));
    check(checks, "extracted VIN matches the vehicle", extracted?.fields?.vin === vin, String(extracted?.fields?.vin));

    const extractionRows = sql("SELECT * FROM document_extractions WHERE document_id = ?", documentId);
    check(checks, "document_extractions rows persisted", extractionRows.length > 0, `${extractionRows.length} rows`);

    await seller.reload({ waitUntil: "domcontentloaded" });
    await seller.getByText("Document library").waitFor({ timeout: 30000 });
    const chip = seller.getByText(new RegExp(ocr?.engine ?? "rapidocr", "i")).first();
    check(checks, "UI shows the real OCR engine after refresh", await chip.isVisible().catch(() => false), ocr?.engine ?? "");
    const parsed = seller.locator("summary", { hasText: /Parsed fields/i }).first();
    if (await parsed.isVisible().catch(() => false)) await parsed.click();
    const regVisible = await seller.getByText(regNo, { exact: false }).first().isVisible().catch(() => false);
    check(checks, "UI shows extracted registration value", regVisible, regNo);

    const evidence = await screenshot(seller, "feat1-rc-ocr");
    record("RC upload + OCR", checks, { vehicleId, documentId, ocr, evidence });
  }

  // =============================================== 2. Mileage detection ====
  {
    const checks = [];
    const first = await api(seller, "POST", `/api/v1/vehicles/${vehicleId}/mileage`, {
      date: "2024-01-15", km: 52000, source: "service_invoice",
    });
    const second = await api(seller, "POST", `/api/v1/vehicles/${vehicleId}/mileage`, {
      date: "2025-02-20", km: 41000, source: "seller_submitted",
    });
    check(checks, "first reading accepted", first.status === 201, `HTTP ${first.status}`);
    check(checks, "rollback reading accepted + flagged", second.status === 201 && second.json?.data?.flagged === true, JSON.stringify(second.json?.data));

    const finding = sqlOne(
      "SELECT * FROM findings WHERE vehicle_id = ? AND code = 'ODOMETER_ROLLBACK' AND status = 'open' ORDER BY created_at DESC LIMIT 1",
      vehicleId
    );
    check(checks, "ODOMETER_ROLLBACK finding persisted", !!finding, finding?.title);

    const view = await api(seller, "GET", `/api/v1/vehicles/${vehicleId}/mileage`);
    const readings = view.json?.data?.readings ?? [];
    check(checks, "mileage API returns both readings", readings.length >= 2, readings.map((r) => `${r.km}@${r.date?.slice(0, 10)}`).join(", "));
    check(checks, "API exposes the rollback flag", readings.some((r) => r.flagged === 1 || r.flagged === true), JSON.stringify(readings.map((r) => r.flagged)));

    await gotoSafe(seller, `${BASE}/seller/vehicles/${vehicleId}`);
    await seller.getByText("Findings", { exact: true }).first().waitFor({ timeout: 60000 });
    await waitForHydration(seller, "button");
    const visible = await seller.getByText(/Odometer rollback detected/i).first().isVisible().catch(() => false);
    check(checks, "seller UI renders the rollback finding", visible, "Odometer rollback detected");

    const evidence = await screenshot(seller, "feat2-mileage-rollback");
    record("Mileage detection", checks, { vehicleId, findingId: finding?.id, evidence });
  }

  // =============================================== 3. AI investigation =====
  {
    const checks = [];
    await gotoSafe(seller, `${BASE}/seller/fraud?vehicle=${vehicleId}`);
    await seller.getByText("AI investigation", { exact: false }).first().waitFor({ timeout: 60000 });
    await waitForHydration(seller, "button");
    const runBtn = seller.getByRole("button", { name: /Run investigation/i });
    const postPromise = seller.waitForResponse(
      (r) => r.url().includes(`/api/v1/vehicles/${vehicleId}/ai-investigations`) && r.request().method() === "POST",
      { timeout: 240000 }
    );
    await runBtn.click();
    const res = await postPromise;
    const json = await res.json().catch(() => ({}));
    const data = json?.data ?? {};

    check(checks, "investigation endpoint returns 200", res.status() === 200, `HTTP ${res.status()}`);
    check(checks, "real Python agent answered", data.source === "python-intelligence", String(data.source));
    check(checks, "orchestrator reported honestly", ["langgraph", "sequential-fallback"].includes(data.orchestrator), String(data.orchestrator));
    const expectedNodes = Number(data.categoryProfile?.count ?? data.nodes?.length ?? 0);
    check(
      checks,
      "category node set executed",
      Array.isArray(data.nodes) && data.nodes.length >= 12 && data.nodes.length === expectedNodes,
      `${data.nodes?.length} nodes executed`
    );
    check(checks, "findings + citations returned", Array.isArray(data.findings) && Array.isArray(data.citations), `${data.findings?.length} findings / ${data.citations?.length} citations`);
    check(checks, "human-review state returned", !!data.humanReview, JSON.stringify(data.humanReview));

    const runRow = sqlOne("SELECT * FROM ai_runs WHERE vehicle_id = ? ORDER BY started_at DESC LIMIT 1", vehicleId);
    check(checks, "ai_runs row persisted", !!runRow && /langgraph|node/.test(runRow.graph), runRow?.graph ?? "none");

    const nodeVisible = await seller.getByText(/Node timeline \(\d+\/\d+\)/i).first().isVisible().catch(() => false);
    check(checks, "UI renders the executed-node timeline", nodeVisible, `${data.nodes?.length} nodes`);
    const orchestratorVisible = await seller.getByText(/sequential fallback|LangGraph/i).first().isVisible().catch(() => false);
    check(checks, "UI labels the orchestrator that actually ran", orchestratorVisible, String(data.orchestrator));

    const evidence = await screenshot(seller, "feat3-ai-investigation");
    record("AI investigation", checks, { vehicleId, runId: data.id, orchestrator: data.orchestrator, evidence });
  }

  // =============================================== 4. Damage inspection =====
  {
    const checks = [];
    await gotoSafe(seller, `${BASE}/seller/vehicles/${vehicleId}`);
    await seller.getByRole("button", { name: /Add damage/i }).waitFor({ timeout: 60000 });
    await waitForHydration(seller, "button");
    await seller.getByRole("button", { name: /Add damage/i }).click();
    const damageCard = seller.locator("section").filter({ hasText: "Record damage" }).last();
    await damageCard.locator("select").nth(0).selectOption({ index: 1 });
    await damageCard.locator("select").nth(1).selectOption("Moderate");
    await damageCard.locator("select").nth(2).selectOption("Repaired");
    await damageCard.locator("textarea").fill(`Live proof dent on front door ${RUN_ID}`);

    const postPromise = seller.waitForResponse(
      (r) => r.url().includes(`/api/v1/vehicles/${vehicleId}/damage`) && r.request().method() === "POST",
      { timeout: 60000 }
    );
    await seller.getByRole("button", { name: /Save damage/i }).click();
    const res = await postPromise;
    const json = await res.json().catch(() => ({}));
    check(checks, "damage endpoint returns 201", res.status() === 201, `HTTP ${res.status()}`);
    const damageId = json?.data?.id;
    const damageRow = sqlOne("SELECT * FROM damage_records WHERE id = ?", damageId);
    check(checks, "damage record persisted in SQLite", !!damageRow, `${damageId} zone=${damageRow?.zone_id}`);
    check(checks, "damage is linked to a real component zone", !!damageRow?.zone_id, String(damageRow?.zone_id));

    await seller.getByText(/Damage recorded/i).first().waitFor({ timeout: 15000 }).catch(() => {});
    const uiShown = await seller.getByText(new RegExp(RUN_ID, "i")).first().isVisible().catch(() => false);
    check(checks, "seller UI shows the saved damage text", uiShown, RUN_ID);
    const evidence = await screenshot(seller, "feat4-damage-record");
    record("Damage inspection", checks, { vehicleId, damageId, evidence });
  }

  // =============================================== 5. Marketplace ==========
  let listingId = null;
  {
    const checks = [];
    const listing = await api(seller, "POST", "/api/v1/seller/listings", {
      vehicleId,
      headline: `2021 Honda City VX — live proof ${RUN_ID}`,
      description: "Live integration proof listing created from the seller portal. All evidence is stored in the shared database.",
      condition: "Excellent",
      location: "Mumbai, Maharashtra",
      price: 875000,
    });
    listingId = listing.json?.data?.id;
    check(checks, "listing draft created", listing.status === 200 && !!listingId, `HTTP ${listing.status} id=${listingId}`);

    // Three real photos via the multipart endpoint (same bytes path the UI uses).
    const photoB64 = fs.readFileSync(path.join(SHOTS, `rc-${RUN_ID}.png`)).toString("base64");
    const upload = await uiUpload(seller, `/api/v1/vehicles/${vehicleId}/photos`, [
      { field: "files", name: "photo-1.png", type: "image/png", b64: photoB64 },
      { field: "files", name: "photo-2.png", type: "image/png", b64: photoB64 },
      { field: "files", name: "photo-3.png", type: "image/png", b64: photoB64 },
    ]);
    check(checks, "three photos uploaded", upload.status === 201, `HTTP ${upload.status} ${upload.text.slice(0, 180)}`);

    const publish = await api(seller, "POST", `/api/v1/seller/listings/${listingId}/publish`, {});
    check(checks, "listing published", publish.status === 200 && publish.json?.data?.status === "published", `${publish.status} ${publish.text.slice(0, 200)}`);
    const listingRow = sqlOne("SELECT * FROM listings WHERE id = ?", listingId);
    check(checks, "listings row is published in SQLite", listingRow?.status === "published", String(listingRow?.status));

    const buyerCtx = await newContext();
    const buyer = await buyerCtx.newPage();
    watchConsole(buyer);
    await loginViaUI(buyer, "buyer");

    const search = await api(buyer, "GET", `/api/v1/marketplace/listings?q=${encodeURIComponent(regNo)}&pageSize=50`);
    const items = search.json?.data?.items ?? [];
    const found = items.find((i) => i.vehicleId === vehicleId || i.id === vehicleId || i.registration === regNo);
    check(checks, "published vehicle appears in buyer marketplace API", !!found, `q=${regNo} → ${items.length} items`);

    await gotoSafe(buyer, `${BASE}/vehicle/${vehicleId}`);
    await buyer.addStyleTag({ content: "html{scroll-behavior:auto !important}" });
    await buyer.getByText(new RegExp(regNo, "i")).first().waitFor({ timeout: 60000 });
    await waitForHydration(buyer, "button");
    const headingVisible = await buyer.getByText(/Honda City/i).first().isVisible().catch(() => false);
    check(checks, "buyer vehicle page renders the listing", headingVisible, regNo);

    // 3D model + DB-backed hotspot. The GLB is ~12 MB, so wait for the pin to
    // mount instead of sampling immediately after the text chip renders.
    await buyer.getByText(/Recorded Defects/i).first().waitFor({ timeout: 90000 }).catch(() => {});
    const defectsVisible = await buyer.getByText(/Recorded Defects \(\d+\)/i).first().isVisible().catch(() => false);
    check(checks, "3D viewer lists the damage record", defectsVisible, "Recorded Defects");
    const hotspot = buyer.locator('button[aria-label*="damage records"]').first();
    await hotspot.waitFor({ state: "visible", timeout: 90000 }).catch(() => {});
    const hotspotVisible = await hotspot.isVisible().catch(() => false);
    check(checks, "3D hotspot exists for the stored damage", hotspotVisible, "hotspot button");
    if (hotspotVisible) {
      await hotspot.evaluate((el) => (el).click()).catch(() => {});
      await buyer.waitForTimeout(800);
      const detail = await buyer.getByText(new RegExp(RUN_ID, "i")).first().isVisible().catch(() => false);
      check(checks, "hotspot opens the matching damage detail", detail, RUN_ID);
    }
    const evidence = await screenshot(buyer, "feat5-marketplace-3d");

    // =========================================== 6. Buyer inquiries =======
    const inquiryChecks = [];
    await buyer.waitForLoadState("domcontentloaded", { timeout: 60000 }).catch(() => {});
    let formOpened = false;
    for (let attempt = 1; attempt <= 3 && !formOpened; attempt += 1) {
      await buyer
        .getByRole("button", { name: /Contact seller/i })
        .first()
        .evaluate((el) => (el).click())
        .catch(() => {});
      formOpened = await buyer
        .locator("#vehicle-inquiry")
        .waitFor({ state: "visible", timeout: 20000 })
        .then(() => true)
        .catch(() => false);
      if (!formOpened) await buyer.waitForTimeout(1500);
    }
    check(inquiryChecks, "contact form opens from the listing", formOpened, formOpened ? "visible" : "not visible");
    let inquiryId = null;
    let replyShot = null;
    if (formOpened) {
    await buyer.locator("#vehicle-inquiry").fill(`Is the front-door damage repaired? Ref ${RUN_ID}`);
    const inquiryPromise = buyer.waitForResponse(
      (r) => r.url().includes("/api/v1/inquiries") && r.request().method() === "POST",
      { timeout: 90000 }
    );
    await buyer.getByRole("button", { name: /^Send inquiry$/i }).evaluate((el) => (el).click());
    const inquiryRes = await inquiryPromise;
    const inquiryJson = await inquiryRes.json().catch(() => ({}));
    inquiryId = inquiryJson?.data?.id;
    check(inquiryChecks, "buyer inquiry returns 201", inquiryRes.status() === 201 && !!inquiryId, `HTTP ${inquiryRes.status()} id=${inquiryId}`);
    const inquiryRow = sqlOne("SELECT * FROM inquiries WHERE id = ?", inquiryId);
    check(inquiryChecks, "inquiry persisted in SQLite", !!inquiryRow && inquiryRow.listing_id === listingId, `${inquiryRow?.status}`);
    const msgRow = sqlOne("SELECT * FROM inquiry_messages WHERE inquiry_id = ? ORDER BY created_at ASC LIMIT 1", inquiryId);
    check(inquiryChecks, "buyer message persisted", !!msgRow && String(msgRow.body).includes(RUN_ID), msgRow?.body?.slice(0, 60));

    // Seller sees it in the real inbox and replies through the UI.
    await gotoSafe(seller, `${BASE}/seller/inquiries`);
    await seller.getByPlaceholder("Type a message…").waitFor({ timeout: 90000 });
    await waitForHydration(seller, 'input[placeholder="Type a message…"]');
    const buyerMsgVisible = await seller.getByText(new RegExp(RUN_ID, "i")).first().isVisible().catch(() => false);
    check(inquiryChecks, "seller inbox shows the buyer message", buyerMsgVisible, RUN_ID);
    await seller.getByPlaceholder("Type a message…").fill(`Yes — repaired and documented. Ref ${RUN_ID}`);
    const replyPromise = seller.waitForResponse(
      (r) => r.url().includes(`/api/v1/inquiries/${inquiryId}/messages`) && r.request().method() === "POST",
      { timeout: 90000 }
    );
    await seller.getByRole("button", { name: /^Send$/i }).evaluate((el) => (el).click());
    const replyRes = await replyPromise;
    check(inquiryChecks, "seller reply returns 201", replyRes.status() === 201, `HTTP ${replyRes.status()}`);

    const thread = await api(buyer, "GET", `/api/v1/inquiries/${inquiryId}`);
    const messages = thread.json?.data?.messages ?? [];
    check(inquiryChecks, "buyer receives the seller reply", messages.some((m) => String(m.body).includes("repaired and documented")), `${messages.length} messages`);
    const replyShotInner = await screenshot(seller, "feat6-seller-inbox-reply");
    replyShot = replyShotInner;
    }

    // PDF report + persistence (part of the buyer workflow proof).
    await gotoSafe(buyer, `${BASE}/vehicle/${vehicleId}`);
    await buyer.addStyleTag({ content: "html{scroll-behavior:auto !important}" });
    await buyer.getByRole("button", { name: /PDF report/i }).waitFor({ timeout: 60000 });
    await waitForHydration(buyer, "button");
    const reportPromise = buyer.waitForResponse(
      (r) => r.url().includes(`/api/v1/reports/vehicle/${vehicleId}`) && r.request().method() === "POST",
      { timeout: 120000 }
    );
    await buyer.getByRole("button", { name: /PDF report/i }).evaluate((el) => (el).click());
    const reportRes = await reportPromise;
    const reportJson = await reportRes.json().catch(() => ({}));
    const reportId = reportJson?.data?.id;
    check(inquiryChecks, "PDF report generated", reportRes.status() === 201 || reportRes.status() === 200, `HTTP ${reportRes.status()} id=${reportId}`);
    if (reportId) {
      const dl = await buyerCtx.request.get(`${BASE}/api/v1/reports/${reportId}/download`);
      const body = await dl.body();
      check(inquiryChecks, "PDF download is a real PDF", dl.status() === 200 && body.subarray(0, 4).toString() === "%PDF", `${body.length} bytes`);
      const reportRow = sqlOne("SELECT * FROM reports WHERE id = ?", reportId);
      check(inquiryChecks, "reports row persisted", !!reportRow, reportRow?.status);
    }

    record("Marketplace", checks, { vehicleId, listingId, evidence });
    record("Buyer inquiries", inquiryChecks, { vehicleId, listingId, inquiryId, evidence: replyShot });

    await buyerCtx.close();
  }

  // ------------------------------------------------------------- summary ---
  const summary = {
    runId: RUN_ID,
    base: BASE,
    vehicleId,
    regNo,
    vin,
    sellerId,
    listingId,
    generatedAt: new Date().toISOString(),
    features: results,
    consoleErrors: consoleErrors.slice(0, 40),
  };
  fs.writeFileSync(path.join(__dirname, "six_features_results.json"), JSON.stringify(summary, null, 2));
  console.log(`\nresults → ${path.join(__dirname, "six_features_results.json")}`);
  console.log(`console errors captured: ${consoleErrors.length}`);
  for (const r of results) console.log(`${r.status.padEnd(4)} ${r.feature} (${r.total - r.failed}/${r.total})`);

  await closeAll();
  if (results.some((r) => r.status !== "PASS")) process.exitCode = 1;
}

main().catch(async (err) => {
  console.error("FATAL", err);
  try { await closeAll(); } catch { /* ignore */ }
  process.exitCode = 1;
});
