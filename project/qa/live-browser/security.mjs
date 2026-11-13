// ---------------------------------------------------------------------------
// Server-side RBAC / privacy proof. Uses real HTTP requests against the running
// Next.js app and asserts deny-by-default on direct API calls (not just hidden
// navigation), plus the consent gate on a buyer's document list.
// ---------------------------------------------------------------------------
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.TD_BASE_URL || "http://127.0.0.1:3000";
const DB = path.resolve(__dirname, "../../.data/trustdrive.db");
const results = [];

function check(label, ok, detail = "") {
  results.push({ label, ok: !!ok, detail: String(detail).slice(0, 400) });
  console.log(`  ${ok ? "PASS" : "FAIL"} ${label}${detail ? ` :: ${String(detail).slice(0, 200)}` : ""}`);
}

const db = new DatabaseSync(DB, { readOnly: true });
const one = (q, ...p) => db.prepare(q).get(...p);

async function login(email) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "demo123456" }),
  });
  const cookie = res.headers.getSetCookie?.().map((c) => c.split(";")[0]).join("; ") ?? res.headers.get("set-cookie")?.split(",")[0];
  return { status: res.status, cookie, body: await res.text() };
}

async function call(method, pathname, cookie) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: cookie ? { Cookie: cookie, "Content-Type": "application/json" } : { "Content-Type": "application/json" },
    body: method === "POST" || method === "PATCH" ? "{}" : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* keep */ }
  return { status: res.status, json, text: text.slice(0, 400) };
}

// Choose real rows from the shared database.
const seller = one("SELECT id, email FROM users WHERE email = ?", "samarth@trustdrive.dev");
const seller2 = one("SELECT id, email FROM users WHERE email = ?", "weduo@trustdrive.dev");
const buyer = one("SELECT id, email FROM users WHERE email = ?", "rohan@trustdrive.dev");
const published = one(
  "SELECT v.id, v.owner_id FROM vehicles v JOIN listings l ON l.vehicle_id = v.id WHERE l.status = 'published' AND v.owner_id = ? LIMIT 1",
  seller.id
);
const unpublished = one(
  "SELECT v.id, v.owner_id FROM vehicles v LEFT JOIN listings l ON l.vehicle_id = v.id WHERE v.owner_id = ? AND (l.id IS NULL OR l.status != 'published') LIMIT 1",
  seller.id
);
const privateDoc = published ? one("SELECT id, consent FROM documents WHERE vehicle_id = ? AND consent = 0 LIMIT 1", published.id) : null;
const consented = published ? one("SELECT id FROM documents WHERE vehicle_id = ? AND consent = 1 LIMIT 1", published.id) : null;
const foreignInquiry = one("SELECT id FROM inquiries WHERE buyer_id != ? LIMIT 1", buyer.id);

console.log({ seller: seller.id, seller2: seller2.id, buyer: buyer.id, published: published?.id, unpublished: unpublished?.id, privateDoc: privateDoc?.id, consented: consented?.id });

const anon = await call("GET", "/api/v1/seller/vehicles");
check("anonymous seller API is rejected (401)", anon.status === 401, `HTTP ${anon.status}`);

const sellerLogin = await login(seller.email);
const seller2Login = await login(seller2.email);
const buyerLogin = await login(buyer.email);
check("all three demo logins return 200", sellerLogin.status === 200 && seller2Login.status === 200 && buyerLogin.status === 200, `${sellerLogin.status}/${seller2Login.status}/${buyerLogin.status}`);

const buyerSellerApi = await call("GET", "/api/v1/seller/vehicles", buyerLogin.cookie);
check("buyer cannot call the seller vehicle API (403)", buyerSellerApi.status === 403, `HTTP ${buyerSellerApi.status}`);

const buyerCreate = await call("POST", "/api/v1/vehicles", buyerLogin.cookie);
check("buyer cannot create a seller vehicle (403)", buyerCreate.status === 403, `HTTP ${buyerCreate.status}`);

const buyerPublish = await call("POST", "/api/v1/seller/listings/anything/publish", buyerLogin.cookie);
check("buyer cannot publish a listing (403)", buyerPublish.status === 403, `HTTP ${buyerPublish.status}`);

if (unpublished) {
  const res = await call("GET", `/api/v1/vehicles/${unpublished.id}/documents`, buyerLogin.cookie);
  check("buyer cannot list documents of an unpublished vehicle (403)", res.status === 403, `HTTP ${res.status} ${res.text.slice(0, 120)}`);
}

if (published) {
  const res = await call("GET", `/api/v1/vehicles/${published.id}/documents`, buyerLogin.cookie);
  const items = res.json?.data?.items ?? [];
  const leaked = items.filter((d) => !d.consent);
  check("buyer sees only consented documents on a published listing", res.status === 200 && leaked.length === 0, `HTTP ${res.status} items=${items.length} unconsented=${leaked.length}`);
}

if (published) {
  const res = await call("GET", `/api/v1/vehicles/${published.id}/documents`, seller2Login.cookie);
  check("a different seller cannot list another seller's documents (403)", res.status === 403, `HTTP ${res.status}`);
}

if (privateDoc) {
  const res = await call("GET", `/api/v1/documents/${privateDoc.id}`, buyerLogin.cookie);
  check("buyer cannot open an unconsented document by id (403)", res.status === 403, `HTTP ${res.status}`);
}

if (consented) {
  // Raw document bytes stay owner/admin-only. A buyer reads consented metadata
  // through the extraction endpoint, which enforces the consent gate itself.
  const raw = await call("GET", `/api/v1/documents/${consented.id}`, buyerLogin.cookie);
  check("buyer cannot fetch raw document bytes by id (403)", raw.status === 403, `HTTP ${raw.status}`);
  const meta = await call("GET", `/api/v1/documents/${consented.id}/extractions`, buyerLogin.cookie);
  check("buyer can read consented document metadata (200)", meta.status === 200, `HTTP ${meta.status} ${meta.text.slice(0, 120)}`);
  const metaOther = await call("GET", `/api/v1/documents/${consented.id}/extractions`, seller2Login.cookie);
  check("a different seller cannot read another seller's extraction (403)", metaOther.status === 403, `HTTP ${metaOther.status}`);
}

if (foreignInquiry) {
  const res = await call("GET", `/api/v1/inquiries/${foreignInquiry.id}`, buyerLogin.cookie);
  check("buyer cannot read another buyer's inquiry (403)", res.status === 403, `HTTP ${res.status}`);
}

const inj = await call("GET", `/api/v1/marketplace/listings?q=${encodeURIComponent("' OR 1=1--")}`, buyerLogin.cookie);
const injItems = inj.json?.data?.items ?? [];
check("marketplace search treats SQL metacharacters as text (no dump)", inj.status === 200 && injItems.length === 0, `HTTP ${inj.status} items=${injItems.length}`);

fs.writeFileSync(path.join(__dirname, "security_results.json"), JSON.stringify({ results }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n=== Security / RBAC: ${failed === 0 ? "PASS" : "FAIL"} (${results.length - failed}/${results.length}) ===`);
if (failed) process.exitCode = 1;
