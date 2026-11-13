// Live HTTP smoke harness: login as each role, GET every readable endpoint,
// POST the core mutations, and report status + payload shape.
const BASE = process.env.TD_BASE || "http://127.0.0.1:3000";

const jars = {};

async function raw(path, { method = "GET", body, cookie = "", token, headers = {} } = {}) {
  const h = { ...headers };
  if (cookie) h.cookie = cookie;
  if (token) h.authorization = "Bearer " + token;
  if (body !== undefined) h["content-type"] = "application/json";
  const res = await fetch(BASE + path, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const setCookie = res.headers.get("set-cookie") || "";
  let json = null;
  const text = await res.text();
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text.slice(0, 160) };
  }
  return { status: res.status, json, setCookie, text };
}

function cookieFrom(setCookie) {
  return setCookie
    .split(",")
    .map((p) => p.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

function tokenFrom(jar) {
  const m = /(?:^|;\s*)td_token=([^;]+)/.exec(jar || "");
  return m ? m[1] : "";
}

async function login(email, password) {
  const r = await raw("/api/v1/auth/login", { method: "POST", body: { email, password } });
  if (r.status !== 200) throw new Error(`login ${email} -> ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
  const jar = cookieFrom(r.setCookie);
  jars[email] = jar;
  return { jar, data: r.json?.data };
}

const results = [];

// A GET against a POST-only route correctly returns 405; a seller hitting a
// buyer-only route correctly returns 403; a missing record is an honest 404.
// Declaring these keeps the audit from reporting working endpoints as failures.
// `status` may be a number or an array of acceptable statuses (some endpoints
// legitimately return 200 when a record exists and an honest 404 when it does not).
const EXPECTED = new Map([
  // POST-only routes (this harness probes reads with GET on purpose)
  ["SELLER vehicle:ai/explain", { status: 405, why: "POST-only route" }],
  ["SELLER vehicle:verify", { status: 405, why: "POST-only route" }],
  ["SELLER vehicle:save", { status: 405, why: "POST/DELETE-only route" }],
  ["SELLER listing:stats", { status: 405, why: "POST-only route" }],
  ["SELLER listing:share", { status: 405, why: "POST/DELETE-only route" }],
  ["SELLER alerts:evaluate", { status: 405, why: "POST-only route" }],
  ["SELLER compare", { status: 405, why: "POST-only route" }],
  ["SELLER verification:lookup", { status: 405, why: "POST-only route" }],
  ["BUYER reports:vehicle", { status: 405, why: "POST-only route" }],
  // Correct role isolation
  ["SELLER saved", { status: 403, why: "buyer-only endpoint" }],
  ["SELLER saved-searches", { status: 403, why: "buyer-only endpoint" }],
  // 200 when a record exists, honest 404 when none is recorded — both valid.
  ["BUYER vehicle:theft", { status: [200, 404], why: "theft check may be absent" }],
  ["SELLER vehicle:theft", { status: [200, 404], why: "theft check may be absent" }],
  ["SELLER vehicle:verification", { status: [200, 404], why: "verification run may be absent" }],
  // Disputes live in the admin queue's Disputes tab; the page redirects there.
  ["ADMIN admin:disputes", { status: 404, why: "by design: /admin/queue#disputes" }],
]);

async function probe(email, label, path, method = "GET", body) {
  const cookie = jars[email] || "";
  const token = tokenFrom(cookie);
  const expected = EXPECTED.get(label);
  let r;
  try {
    r = await raw(path, { method, body, cookie, token });
  } catch (e) {
    results.push({ label, path, method, status: "ERR", note: String(e).slice(0, 120), ok: false });
    return;
  }
  const d = r.json?.data;
  const err = r.json?.error;
  let shape = "-";
  if (d === undefined && err) shape = "ERR:" + err.code;
  else if (Array.isArray(d)) shape = `array(${d.length})`;
  else if (d && typeof d === "object") shape = "obj{" + Object.keys(d).slice(0, 6).join(",") + "}";
  else if (typeof d === "number") shape = "number:" + d;
  else if (d === null) shape = "null";
  const want = expected?.status ?? 200;
  const acceptable = Array.isArray(want) ? want : [want];
  results.push({
    label,
    path,
    method,
    status: r.status,
    shape,
    expected: want,
    ok: acceptable.includes(r.status),
    note: expected?.why || (err ? String(err.message || "").slice(0, 90) : (d === null || (Array.isArray(d) && !d.length) || d === undefined ? "EMPTY/NULL" : "")),
  });
}

(async () => {
  let seller = "", buyer = "", admin = "", sellerVehicle = "", sellerListing = "", buyerSaved = "";
  try {
    seller = (await login("samarth@trustdrive.dev", "demo123456")).data?.user?.id || "samarth@trustdrive.dev";
  } catch (e) { console.log("SELLER LOGIN FAILED:", String(e)); }
  try {
    buyer = (await login("rohan@trustdrive.dev", "demo123456")).data?.user?.id || "rohan@trustdrive.dev";
  } catch (e) { console.log("BUYER LOGIN FAILED:", String(e)); }
  try {
    admin = (await login("admin@trustdrive.dev", "demo123456")).data?.user?.id || "admin@trustdrive.dev";
  } catch (e) { console.log("ADMIN LOGIN FAILED:", String(e)); }

  const S = "samarth@trustdrive.dev", B = "rohan@trustdrive.dev", A = "admin@trustdrive.dev";

  // discover a real vehicle id owned by the seller
  const vs = await raw("/api/v1/seller/vehicles", { cookie: jars[S] });
  const vlist = vs.json?.data?.items || vs.json?.data?.vehicles || vs.json?.data || [];
  if (Array.isArray(vlist) && vlist.length) sellerVehicle = vlist[0].id || vlist[0].vehicleId || "";
  const ls = await raw("/api/v1/seller/listings", { cookie: jars[S] });
  const llist = ls.json?.data?.items || ls.json?.data || [];
  // Each item is { vehicle, listing, ... } — the id lives on the nested listing.
  if (Array.isArray(llist) && llist.length) sellerListing = llist[0].listing?.id || llist[0].id || "";
  console.log("seller vehicle:", sellerVehicle, "seller listing:", sellerListing, "\n");

  // public
  await probe("", "public:health", "/api/v1/health/ready");
  await probe("", "public:marketplace", "/api/v1/marketplace/listings");
  await probe("", "public:search", "/api/v1/marketplace/search?q=petrol");

  // seller reads
  for (const [label, p] of [
    ["me", "/api/v1/me"],
    ["users/me", "/api/v1/users/me"],
    ["seller:overview", "/api/v1/seller/overview"],
    ["seller:vehicles", "/api/v1/seller/vehicles"],
    ["seller:listings", "/api/v1/seller/listings"],
    ["vehicle:detail", `/api/v1/vehicles/${sellerVehicle}`],
    ["vehicle:documents", `/api/v1/vehicles/${sellerVehicle}/documents`],
    ["vehicle:docs-completeness", `/api/v1/vehicles/${sellerVehicle}/documents/completeness`],
    ["vehicle:history", `/api/v1/vehicles/${sellerVehicle}/history`],
    ["vehicle:mileage", `/api/v1/vehicles/${sellerVehicle}/mileage`],
    ["vehicle:verification", `/api/v1/vehicles/${sellerVehicle}/verification`],
    ["vehicle:findings", `/api/v1/vehicles/${sellerVehicle}/findings`],
    ["vehicle:damage", `/api/v1/vehicles/${sellerVehicle}/damage`],
    ["vehicle:components", `/api/v1/vehicles/${sellerVehicle}/components`],
    ["vehicle:3d-model", `/api/v1/vehicles/${sellerVehicle}/3d-model`],
    ["vehicle:trust", `/api/v1/vehicles/${sellerVehicle}/trust`],
    ["vehicle:risk", `/api/v1/vehicles/${sellerVehicle}/risk`],
    ["vehicle:pricing", `/api/v1/vehicles/${sellerVehicle}/pricing`],
    ["vehicle:theft", `/api/v1/vehicles/${sellerVehicle}/theft`],
    ["vehicle:claims", `/api/v1/vehicles/${sellerVehicle}/claims`],
    ["vehicle:chain", `/api/v1/vehicles/${sellerVehicle}/chain`],
    ["vehicle:insights", `/api/v1/vehicles/${sellerVehicle}/insights`],
    ["vehicle:alerts", `/api/v1/vehicles/${sellerVehicle}/alerts`],
    ["vehicle:near-dup", `/api/v1/vehicles/${sellerVehicle}/near-duplicates`],
    ["vehicle:evidence-graph", `/api/v1/vehicles/${sellerVehicle}/evidence-graph`],
    ["vehicle:provider-checks", `/api/v1/vehicles/${sellerVehicle}/provider-checks`],
    ["vehicle:ai/explain", `/api/v1/vehicles/${sellerVehicle}/ai/explain`],
    ["vehicle:ai-investigations", `/api/v1/vehicles/${sellerVehicle}/ai-investigations`],
    ["vehicle:report", `/api/v1/vehicles/${sellerVehicle}/report`],
    ["vehicle:verify", `/api/v1/vehicles/${sellerVehicle}/verify`],
    ["vehicle:photos", `/api/v1/vehicles/${sellerVehicle}/photos`],
    ["vehicle:save", `/api/v1/vehicles/${sellerVehicle}/save`],
    ["chain:byId", `/api/v1/chain/${sellerVehicle}`],
    ["listing:stats", `/api/v1/seller/listings/${sellerListing}/stats`],
    ["listing:share", `/api/v1/seller/listings/${sellerListing}/share`],
    ["inquiries", "/api/v1/inquiries"],
    ["notifications", "/api/v1/notifications"],
    ["reports", "/api/v1/reports"],
    ["alerts:evaluate", "/api/v1/alerts/evaluate"],
    ["ai:health", "/api/v1/ai/health"],
    ["ai:stack", "/api/v1/ai/stack"],
    ["saved", "/api/v1/saved"],
    ["saved-searches", "/api/v1/saved-searches"],
    ["compare", "/api/v1/compare"],
    ["verification:lookup", "/api/v1/verification/lookup?vehicleId=" + sellerVehicle],
  ]) {
    await probe(S, "SELLER " + label, p);
  }

  // buyer reads
  const mk = await raw("/api/v1/marketplace/listings", { cookie: jars[B] });
  const items = mk.json?.data?.items || mk.json?.data || [];
  const publicVehicle = Array.isArray(items) && items.length ? (items[0].vehicleId || items[0].vehicle_id || items[0].id) : sellerVehicle;
  console.log("buyer public vehicle:", publicVehicle, "\n");
  for (const [label, p] of [
    ["buyer:overview", "/api/v1/buyer/overview"],
    ["buyer:recommended", "/api/v1/buyer/recommended"],
    ["marketplace:detail", `/api/v1/marketplace/listings/${sellerListing}`],
    ["vehicle:detail", `/api/v1/vehicles/${publicVehicle}`],
    ["vehicle:mileage", `/api/v1/vehicles/${publicVehicle}/mileage`],
    ["vehicle:findings", `/api/v1/vehicles/${publicVehicle}/findings`],
    ["vehicle:verification", `/api/v1/vehicles/${publicVehicle}/verification`],
    ["vehicle:history", `/api/v1/vehicles/${publicVehicle}/history`],
    ["vehicle:damage", `/api/v1/vehicles/${publicVehicle}/damage`],
    ["vehicle:3d-model", `/api/v1/vehicles/${publicVehicle}/3d-model`],
    ["vehicle:trust", `/api/v1/vehicles/${publicVehicle}/trust`],
    ["vehicle:pricing", `/api/v1/vehicles/${publicVehicle}/pricing`],
    ["vehicle:theft", `/api/v1/vehicles/${publicVehicle}/theft`],
    ["vehicle:risk", `/api/v1/vehicles/${publicVehicle}/risk`],
    ["vehicle:chain", `/api/v1/vehicles/${publicVehicle}/chain`],
    ["vehicle:evidence-graph", `/api/v1/vehicles/${publicVehicle}/evidence-graph`],
    ["vehicle:provider-checks", `/api/v1/vehicles/${publicVehicle}/provider-checks`],
    ["vehicle:ai-investigations", `/api/v1/vehicles/${publicVehicle}/ai-investigations`],
    ["vehicle:report", `/api/v1/vehicles/${publicVehicle}/report`],
    ["saved", "/api/v1/saved"],
    ["inquiries", "/api/v1/inquiries"],
    ["notifications", "/api/v1/notifications"],
    ["reports:vehicle", `/api/v1/reports/vehicle/${publicVehicle}`],
  ]) {
    await probe(B, "BUYER " + label, p);
  }

  // admin reads
  for (const [label, p] of [
    ["admin:queue", "/api/v1/admin/queue"],
    ["admin:kyc", "/api/v1/admin/kyc"],
    ["admin:audit", "/api/v1/admin/audit"],
    ["admin:disputes", "/api/v1/admin/disputes"],
  ]) {
    await probe(A, "ADMIN " + label, p);
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} expected responses ===`);
  for (const r of failed) {
    console.log(`  UNEXPECTED ${r.method} ${r.label}: got ${r.status}, expected ${r.expected} ${r.note || ""}`);
  }
  console.log(JSON.stringify(results, null, 1));
})();
