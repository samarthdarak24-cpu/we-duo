/**
 * TrustDrive — comprehensive LIVE integration audit.
 * Probes BOTH the Next.js frontend app routes AND the FastAPI backend routers
 * against the running servers. Flags:
 *   - 5xx errors (real bugs)
 *   - 200 responses missing the `{ data }` envelope the frontend expects
 *   - auth leaks (anon gets 200 where auth is required)
 *   - backend<->frontend field/shape mismatches
 *
 *   node qa/integration_audit.mjs
 */
import fs from "node:fs";

const FE = "http://127.0.0.1:3000";
const BE = "http://127.0.0.1:8000";

// Global fetch timeout so a stuck server can't hang the run.
const _origFetch = globalThis.fetch;
globalThis.fetch = (url, opts = {}) =>
  _origFetch(url, { ...opts, signal: opts.signal || AbortSignal.timeout(20000) });

const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass: !!pass, detail: String(detail).slice(0, 240) });
  if (!pass) console.log(`  [FAIL] ${name} — ${String(detail).slice(0, 140)}`);
};

async function login(email, password) {
  const r = await fetch(`${FE}/api/v1/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (r.status !== 200) return null;
  const sc = typeof r.headers.getSetCookie === "function"
    ? r.headers.getSetCookie() : [r.headers.get("set-cookie")].filter(Boolean);
  const m = (sc.find((c) => /td_token=/.test(c)) || "").match(/td_token=([^;]+)/);
  return m ? m[1] : null;
}
const api = async (method, url, token, body, form = false) => {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  let payload;
  if (body !== undefined) {
    if (form) payload = body;
    else { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
  }
  const r = await fetch(url, { method, headers, body: payload });
  let data = null; try { data = await r.json(); } catch { try { data = await r.text(); } catch {} }
  return { status: r.status, data };
};
// Frontend route (always expects { data } envelope on success)
const fe = async (method, path, token, body, form = false) =>
  api(method, `${FE}/api/v1${path}`, token, body, form);
// Backend direct route
const be = async (method, path, token, body) => {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  let payload;
  if (body !== undefined) { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
  const r = await fetch(`${BE}${path}`, { method, headers, body: payload });
  let data = null; try { data = await r.json(); } catch { try { data = await r.text(); } catch {} }
  return { status: r.status, data };
};

const VEHICLES = ["v-bmw", "v-ducati", "v-seller", "v-camry", "v-audi", "v-tata",
  "v-hyundai", "v-toyota", "v-royalenfield", "v-merc", "v-bmw-bike"];

const FE_VEHICLE_GETS = [
  "/3d-model", "/documents", "/photos", "/theft", "/trust", "/findings",
  "/history", "/damage", "/report", "/passport", "/verification",
  "/near-duplicates", "/evidence-graph", "/mileage", "/pricing", "/insights",
  "/alerts", "/claims", "/components", "/provider-checks", "/chain", "/risk",
];

(async () => {
  const seller = await login("samarth@trustdrive.dev", "demo1234");
  const buyer = await login("rohan@trustdrive.dev", "demo1234");
  const admin = await login("admin@trustdrive.dev", "demo1234");
  const seller2 = await login("weduo@trustdrive.dev", "demo1234");
  ok("auth — all role tokens issued", !!seller && !!buyer && !!admin && !!seller2,
    `seller=${!!seller} buyer=${!!buyer} admin=${!!admin} seller2=${!!seller2}`);
  if (!seller) { finish(); return; }

  // ---- 1. Frontend server health ----
  const health = await fetch(`${FE}/api/v1/health/ready`);
  ok("FE health/ready 200", health.status === 200, `status=${health.status}`);

  // ---- 2. Vehicle GET sweep (detect 500 / missing data envelope) ----
  for (const v of VEHICLES) {
    // the vehicle itself
    const base = await fe("GET", `/vehicles/${v}`, buyer);
    const hasEnv = base.data && (base.data.data !== undefined || base.data.id !== undefined || base.data.vehicle);
    ok(`FE GET /vehicles/${v}`, base.status === 200 && hasEnv,
      `status=${base.status} env=${hasEnv}`);
    for (const sub of FE_VEHICLE_GETS) {
      const r = await fe("GET", `/vehicles/${v}${sub}`, buyer);
      // acceptable: 200 (with data), or honest 403/404. 500 = bug.
      const bad = r.status >= 500;
      if (bad) ok(`FE GET /vehicles/${v}${sub}`, false, `status=${r.status}`);
      else if (r.status === 200) {
        const d = r.data?.data ?? r.data;
        const empty = d === null || d === undefined || (Array.isArray(d) && d.length === 0);
        // not all endpoints must return data, but a 200 should at least carry the envelope
        const env = r.data && (r.data.data !== undefined || r.data.ok !== undefined || Array.isArray(r.data.data));
        if (!env && !empty) ok(`FE GET /vehicles/${v}${sub}`, false, `200 but no {data} envelope`);
      }
    }
  }

  // ---- 3. Role dashboards / feature hubs ----
  for (const [role, tok, path] of [
    ["buyer", buyer, "/buyer/overview"], ["buyer", buyer, "/buyer/recommended"],
    ["seller", seller, "/seller/overview"], ["admin", admin, "/admin/queue"],
    ["any", buyer, "/categories"], ["any", buyer, "/marketplace/listings"],
    ["any", buyer, "/marketplace/search?q=bmw"], ["any", buyer, "/reports"],
    ["any", buyer, "/notifications"], ["any", buyer, "/saved"], ["any", buyer, "/compare"],
    ["any", buyer, "/inquiries"], ["any", buyer, "/alerts/evaluate"],
    ["any", buyer, "/ai/stack"], ["any", buyer, "/public/sample-report"],
  ]) {
    const r = await fe("GET", path, tok === "any" ? null : tok);
    const bad = r.status >= 500;
    if (bad) ok(`FE GET ${path} (${role})`, false, `status=${r.status}`);
    else if (r.status === 200) {
      const env = r.data && (r.data.data !== undefined || r.data.ok !== undefined);
      if (!env) ok(`FE GET ${path} (${role})`, false, `200 but no {data} envelope`);
    }
  }

  // ---- 4. Auth-gate leaks: anon should NOT get 200 on protected routes ----
  const anonProbe = await fe("GET", "/me", null);
  ok("FE auth gate — /me anon blocked (401/403)", [401, 403].includes(anonProbe.status), `status=${anonProbe.status}`);
  const anonSeller = await fe("GET", "/seller/overview", null);
  ok("FE auth gate — /seller/overview anon blocked", [401, 403].includes(anonSeller.status), `status=${anonSeller.status}`);

  // ---- 5. AI investigation (backend proxy) — must NOT be next-deterministic-fallback ----
  const inv = await fe("POST", "/vehicles/v-bmw/ai-investigations", seller,
    { question: "Any fraud signals?" });
  const invD = inv.data?.data || inv.data || {};
  ok("FE->BE AI investigation uses LangGraph (not next fallback)",
    inv.status === 200 && invD.source !== "next-deterministic-fallback" && invD.orchestrator === "langgraph",
    `status=${inv.status} source=${invD.source} orch=${invD.orchestrator}`);

  // ---- 6. OCR bridge (backend proxy) — document upload processes ----
  const uploadsDir = "C:/Users/darak/Downloads/finall caranimation/.data/uploads/documents";
  let pdfPath = null;
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = `${d}/${e.name}`; if (e.isDirectory()) { const f = walk(p); if (f) return f; }
    else if (e.name.toLowerCase().endsWith(".pdf")) return p; } return null; };
  try { pdfPath = walk(uploadsDir); } catch {}
  if (pdfPath) {
    const buf = fs.readFileSync(pdfPath);
    const fd = new FormData();
    fd.append("file", new Blob([buf], { type: "application/pdf" }), "audit.pdf");
    fd.append("type", "insurance"); fd.append("consent", "true");
    const up = await fetch(`${FE}/api/v1/vehicles/v-seller/documents`,
      { method: "POST", headers: { Authorization: `Bearer ${seller}` }, body: fd });
    const upj = await up.json().catch(() => ({}));
    const ocr = upj?.data?.ocr || upj?.ocr;
    const ran = ocr && (ocr.status === "processed" || ocr.status === "completed" || ocr.extracted || ocr.text);
    ok("FE->BE OCR bridge runs (not stuck pending)", up.status === 201 && ran,
      `status=${up.status} ocr=${JSON.stringify(ocr).slice(0, 120)}`);
  } else ok("FE->BE OCR bridge", false, "no sample pdf found");

  // ---- 7. Seller listing lifecycle (backend-independent, but exercises publish gate) ----
  const mk = await fe("POST", "/seller/listings", seller,
    { vehicleId: "v-hyundai", headline: "Audit", description: "audit", condition: "used" });
  let lid;
  if (mk.status === 200 || mk.status === 201) lid = mk.data?.data?.id || mk.data?.id;
  else if (mk.status === 409) {
    const list = await fe("GET", "/seller/listings", seller);
    const it = (list.data?.data?.items || list.data?.items || []).find(
      (x) => x.vehicle?.id === "v-hyundai" || x.listing?.vehicle_id === "v-hyundai");
    lid = it?.listing?.id;
  }
  if (lid) {
    const ph = await fe("GET", `/vehicles/v-hyundai/photos`, seller);
    const have = (ph.data?.data?.images || ph.data?.images || []).length;
    if (have < 3) {
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42tENAAAAAEEB7wRjAAAAAElFTkSuQmCC", "base64");
      const fdf = new FormData();
      for (let i = 0; i < 3; i++) fdf.append("files", new Blob([png], { type: "image/png" }), `a${i}.png`);
      await fetch(`${FE}/api/v1/vehicles/v-hyundai/photos`, { method: "POST", headers: { Authorization: `Bearer ${seller}` }, body: fdf });
    }
    const pub = await fe("POST", `/seller/listings/${lid}/publish`, seller);
    const det = await fe("GET", `/seller/listings/${lid}`, seller);
    const lo = det.data?.data?.listing || det.data?.listing || {};
    ok("FE seller listing lifecycle (create/publish)", pub.status === 200 || (pub.status === 409 && lo.status === "published"),
      `create=${mk.status} publish=${pub.status} status=${lo.status}`);
    // unpublish to leave DB clean
    await fe("POST", `/seller/listings/${lid}/unpublish`, seller);
  } else ok("FE seller listing lifecycle", false, `no listing (create=${mk.status})`);

  // ---- 8. Buyer inquiry create + read ----
  const inq = await fe("POST", "/inquiries", buyer, { listingId: "l-bmw", message: "Is this available?" });
  if (inq.status === 200 || inq.status === 201) {
    const iid = inq.data?.data?.id || inq.data?.id;
    const read = await fe("GET", `/inquiries/${iid}`, buyer);
    ok("FE buyer inquiry create+read", read.status === 200, `create=${inq.status} read=${read.status}`);
  } else ok("FE buyer inquiry create", false, `status=${inq.status}`);

  // ---- 9. Backend FastAPI routers (direct) ----
  const beh = await be("GET", "/health");
  ok("BE /health 200", beh.status === 200, `status=${beh.status}`);
  // backend vehicle intelligence investigation directly
  const bei = await be("POST", "/api/intelligence/investigate",
    null, { vehicle_id: "v-bmw", question: "fraud?" });
  ok("BE /api/intelligence/investigate 200", bei.status === 200,
    `status=${bei.status} ${JSON.stringify(bei.data).slice(0, 80)}`);
  // backend vehicle router (direct) — should return vehicle or 404 honestly, not 500
  const bev = await be("GET", "/api/v1/vehicles/v-bmw");
  ok("BE /api/v1/vehicles/v-bmw not 5xx", bev.status < 500, `status=${bev.status}`);
  // backend marketplace
  const bem = await be("GET", "/api/v1/marketplace/listings");
  ok("BE /api/v1/marketplace/listings not 5xx", bem.status < 500, `status=${bem.status}`);
  // backend auth: anon token endpoint behavior
  const beAuth = await be("POST", "/api/v1/auth/login", null,
    { email: "samarth@trustdrive.dev", password: "demo1234" });
  ok("BE auth login works", beAuth.status === 200, `status=${beAuth.status}`);

  finish();
})();

function finish() {
  const pass = results.filter((r) => r.pass).length;
  const fail = results.length - pass;
  console.log(`\n=== INTEGRATION AUDIT: ${pass}/${results.length} passed, ${fail} failed ===`);
  if (fail) {
    console.log("\nFAILURES:");
    results.filter((r) => !r.pass).forEach((r) => console.log(` - ${r.name}: ${r.detail}`));
  }
  process.exit(fail === 0 ? 0 : 1);
}
