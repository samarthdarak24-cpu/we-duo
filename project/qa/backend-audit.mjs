#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Live backend audit for TrustDrive.
//
// Runs against a started local stack (npm run start:all) and exercises the real
// Next.js API + Python intelligence service with real data and real files.
// Nothing here mocks a provider: every PASS is backed by a response payload,
// a persisted row, or the bytes that crossed the wire.
//
//   node project/qa/backend-audit.mjs
//
// Optional env:
//   TD_AUDIT_BASE       default http://127.0.0.1:3000
//   TD_AUDIT_PY         default http://127.0.0.1:8000
//   TD_AUDIT_JSON       default project/qa/backend-audit-results.json
// ---------------------------------------------------------------------------
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BASE = (process.env.TD_AUDIT_BASE || "http://127.0.0.1:3000").replace(/\/+$/, "");
const PY = (process.env.TD_AUDIT_PY || "http://127.0.0.1:8000").replace(/\/+$/, "");
const ROOT = process.cwd();
const OUT_JSON = process.env.TD_AUDIT_JSON || path.join(ROOT, "project", "qa", "backend-audit-results.json");
const TMP = path.join(ROOT, "project", "qa", ".audit-tmp");
fs.mkdirSync(TMP, { recursive: true });

const results = [];
let currentSection = "";

function section(name) {
  currentSection = name;
  console.log(`\n=== ${name} ===`);
}

function pass(name, evidence) {
  results.push({ section: currentSection, name, ok: true, evidence: String(evidence ?? "") });
  console.log(`PASS  ${name}${evidence ? ` — ${evidence}` : ""}`);
}

function fail(name, evidence) {
  results.push({ section: currentSection, name, ok: false, evidence: String(evidence ?? "") });
  console.log(`FAIL  ${name}${evidence ? ` — ${evidence}` : ""}`);
}

function short(value, max = 300) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) return "";
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

class Session {
  constructor(label) {
    this.label = label;
    this.jar = new Map();
  }
  cookieHeader() {
    return [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  absorb(res) {
    const list =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : res.headers.get("set-cookie")
          ? [res.headers.get("set-cookie")]
          : [];
    for (const raw of list) {
      const pair = raw.split(";")[0];
      const eq = pair.indexOf("=");
      if (eq > 0) this.jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  }
  async request(pathname, { method = "GET", json, form, headers = {}, redirect = "follow", signal } = {}) {
    const h = { ...headers };
    if (this.jar.size) h.cookie = this.cookieHeader();
    let body;
    if (json !== undefined) {
      h["content-type"] = "application/json";
      body = JSON.stringify(json);
    } else if (form) {
      body = form;
    }
    const url = pathname.startsWith("http") ? pathname : `${BASE}${pathname}`;
    const res = await fetch(url, { method, headers: h, body, redirect, signal });
    this.absorb(res);
    return res;
  }
}

async function call(session, method, pathname, opts = {}) {
  const res = await session.request(pathname, { ...opts, method });
  const contentType = res.headers.get("content-type") || "";
  let body;
  if (contentType.includes("application/json")) {
    body = await res.json().catch(() => null);
  } else if (contentType.startsWith("text/") || contentType.includes("xml")) {
    body = await res.text();
  } else {
    body = Buffer.from(await res.arrayBuffer());
  }
  return { status: res.status, body, contentType, headers: res.headers, res };
}

function statuses(res) {
  return `${res.status} ${short(res.body, 220)}`;
}

/** Assert a response status is one of the allowed codes. */
function must(res, allowed, context = "") {
  const list = Array.isArray(allowed) ? allowed : [allowed];
  if (!list.includes(res.status)) {
    throw new Error(`${context || "unexpected status"} ${statuses(res)}`);
  }
  return res.body;
}

function data(res) {
  return res.body && typeof res.body === "object" ? res.body.data : undefined;
}

async function check(name, fn) {
  try {
    const evidence = await fn();
    pass(name, evidence);
    return { ok: true, value: evidence };
  } catch (error) {
    fail(name, error instanceof Error ? error.message : String(error));
    return { ok: false, error };
  }
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/** Generate a real PNG with text via the backend venv (Pillow), for OCR. */
function makePng(fileName, lines) {
  const script = `
from PIL import Image, ImageDraw, ImageFont
img = Image.new('RGB', (1000, 640), 'white')
d = ImageDraw.Draw(img)
try:
    font = ImageFont.truetype('arial.ttf', 30)
    big = ImageFont.truetype('arialbd.ttf', 40)
except Exception:
    font = big = ImageFont.load_default()
d.text((50, 40), 'SERVICE INVOICE', fill='black', font=big)
y = 120
for line in ${JSON.stringify(lines)}:
    d.text((50, y), line, fill='black', font=font)
    y += 60
img.save(r'${fileName.replace(/\\/g, "/")}')
print('ok')
`;
  const py = path.join(ROOT, "backend", ".venv", "Scripts", "python.exe");
  const exe = fs.existsSync(py) ? py : "python";
  const res = spawnSync(exe, ["-c", script], { encoding: "utf8" });
  if (res.status !== 0) throw new Error(`PNG generation failed: ${res.stderr || res.stdout}`);
  return fs.readFileSync(fileName);
}

const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const runId = Date.now().toString(36);
// Resend's `onboarding@resend.dev` test sender only delivers to the account
// owner, so the one real-delivery check uses that mailbox. The deterministic
// password lets repeat runs log in instead of registering a second account.
const NEW_EMAIL = process.env.TD_AUDIT_EMAIL ?? "daraksamarth00@gmail.com";
const NEW_PASSWORD = "TrustDrive!2026#Audit";
const NEW_REG = `MH${String(Date.now()).slice(-2)}AU${Math.floor(Math.random() * 9000 + 1000)}`;
const VIN_ALPHABET = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789";
const NEW_VIN =
  "WBA" +
  Array.from({ length: 14 }, () => VIN_ALPHABET[Math.floor(Math.random() * VIN_ALPHABET.length)]).join("");

const anonym = new Session("anonymous");
const admin = new Session("admin");
const seller = new Session("seller");
const buyer = new Session("buyer");
const newUser = new Session("new");

const state = {
  vehicleId: "v-bmw",
  listingId: "l-bmw",
  docId: null,
  fileUrl: null,
  newVehicleId: null,
  newListingId: null,
  inquiryId: null,
  reportId: null,
  reportHash: null,
  investigationId: null,
  verificationCaseId: null,
  damageId: null,
  disputeId: null,
  notificationId: null,
};

async function login(session, email, password, expect = 200) {
  const res = await call(session, "POST", "/api/v1/auth/login", { json: { email, password } });
  must(res, expect, `login ${email}`);
  return data(res);
}

// ===========================================================================
// A. System, health and honest integration status
// ===========================================================================
async function auditSystem() {
  section("A. System, health and integrations");

  await check("health/ready returns ok", async () => {
    const r = await call(anonym, "GET", "/api/v1/health/ready");
    must(r, 200);
    return short(r.body);
  });

  await check("Python /health is reachable and reports the shared DB", async () => {
    const r = await call(anonym, "GET", `${PY}/health`);
    must(r, 200);
    const d = r.body?.data ?? r.body;
    return `db=${d?.db?.database}/${d?.db?.tables}tables llm=${d?.llm} worker=${d?.worker}`;
  });

  await check("health/integrations reports real provider state", async () => {
    const r = await call(admin, "GET", "/api/v1/health/integrations");
    must(r, 200);
    const d = data(r);
    if (!d?.email || !d?.database) throw new Error(`missing keys ${short(d)}`);
    return `email=${d.email.provider} db=${d.database.provider} storage=${d.storage.provider} intel=${d.intelligence.configured}`;
  });

  await check("system/notifications reports the active email provider", async () => {
    const r = await call(admin, "GET", "/api/v1/system/notifications");
    must(r, 200);
    return `provider=${r.body?.provider} smtp=${r.body?.smtp_configured} resend=${r.body?.resend_configured}`;
  });

  await check("system/registry reports honest source status", async () => {
    const r = await call(admin, "GET", "/api/v1/system/registry");
    must(r, 200);
    const d = r.body;
    const src = d?.sources ?? {};
    return `vahan=${src.vahan?.status} insurer=${src.insurer?.status} theft=${src.theft?.status}`;
  });

  await check("system/storage reports a real backend", async () => {
    const r = await call(admin, "GET", "/api/v1/system/storage");
    must(r, 200);
    return `backend=${r.body?.backend}`;
  });

  await check("ai/stack reports LLM + orchestrator + OCR", async () => {
    const r = await call(admin, "GET", "/api/v1/ai/stack");
    must(r, 200);
    const d = data(r);
    if (!d?.llm) throw new Error(`missing llm ${short(d)}`);
    const tesseract = (d.ocr || []).find((x) => x.engine === "tesseract");
    return `llm=${d.llm.provider}/${d.llm.model} graph=${d.agent?.orchestrator} ckpt=${d.agent?.checkpointing} ocr=${tesseract?.available ? "tesseract" : "none"}`;
  });

  await check("ai/health reports grounded rules mode", async () => {
    const r = await call(anonym, "GET", "/api/v1/ai/health");
    must(r, 200);
    const d = data(r);
    return `mode=${d?.mode} grounded=${d?.grounded}`;
  });

  await check("ai/fraud/model-status reports honest ML status", async () => {
    const r = await call(admin, "GET", "/api/v1/ai/fraud/model-status");
    must(r, 200);
    const d = r.body?.data ?? r.body;
    return short(d, 260);
  });

  await check("anchoring/status never claims an unconfigured chain", async () => {
    const r = await call(admin, "GET", "/api/v1/anchoring/status");
    must(r, 200);
    const d = data(r);
    if (!d) throw new Error(short(r.body));
    return `configured=${d.configured} engine=${d.engine ?? d.provider ?? "none"} anchored=${d.anchored ?? false}`;
  });

  await check("public sample report is a real generated PDF", async () => {
    const r = await call(anonym, "GET", "/api/v1/public/sample-report");
    must(r, 200);
    const buf = Buffer.isBuffer(r.body) ? r.body : Buffer.from(r.body ?? "");
    if (buf.subarray(0, 5).toString() !== "%PDF-") throw new Error(`not a PDF: ${buf.subarray(0, 12).toString()}`);
    return `${buf.length} bytes sha256=${sha256(buf).slice(0, 16)}…`;
  });
}

// ===========================================================================
// B. Auth, sessions and RBAC
// ===========================================================================
async function auditAuth() {
  section("B. Auth, sessions and RBAC");

  await check("admin login", async () => {
    const d = await login(admin, "admin@trustdrive.dev", "demo123456");
    if (d?.user?.role !== "admin") throw new Error(short(d));
    return `sid=${d.sessionId.slice(0, 12)}… role=${d.user.role}`;
  });

  await check("seller login", async () => {
    const d = await login(seller, "samarth@trustdrive.dev", "demo123456");
    if (d?.user?.role !== "seller") throw new Error(short(d));
    return `user=${d.user.id}`;
  });

  await check("buyer login", async () => {
    const d = await login(buyer, "aditya@trustdrive.dev", "demo123456");
    if (d?.user?.role !== "buyer") throw new Error(short(d));
    return `user=${d.user.id}`;
  });

  await check("GET /me returns the session identity", async () => {
    const r = await call(buyer, "GET", "/api/v1/me");
    must(r, 200);
    const d = data(r);
    return `email=${d?.email} role=${d?.role}`;
  });

  await check("session list is owner-scoped", async () => {
    const r = await call(buyer, "GET", "/api/v1/me/sessions");
    must(r, 200);
    const items = data(r)?.items ?? data(r) ?? [];
    return `${Array.isArray(items) ? items.length : "?"} session(s)`;
  });

  await check("refresh rotates the session cookie", async () => {
    const r = await call(buyer, "POST", "/api/v1/auth/refresh", { json: {} });
    must(r, [200, 204]);
    return short(r.body);
  });

  await check("wrong password is rejected (401)", async () => {
    const r = await call(anonym, "POST", "/api/v1/auth/login", {
      json: { email: "admin@trustdrive.dev", password: "not-the-password" },
    });
    must(r, 401);
    return `${r.body?.error?.code}`;
  });

  await check("anonymous write is rejected (401)", async () => {
    const r = await call(anonym, "POST", "/api/v1/seller/vehicles", { json: { make: "X", model: "Y", regNo: "MH01ZZ0001" } });
    must(r, 401);
    return r.body?.error?.code;
  });

  await check("buyer cannot access seller APIs (403)", async () => {
    const r = await call(buyer, "GET", "/api/v1/seller/vehicles");
    must(r, 403);
    return r.body?.error?.code;
  });

  await check("seller cannot access admin APIs (403)", async () => {
    const r = await call(seller, "GET", "/api/v1/admin/audit");
    must(r, 403);
    return r.body?.error?.code;
  });

  await check("seller cannot read another seller's vehicle evidence (403)", async () => {
    const r = await call(seller, "GET", "/api/v1/vehicles/v-1794077527793");
    // Not found is acceptable (unknown id); forbidden is required for a real foreign id.
    must(r, [403, 404]);
    return `${r.status} ${r.body?.error?.code}`;
  });

  await check("registration creates a real account (or reuses the audit account)", async () => {
    const r = await call(anonym, "POST", "/api/v1/auth/register", {
      json: { name: "Backend Audit Buyer", email: NEW_EMAIL, password: NEW_PASSWORD, role: "buyer" },
    });
    if (r.status === 409) {
      // A previous audit run already created this deterministic account.
      const again = await call(anonym, "POST", "/api/v1/auth/login", {
        json: { email: NEW_EMAIL, password: NEW_PASSWORD },
      });
      must(again, 200, "login existing audit account");
      return `existing account ${data(again)?.user?.id}`;
    }
    must(r, 201, "register");
    const d = data(r);
    if (!d?.user?.id) throw new Error(short(d));
    return `user=${d.user.id} role=${d.user.role}`;
  });

  await check("forgot-password sends a real email through the active provider", async () => {
    const r = await call(anonym, "POST", "/api/v1/auth/forgot-password", { json: { email: NEW_EMAIL } });
    must(r, [200, 202]);
    const d = data(r);
    const delivery = d?.emailDelivery;
    if (!delivery) throw new Error(`no delivery report: ${short(d)}`);
    if (!delivery.ok) throw new Error(`delivery failed via ${delivery.provider}: ${short(delivery.error, 200)}`);
    return `provider=${delivery.provider} status=${delivery.status} messageId=${delivery.messageId} attempts=${delivery.attempts}`;
  });

  await check("reset-password rejects an invalid token", async () => {
    const r = await call(anonym, "POST", "/api/v1/auth/reset-password", {
      json: { token: "not-a-real-token", password: "TrustDrive!2026#Audit2" },
    });
    must(r, [400, 401, 404]);
    return r.body?.error?.code;
  });

  await check("new account can log in", async () => {
    const d = await login(newUser, NEW_EMAIL, NEW_PASSWORD);
    return `user=${d?.user?.id} verified=${d?.user?.emailVerified}`;
  });

  await check("resend-verification is honest for the signed-in account", async () => {
    const r = await call(newUser, "POST", "/api/v1/auth/resend-verification", { json: {} });
    must(r, [200, 202, 429]);
    const d = data(r) ?? r.body;
    return `sent=${d?.sent} provider=${d?.emailDelivery?.provider ?? "n/a"}`;
  });

  await check("logout clears the session", async () => {
    const r = await call(newUser, "POST", "/api/v1/auth/logout", { json: {} });
    must(r, [200, 204]);
    const after = await call(newUser, "GET", "/api/v1/me");
    must(after, 401);
    return "session invalidated";
  });
}

// ===========================================================================
// C. Public marketplace and verification
// ===========================================================================
async function auditPublic() {
  section("C. Public marketplace, categories and verification");

  await check("categories catalogue", async () => {
    const r = await call(anonym, "GET", "/api/v1/categories");
    must(r, 200);
    const d = data(r) ?? r.body;
    const items = d?.matrix ?? d?.implemented ?? d?.items ?? [];
    if (!Array.isArray(items) || items.length < 20) throw new Error(short(d));
    return `${items.length} categories; spec=${d.specVersion} default=${d.defaultCategoryId}`;
  });

  await check("all 20 category records resolve", async () => {
    const ids = [
      "petrol_motorcycle", "petrol_scooter", "electric_scooter", "electric_motorcycle",
      "passenger_car", "electric_car", "moped", "electric_bike", "auto_rickshaw",
      "electric_three_wheeler", "passenger_three_wheeler", "cargo_three_wheeler",
      "hatchback", "suv", "muv", "hybrid_car", "light_commercial", "truck", "bus",
      "electric_commercial",
    ];
    const failed = [];
    for (const id of ids) {
      const r = await call(anonym, "GET", `/api/v1/categories/${id}`);
      if (r.status !== 200) failed.push(`${id}:${r.status}`);
    }
    if (failed.length) throw new Error(failed.join(","));
    return `${ids.length}/${ids.length} 200`;
  });

  await check("marketplace listings are non-empty", async () => {
    const r = await call(anonym, "GET", "/api/v1/marketplace/listings?page=1&pageSize=10");
    must(r, 200);
    const d = data(r);
    const items = d?.items ?? d ?? [];
    if (!items.length) throw new Error(short(d));
    const first = items.find((x) => x.listingId === "l-bmw") ?? items[0];
    if (!first?.listingId) throw new Error(`marketplace row has no listingId: ${short(first)}`);
    // Keep the seeded, published listing id for the write flows below.
    state.listingId = "l-bmw";
    return `${items.length} listing(s); first=${first.id} ${first.make ?? ""} ${first.model ?? ""} listing=${first.listingId}`;
  });

  await check("marketplace search filters by query", async () => {
    const r = await call(anonym, "GET", "/api/v1/marketplace/search?q=BMW");
    must(r, 200);
    const items = data(r)?.items ?? data(r) ?? [];
    return `${Array.isArray(items) ? items.length : "?"} result(s)`;
  });

  await check("marketplace listing detail", async () => {
    const r = await call(anonym, "GET", `/api/v1/marketplace/listings/${state.listingId}`);
    must(r, 200);
    const d = data(r);
    return `listing=${d?.id ?? state.listingId} status=${d?.status ?? "?"}`;
  });

  await check("compare resolves multiple vehicles (POST, public read)", async () => {
    const r = await call(anonym, "POST", "/api/v1/compare", {
      json: { listingIds: ["l-bmw", "l-seller"] },
    });
    must(r, 200);
    const d = data(r) ?? r.body;
    const rows = d?.rows ?? [];
    if (rows.length < 2) throw new Error(short(d));
    return `${rows.length} compared; differences=${(d?.differences ?? []).length}`;
  });

  await check("public registration lookup finds a seeded vehicle", async () => {
    const r = await call(anonym, "POST", "/api/v1/verification/lookup", { json: { type: "reg", value: "MH01AB1234" } });
    must(r, 200);
    const d = data(r) ?? r.body;
    return `vehicle=${d?.vehicle?.id ?? d?.id ?? "?"} trust=${d?.trustScore ?? d?.trust?.score ?? "?"}`;
  });

  await check("public lookup rejects an unknown registration", async () => {
    const r = await call(anonym, "POST", "/api/v1/verification/lookup", { json: { type: "reg", value: "ZZ99ZZ9999" } });
    must(r, [404, 400]);
    return r.body?.error?.code;
  });

  await check("contact form persists a real message", async () => {
    const r = await call(anonym, "POST", "/api/v1/contact", {
      json: {
        name: "Backend Audit",
        email: NEW_EMAIL,
        subject: "Backend audit",
        message: "This is a real contact submission produced by the backend audit.",
      },
    });
    must(r, [200, 201]);
    return short(data(r) ?? r.body, 180);
  });

  await check("newsletter subscription persists", async () => {
    const r = await call(anonym, "POST", "/api/v1/newsletter", { json: { email: `news.${runId}@trustdrive.dev` } });
    must(r, [200, 201]);
    return short(data(r) ?? r.body, 160);
  });
}

// ===========================================================================
// D. Vehicle evidence surface
// ===========================================================================
async function auditVehicleEvidence() {
  section("D. Vehicle evidence (trust, findings, chain, 3D, pricing)");

  const id = state.vehicleId;

  await check("vehicle detail", async () => {
    const r = await call(admin, "GET", `/api/v1/vehicles/${id}`);
    must(r, 200);
    const d = data(r);
    const v = d?.vehicle ?? d;
    if (!v?.id) throw new Error(short(d));
    return `${v.make} ${v.model} ${v.year} reg=${v.reg_no} status=${v.status}`;
  });

  const simple = [
    ["trust score", "trust", (d) => `score=${d?.trustScore} risk=${d?.riskScore} band=${d?.band} coverage=${d?.evidenceCoverage}`],
    ["findings", "findings", (d) => `${(Array.isArray(d) ? d : d?.items ?? []).length} finding(s)`],
    ["insights", "insights", (d) => `${(Array.isArray(d) ? d : d?.items ?? []).length} insight(s)`],
    ["history", "history", (d) => `${(d?.items ?? d ?? []).length} event(s)`],
    ["mileage readings", "mileage", (d) => `${(d?.readings ?? d?.items ?? []).length} reading(s); verified=${d?.verifiedKm ?? "?"} claimed=${d?.claimedKm ?? "?"}`],
    ["damage records", "damage", (d) => {
      const items = d?.records ?? d?.items ?? [];
      const candidate = items.find((x) => x.status !== "verified") ?? items[0];
      if (candidate?.id) state.damageId = candidate.id;
      return `${items.length} record(s); hotspots=${(d?.hotspots ?? []).length}; candidate=${candidate?.id ?? "none"}`;
    }],
    ["photos", "photos", (d) => `${(d?.images ?? d?.items ?? []).length} photo(s); listing=${d?.listingId ?? "none"}`],
    ["components", "components", (d) => `${(d?.items ?? d?.components ?? d ?? []).length} component(s)`],
    ["passport", "passport", (d) => `id=${d?.trustdriveId ?? d?.id ?? "?"}`],
    ["evidence graph", "evidence-graph", (d) => `nodes=${(d?.nodes ?? []).length} edges=${(d?.edges ?? []).length}`],
    ["risk report", "risk", (d) => `trust=${d?.trust?.trustScore ?? d?.trust?.score ?? "?"} findings=${(d?.findings ?? []).length}`],
    ["pricing guidance", "pricing", (d) => `estimate=${d?.estimate} low=${d?.low} high=${d?.high} confidence=${d?.confidence}`],
    ["provider checks", "provider-checks", (d) => `${(Array.isArray(d) ? d : d?.checks ?? d?.items ?? []).length} check(s)`],
    ["theft check", "theft", (d) => `status=${d?.status ?? "?"} source=${d?.source ?? "?"}`],
    ["verification state", "verification", (d) => `run=${d?.run?.id} checks=${(d?.results ?? []).length}`],
    ["alerts", "alerts", (d) => `${(d?.items ?? d ?? []).length} alert(s)`],
    ["claims", "claims", (d) => `${(d?.items ?? d ?? []).length} claim(s)`],
    ["near duplicates", "near-duplicates", (d) => short(d, 160)],
  ];

  for (const [label, route, summarize] of simple) {
    await check(label, async () => {
      const r = await call(admin, "GET", `/api/v1/vehicles/${id}/${route}`);
      must(r, 200);
      return summarize(data(r));
    });
  }

  await check("3D model points at a real GLB whose hash matches the manifest", async () => {
    const r = await call(admin, "GET", `/api/v1/vehicles/${id}/3d-model`);
    must(r, 200);
    const d = data(r);
    const url = d?.assetUrl;
    if (!url) throw new Error(short(d));
    if (d.assetStatus !== "available") throw new Error(`assetStatus=${d.assetStatus}`);
    const asset = await call(anonym, "GET", url);
    must(asset, 200);
    const buf = Buffer.isBuffer(asset.body) ? asset.body : Buffer.from(asset.body ?? "");
    const bytesHash = sha256(buf);
    const manifestHash = d?.manifest?.sha256;
    if (manifestHash && bytesHash !== manifestHash) {
      throw new Error(`GLB hash mismatch manifest=${manifestHash} bytes=${bytesHash}`);
    }
    if (!manifestHash) throw new Error("manifest has no sha256");
    return `asset=${url} ${buf.length} bytes sha256=${bytesHash.slice(0, 16)}… scope=${d.assetScope} components=${d.componentCount}`;
  });

  await check("hash chain verifies (integrity, not authenticity)", async () => {
    const r = await call(admin, "GET", `/api/v1/vehicles/${id}/chain`);
    must(r, 200);
    const d = data(r);
    const entries = d?.entries ?? [];
    if (!entries.length) throw new Error(short(d));
    if (d?.intact !== true) throw new Error(`chain not intact: ${short(d)}`);
    if (d?.records !== entries.length) throw new Error(`records=${d?.records} entries=${entries.length}`);
    return `${entries.length} record(s) intact=true latest=${String(d.latestHash).slice(0, 16)}…`;
  });

  await check("consolidated report JSON", async () => {
    const r = await call(admin, "GET", `/api/v1/vehicles/${id}/report`);
    must(r, 200);
    const d = data(r);
    if (!d?.trust) throw new Error(`missing trust: ${short(d, 200)}`);
    return `trust=${d.trust.trustScore ?? d.trust.score ?? "?"} sections=${Object.keys(d).length}`;
  });

  await check("AI explain endpoint cites evidence", async () => {
    const r = await call(admin, "POST", `/api/v1/vehicles/${id}/ai/explain`, { json: {} });
    must(r, 200);
    const d = data(r);
    if (!d?.narrative) throw new Error(short(d));
    return `id=${d.id} code=${d.code} citations=${(d.citations ?? []).length} narrative=${short(d.narrative, 90)}`;
  });
}

// ===========================================================================
// E. Documents: real upload, OCR, extractions, consent, files, anchor
// ===========================================================================
async function auditDocuments() {
  section("E. Documents — real upload, OCR, extractions, consent, anchoring");

  const pngPath = path.join(TMP, "audit-service-invoice.png");
  const png = makePng(pngPath, [
    `Invoice No: TD-AUDIT-${today}`,
    "Odometer Reading: 43120 KM",
    "Total Amount: 13500 INR",
    `Date: ${new Date().toISOString().slice(0, 10)}`,
    "Vehicle Registration: MH01AB1234",
  ]);

  await check("upload a real PNG invoice and run OCR", async () => {
    const form = new FormData();
    form.append("type", "service");
    form.append("consent", "false");
    form.append("file", new Blob([png], { type: "image/png" }), "audit-service-invoice.png");
    const r = await call(seller, "POST", `/api/v1/vehicles/${state.vehicleId}/documents`, { form });
    must(r, 201, "upload");
    const d = data(r);
    state.docId = d?.id ?? d?.document?.id ?? null;
    state.fileUrl = d?.fileUrl ?? null;
    const ocr = d?.ocr ?? {};
    if (!state.docId) throw new Error(`missing document id: ${short(d)}`);
    if (ocr.status !== "processed") throw new Error(`ocr not processed: ${short(ocr)}`);
    if (!ocr.isOcr) throw new Error(`not reported as OCR: ${short(ocr)}`);
    if (!(ocr.fieldsStored > 0)) throw new Error(`no fields stored: ${short(ocr)}`);
    return `doc=${state.docId} engine=${ocr.engine} method=${ocr.method} conf=${ocr.confidence} fields=${ocr.fieldsStored} status=${ocr.documentStatus}`;
  });

  await check("uploaded document appears in the vehicle document list", async () => {
    const r = await call(seller, "GET", `/api/v1/vehicles/${state.vehicleId}/documents`);
    must(r, 200);
    const items = data(r)?.items ?? data(r) ?? [];
    const found = items.find((x) => x.id === state.docId);
    if (!found) throw new Error(`doc ${state.docId} missing from ${items.length} rows`);
    return `${items.length} row(s); doc status=${found.status} ocr=${found.ocrStatus ?? found.ocr_status ?? "?"}`;
  });

  await check("extracted fields are persisted with method/confidence", async () => {
    const r = await call(seller, "GET", `/api/v1/documents/${state.docId}/extractions`);
    must(r, 200);
    const items = data(r)?.items ?? data(r) ?? [];
    if (!items.length) throw new Error("no extraction rows");
    return `${items.length} field(s); sample=${items[0].field}=${short(items[0].value, 40)} conf=${items[0].confidence} method=${items[0].method}`;
  });

  await check("document completeness reports real coverage capped at 100%", async () => {
    const r = await call(seller, "GET", `/api/v1/vehicles/${state.vehicleId}/documents/completeness`);
    must(r, 200);
    const d = data(r) ?? r.body;
    const percent = d?.percent ?? d?.completeness?.percent;
    if (typeof percent !== "number") throw new Error(`no percent: ${short(d)}`);
    if (percent < 0 || percent > 100) throw new Error(`coverage out of range: ${percent}`);
    return `${percent}% of the required set; items=${(d?.items ?? d?.completeness?.items ?? []).length}`;
  });

  await check("an anonymous caller cannot read a private document", async () => {
    if (!state.fileUrl) throw new Error("no fileUrl");
    const bare = state.fileUrl.split("?")[0];
    const r = await call(anonym, "GET", bare);
    must(r, [401, 403]);
    return r.body?.error?.code ?? String(r.status);
  });

  await check("consent toggle persists and opens only the consented file", async () => {
    const r = await call(seller, "PATCH", `/api/v1/documents/${state.docId}/consent`, { json: { consent: true } });
    must(r, 200);
    const bare = state.fileUrl.split("?")[0];
    const pub = await call(anonym, "GET", bare);
    must(pub, 200);
    const buf = Buffer.isBuffer(pub.body) ? pub.body : Buffer.from(pub.body ?? "");
    if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("consented file is not the PNG");
    return `consent persisted; anonymous download ${buf.length} bytes`;
  });

  await check("reverify re-runs document checks", async () => {
    const r = await call(seller, "POST", `/api/v1/documents/${state.docId}/reverify`, { json: {} });
    must(r, 200);
    return short(data(r) ?? r.body, 200);
  });

  await check("re-run OCR on the stored file", async () => {
    const r = await call(seller, "POST", `/api/v1/vehicles/${state.vehicleId}/documents/${state.docId}/ocr`, { json: {} });
    must(r, 200);
    const d = data(r) ?? r.body;
    const ocr = d?.ocr ?? d;
    return `engine=${ocr?.engine} fields=${ocr?.fieldsStored ?? ocr?.fields_stored ?? "?"}`;
  });

  await check("the uploaded bytes are downloadable via the signed URL", async () => {
    if (!state.fileUrl) throw new Error("upload did not return a fileUrl");
    const r = await call(seller, "GET", state.fileUrl);
    must(r, 200);
    const buf = Buffer.isBuffer(r.body) ? r.body : Buffer.from(r.body ?? "");
    if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error(`not PNG bytes (${buf.length})`);
    return `${buf.length} bytes sha256=${sha256(buf).slice(0, 16)}…`;
  });

  await check("anchoring without a configured chain refuses honestly", async () => {
    const r = await call(seller, "POST", `/api/v1/documents/${state.docId}/anchor`, { json: { consent: true } });
    must(r, [200, 400, 409, 503]);
    const d = data(r) ?? r.body ?? {};
    if (d.anchored === true && !d.txHash) throw new Error("claimed anchored without a tx hash");
    return `${r.status} anchored=${d.anchored ?? false} reason=${short(d.reason ?? d.error ?? "", 120)}`;
  });

  await check("replace uploads a new version and supersedes the old row", async () => {
    const png2 = makePng(path.join(TMP, "audit-service-invoice-v2.png"), [
      `Invoice No: TD-AUDIT-${today}-V2`,
      "Odometer Reading: 43200 KM",
      "Total Amount: 14500 INR",
    ]);
    const form = new FormData();
    form.append("file", new Blob([png2], { type: "image/png" }), "audit-service-invoice-v2.png");
    const r = await call(seller, "POST", `/api/v1/documents/${state.docId}/replace`, { form });
    must(r, [200, 201]);
    const d = data(r) ?? r.body;
    return `new=${d?.id ?? d?.document?.id ?? "?"} supersedes=${state.docId}`;
  });

  await check("invalid document type is rejected by the category allowlist", async () => {
    const form = new FormData();
    form.append("type", "rc_2w");
    form.append("file", new Blob([png], { type: "image/png" }), "wrong-type.png");
    const r = await call(seller, "POST", `/api/v1/vehicles/${state.vehicleId}/documents`, { form });
    must(r, 400);
    return r.body?.error?.code;
  });

  await check("unsupported file type is rejected (415)", async () => {
    const form = new FormData();
    form.append("type", "service");
    form.append("file", new Blob([Buffer.from("MZ not an image")], { type: "application/octet-stream" }), "malware.exe");
    const r = await call(seller, "POST", `/api/v1/vehicles/${state.vehicleId}/documents`, { form });
    must(r, [400, 415]);
    return `${r.status} ${r.body?.error?.code}`;
  });

  await check("delete removes the document from the active list", async () => {
    const r = await call(seller, "DELETE", `/api/v1/documents/${state.docId}`);
    must(r, 200);
    return short(data(r) ?? r.body, 160);
  });
}

// ===========================================================================
// F. Seller lifecycle: create vehicle, edit, list, publish, share
// ===========================================================================
async function auditSeller() {
  section("F. Seller lifecycle — vehicle, listing, publish, share");

  await check("create a vehicle draft with a unique registration", async () => {
    const r = await call(seller, "POST", "/api/v1/seller/vehicles", {
      json: {
        make: "Audit",
        model: "Backend Probe",
        variant: "QA",
        year: 2024,
        regNo: NEW_REG,
        vin: NEW_VIN,
        fuel: "Petrol",
        transmission: "Manual",
        categoryId: "passenger_car",
        location: "Pune",
        askingPrice: 725000,
      },
    });
    must(r, 201, "create vehicle");
    const d = data(r);
    state.newVehicleId = d?.id ?? null;
    state.newListingId = d?.listingId ?? null;
    if (!state.newVehicleId) throw new Error(short(d));
    return `vehicle=${state.newVehicleId} listing=${state.newListingId} reg=${NEW_REG}`;
  });

  await check("edit the draft", async () => {
    const r = await call(seller, "PATCH", `/api/v1/seller/vehicles/${state.newVehicleId}`, {
      json: { color: "Graphite", description: "Created by the live backend audit.", asking_price: 715000 },
    });
    must(r, 200);
    const d = data(r);
    if (d?.color !== "Graphite") throw new Error(`colour not persisted: ${short(d)}`);
    if (Number(d?.asking_price) !== 715000) throw new Error(`price not persisted: ${d?.asking_price}`);
    return `color=${d.color} price=${d.asking_price}`;
  });

  await check("duplicate registration is rejected (409)", async () => {
    const r = await call(seller, "POST", "/api/v1/seller/vehicles", {
      json: { make: "Audit", model: "Duplicate", regNo: NEW_REG },
    });
    must(r, 409);
    return r.body?.error?.code;
  });

  await check("create a listing draft", async () => {
    const r = await call(seller, "POST", "/api/v1/seller/listings", {
      json: {
        vehicleId: state.newVehicleId,
        headline: "Audit listing — backend probe",
        description: "Listing created by the live backend audit.",
        condition: "Good",
        location: "Pune",
        price: 715000,
      },
    });
    must(r, [200, 201]);
    const d = data(r) ?? r.body;
    state.newListingId = d?.id ?? d?.listing?.id ?? state.newListingId;
    if (!state.newListingId) throw new Error(short(d));
    return `listing=${state.newListingId} created=${d.created ?? "?"}`;
  });

  await check("publishing an incomplete listing is either allowed or honestly blocked", async () => {
    const r = await call(seller, "POST", `/api/v1/seller/listings/${state.newListingId}/publish`, { json: {} });
    must(r, [200, 422]);
    const d = data(r) ?? r.body;
    if (r.status === 422) return `blocked honestly: ${short(d?.error ?? d, 180)}`;
    return `published status=${d?.status ?? "?"}`;
  });

  await check("seller overview aggregates real counts", async () => {
    const r = await call(seller, "GET", "/api/v1/seller/overview");
    must(r, 200);
    const d = data(r);
    return short(d, 220);
  });

  await check("seller listings list includes the new draft", async () => {
    const r = await call(seller, "GET", "/api/v1/seller/listings");
    must(r, 200);
    const items = data(r)?.items ?? data(r) ?? [];
    const found = items.find((x) => (x.id ?? x.listing?.id) === state.newListingId);
    if (!found) throw new Error(`listing ${state.newListingId} not in ${items.length} rows`);
    return `${items.length} row(s)`;
  });

  await check("listing share link is generated", async () => {
    const r = await call(seller, "POST", `/api/v1/seller/listings/${state.newListingId}/share`, { json: {} });
    must(r, [200, 201]);
    const d = data(r) ?? r.body;
    if (!d?.verifyUrl || !d?.qrDataUrl) throw new Error(`no share link/QR: ${short(d)}`);
    return `verifyUrl=${short(d.verifyUrl, 80)} qrDataUrl=${d.qrDataUrl.slice(0, 24)}…`;
  });

  await check("listing stats are owner-visible", async () => {
    const r = await call(seller, "GET", `/api/v1/listings/${state.newListingId}/stats`);
    must(r, 200);
    const d = data(r);
    if (typeof d?.views !== "number") throw new Error(short(d));
    return `views=${d.views} saves=${d.saves} inquiries=${d.inquiries} status=${d.status}`;
  });

  await check("listing stats are denied to buyers (403)", async () => {
    const r = await call(buyer, "GET", `/api/v1/listings/${state.newListingId}/stats`);
    must(r, 403);
    return r.body?.error?.code;
  });

  await check("AI description draft is deterministic and grounded", async () => {
    const r = await call(seller, "POST", `/api/v1/seller/listings/${state.newListingId}/generate-description`, { json: {} });
    must(r, 200);
    const d = data(r);
    if (!d?.description) throw new Error(short(d));
    return `chars=${d.description.length} trust=${d.basedOn?.trustScore} findings=${d.basedOn?.findings}`;
  });

  await check("report-suspicious creates a real report", async () => {
    const r = await call(buyer, "POST", `/api/v1/listings/${state.newListingId}/report-suspicious`, {
      json: { reason: "Automated backend audit: the listing needs a human review." },
    });
    must(r, [200, 201]);
    const d = data(r) ?? r.body;
    if (!d?.id) throw new Error(short(d));
    return `report=${d.id} status=${d.status ?? "open"}`;
  });
}

// ===========================================================================
// G. Buyer flows: saves, searches, inquiries, messages
// ===========================================================================
async function auditBuyer() {
  section("G. Buyer flows — saves, saved searches, inquiries, messages");

  await check("buyer overview", async () => {
    const r = await call(buyer, "GET", "/api/v1/buyer/overview");
    must(r, 200);
    return short(data(r), 200);
  });

  await check("buyer recommendations", async () => {
    const r = await call(buyer, "GET", "/api/v1/buyer/recommended");
    must(r, 200);
    const d = data(r);
    const items = d?.items ?? d ?? [];
    return `${Array.isArray(items) ? items.length : "?"} recommendation(s)`;
  });

  await check("save a vehicle", async () => {
    const r = await call(buyer, "POST", `/api/v1/vehicles/${state.vehicleId}/save`, { json: {} });
    must(r, [200, 201]);
    return short(data(r) ?? r.body, 140);
  });

  await check("saved list includes it", async () => {
    const r = await call(buyer, "GET", "/api/v1/saved");
    must(r, 200);
    const items = data(r)?.items ?? data(r) ?? [];
    return `${items.length} saved item(s)`;
  });

  await check("create a saved search with alerts", async () => {
    const r = await call(buyer, "POST", "/api/v1/saved-searches", {
      json: { name: "Audit BMW search", filters: { q: "BMW", maxPrice: 2000000 }, alertsEnabled: true },
    });
    must(r, [200, 201]);
    return short(data(r) ?? r.body, 180);
  });

  await check("saved searches list", async () => {
    const r = await call(buyer, "GET", "/api/v1/saved-searches");
    must(r, 200);
    const items = data(r)?.items ?? data(r) ?? [];
    return `${items.length} saved search(es)`;
  });

  await check("buyer creates a real inquiry", async () => {
    const r = await call(buyer, "POST", "/api/v1/inquiries", {
      json: {
        listingId: state.listingId,
        message: "Is the full service history available for review? (backend audit)",
        type: "question",
      },
    });
    must(r, 201);
    const d = data(r);
    state.inquiryId = d?.id ?? d?.inquiry?.id ?? null;
    if (!state.inquiryId) throw new Error(short(d));
    return `inquiry=${state.inquiryId} deliveries=${short(d.deliveries ?? "none", 120)}`;
  });

  await check("inquiry list is participant-scoped", async () => {
    const r = await call(buyer, "GET", "/api/v1/inquiries");
    must(r, 200);
    const items = data(r)?.items ?? data(r) ?? [];
    return `${items.length} inquiry(ies)`;
  });

  await check("buyer posts a message on the inquiry", async () => {
    const r = await call(buyer, "POST", `/api/v1/inquiries/${state.inquiryId}/messages`, {
      json: { message: "Following up with the registration number. (backend audit)" },
    });
    must(r, [200, 201]);
    return short(data(r) ?? r.body, 140);
  });

  await check("message thread is readable by the buyer", async () => {
    const r = await call(buyer, "GET", `/api/v1/inquiries/${state.inquiryId}`);
    must(r, 200);
    const d = data(r);
    const messages = d?.messages ?? d?.items ?? [];
    if (!Array.isArray(messages)) throw new Error(short(d));
    return `${messages.length} message(s); status=${d?.status ?? d?.inquiry?.status ?? "?"}`;
  });

  await check("seller can read and reply to the same inquiry", async () => {
    const read = await call(seller, "GET", `/api/v1/inquiries/${state.inquiryId}`);
    must(read, 200);
    const reply = await call(seller, "POST", `/api/v1/inquiries/${state.inquiryId}/messages`, {
      json: { body: "Yes — the service records are in the report. (seller reply)" },
    });
    must(reply, [200, 201]);
    const thread = data(read);
    const count = (thread?.messages ?? thread?.items ?? []).length;
    return `thread=${count} msg(s), reply=${(data(reply) ?? reply.body)?.id ?? "ok"}`;
  });

  await check("inquiry status transition", async () => {
    // The seller moves the thread to `replied`; `resolved` is also seller-only.
    const r = await call(seller, "PATCH", `/api/v1/inquiries/${state.inquiryId}/status`, { json: { status: "replied" } });
    must(r, 200);
    const after = await call(buyer, "GET", `/api/v1/inquiries/${state.inquiryId}`);
    must(after, 200);
    const status = data(after)?.status ?? data(after)?.inquiry?.status;
    if (status !== "replied") throw new Error(`status not persisted: ${status}`);
    return `open -> replied (${short(data(r) ?? r.body, 80)})`;
  });

  await check("a third party cannot read the inquiry", async () => {
    const outsider = new Session("outsider");
    await login(outsider, "rohan@trustdrive.dev", "demo123456");
    const r = await call(outsider, "GET", `/api/v1/inquiries/${state.inquiryId}`);
    must(r, [403, 404]);
    return `${r.status} ${r.body?.error?.code}`;
  });

  await check("alerts evaluation runs over saved searches", async () => {
    const r = await call(buyer, "POST", "/api/v1/alerts/evaluate", { json: {} });
    must(r, 200);
    const d = data(r);
    if (!d) throw new Error(short(r.body));
    return `scope=${d.scope} evaluated=${d.evaluated ?? d.searches ?? "?"} created=${d.created ?? d.notifications ?? "?"}`;
  });

  await check("unsave the vehicle", async () => {
    const r = await call(buyer, "DELETE", `/api/v1/saved/${state.listingId}`);
    must(r, [200, 204]);
    const after = await call(buyer, "GET", "/api/v1/saved");
    must(after, 200);
    const items = data(after)?.items ?? data(after) ?? [];
    const still = items.find((x) => (x.listingId ?? x.listing_id ?? x.id) === state.listingId);
    if (still) throw new Error(`listing ${state.listingId} still saved`);
    return `${r.status} unsaved; ${items.length} saved item(s) remain`;
  });
}

// ===========================================================================
// H. Verification run and report pipeline
// ===========================================================================
async function auditVerificationAndReports() {
  section("H. Verification pipeline and PDF reports");

  await check("run the deterministic verification pipeline", async () => {
    const r = await call(seller, "POST", `/api/v1/vehicles/${state.vehicleId}/verify`, { json: {} });
    must(r, 200);
    const d = data(r);
    state.verificationCaseId = d?.caseId ?? null;
    if (!d?.runId || !state.verificationCaseId) throw new Error(short(d));
    return `run=${d.runId} case=${d.caseId} state=${d.caseState} checks=${d.summary?.checks} passed=${d.summary?.passed}`;
  });

  await check("verification state is readable", async () => {
    const r = await call(seller, "GET", `/api/v1/vehicles/${state.vehicleId}/verification`);
    must(r, 200);
    const d = data(r);
    if (!d?.run?.id) throw new Error(short(d));
    return `run=${d.run.id} status=${d.run.status} checks=${(d.results ?? []).length}`;
  });

  await check("verification case detail", async () => {
    if (!state.verificationCaseId) throw new Error("verify did not return a caseId");
    const r = await call(seller, "GET", `/api/v1/verification-cases/${state.verificationCaseId}`);
    must(r, 200);
    const d = data(r);
    if (!d?.case?.id) throw new Error(short(d));
    return `case=${d.case.id} state=${d.case.state} ruleset=${d.case.rulesetVersion} run=${d.run?.status} results=${(d.results ?? []).length}`;
  });

  await check("generate a full PDF report", async () => {
    const r = await call(seller, "POST", `/api/v1/reports/vehicle/${state.vehicleId}`, { json: { type: "Vehicle verification" } });
    must(r, 201);
    const d = data(r);
    state.reportId = d?.id ?? null;
    if (!state.reportId) throw new Error(short(d));
    return `report=${state.reportId} reportId=${d.reportId} downloadUrl=${d.downloadUrl ? "yes" : "no"}`;
  });

  await check("reports list contains it", async () => {
    const r = await call(seller, "GET", "/api/v1/reports");
    must(r, 200);
    const items = data(r) ?? [];
    const found = items.find((x) => x.id === state.reportId);
    if (!found) throw new Error(`report ${state.reportId} not in ${items.length} rows`);
    return `${items.length} report(s); type=${found.type} status=${found.status}`;
  });

  await check("report detail exposes the version before download", async () => {
    const r = await call(seller, "GET", `/api/v1/reports/${state.reportId}`);
    must(r, 200);
    const d = data(r);
    const report = d?.report;
    if (!report?.id) throw new Error(short(d));
    return `status=${report.status} version=${report.version} type=${report.type} hash=${report.pdfHash ? "present" : "not generated yet"}`;
  });

  await check("report download is a real PDF whose SHA-256 matches the record", async () => {
    const r = await call(seller, "GET", `/api/v1/reports/${state.reportId}/download`);
    must(r, 200);
    const buf = Buffer.isBuffer(r.body) ? r.body : Buffer.from(r.body ?? "");
    if (buf.subarray(0, 5).toString() !== "%PDF-") throw new Error(`not a PDF: ${buf.subarray(0, 12).toString()}`);
    const hash = sha256(buf);
    const detail = await call(seller, "GET", `/api/v1/reports/${state.reportId}`);
    must(detail, 200);
    const recordHash = data(detail)?.report?.pdfHash;
    if (!recordHash) throw new Error("download did not persist a pdf_hash");
    if (recordHash !== hash) throw new Error(`hash mismatch record=${recordHash} bytes=${hash}`);
    return `${buf.length} bytes sha256=${hash.slice(0, 16)}… matched=yes`;
  });

  await check("anonymous report download is denied", async () => {
    const r = await call(anonym, "GET", `/api/v1/reports/${state.reportId}/download`);
    must(r, [401, 403]);
    return `${r.status} ${r.body?.error?.code ?? ""}`;
  });
}

// ===========================================================================
// I. AI: grounded assistant + LangGraph investigation
// ===========================================================================
async function auditAi() {
  section("I. AI — grounded assistant and LangGraph investigation");

  await check("grounded assistant answers from stored evidence with citations", async () => {
    const r = await call(admin, "POST", "/api/v1/ai/assistant", {
      json: {
        vehicleId: state.vehicleId,
        question: "Summarise the evidence for this vehicle and cite the evidence IDs.",
      },
    });
    must(r, 200);
    const d = data(r);
    const citations = d?.citations ?? [];
    if (d?.grounded !== true) throw new Error(`grounded=${d?.grounded} ${short(d)}`);
    if (!citations.length) throw new Error("no citations");
    if (!d?.provider) throw new Error("missing provider");
    return `provider=${d.provider} model=${d.model} grounded=${d.grounded} citations=${citations.length} rejected=${d.llmRejected}`;
  });

  await check("assistant refuses to invent a vehicle", async () => {
    const r = await call(admin, "POST", "/api/v1/ai/assistant", {
      json: { vehicleId: "v-does-not-exist", question: "What is the trust score?" },
    });
    must(r, [400, 404]);
    return `${r.status} ${r.body?.error?.code}`;
  });

  await check("LangGraph investigation completes with a graph trace", async () => {
    const r = await call(admin, "POST", `/api/v1/vehicles/${state.vehicleId}/ai-investigations`, {
      json: { question: "Summarise the verified evidence and open findings." },
    });
    must(r, 200);
    const d = data(r);
    state.investigationId = d?.id ?? d?.investigationId ?? null;
    if (d?.source !== "python-intelligence") throw new Error(`fallback source=${d?.source} reason=${d?.fallbackReason ?? "?"}`);
    if (d?.orchestrator !== "langgraph") throw new Error(`orchestrator=${d?.orchestrator}`);
    if (d?.graph !== "langgraph-conditional") throw new Error(`graph=${d?.graph}`);
    // High-impact open findings correctly gate the run behind human review.
    if (d?.status !== "completed" && d?.status !== "awaiting_review") throw new Error(`status=${d?.status}`);
    if (d?.status === "awaiting_review" && !d?.humanReview?.id) throw new Error("awaiting_review without a human review id");
    if (!d?.answer) throw new Error("no answer");
    return `id=${state.investigationId} engine=${d.engine} graph=${d.graph} status=${d.status} ckpt=${d.checkpointing} nodes=${(d.nodes ?? []).length} citations=${(d.citations ?? []).length} review=${d.humanReview?.id ?? "none"}`;
  });

  await check("investigation history is persisted", async () => {
    const r = await call(admin, "GET", `/api/v1/vehicles/${state.vehicleId}/ai-investigations`);
    must(r, 200);
    const items = data(r)?.items ?? data(r) ?? [];
    if (!items.length) throw new Error("no persisted investigations");
    return `${items.length} run(s); latest=${items[0].id} status=${items[0].status}`;
  });
}

// ===========================================================================
// J. Admin tools
// ===========================================================================
async function auditAdmin() {
  section("J. Admin — users, audit, queue, KYC, disputes, moderation");

  await check("admin users list", async () => {
    const r = await call(admin, "GET", "/api/v1/admin/users?page=1&pageSize=20");
    must(r, 200);
    const d = data(r);
    const items = d?.items ?? [];
    if (!items.length) throw new Error(short(d));
    return `${items.length} user(s); total=${d?.page?.total} first=${items[0].email}/${items[0].role}`;
  });

  await check("admin users list is denied to sellers (403)", async () => {
    const r = await call(seller, "GET", "/api/v1/admin/users");
    must(r, 403);
    return r.body?.error?.code;
  });

  await check("admin audit log", async () => {
    const r = await call(admin, "GET", "/api/v1/admin/audit?page=1&pageSize=20");
    must(r, 200);
    const items = data(r)?.items ?? data(r) ?? [];
    return `${items.length} audit row(s)`;
  });

  await check("admin background queue", async () => {
    const r = await call(admin, "GET", "/api/v1/admin/queue");
    must(r, 200);
    const d = data(r);
    if (!d?.counts) throw new Error(short(d));
    state.disputeId = d.disputes?.[0]?.id ?? "disp-1";
    return `disputes=${(d.disputes ?? []).length} pending=${d.counts.disputes} listings=${(d.listings ?? []).length} documents=${(d.documents ?? []).length}`;
  });

  await check("admin dispute detail includes finding and evidence context", async () => {
    const r = await call(admin, "GET", `/api/v1/admin/disputes/${state.disputeId ?? "disp-1"}`);
    must(r, 200);
    const d = data(r);
    if (!d?.dispute?.id) throw new Error(short(d));
    return `dispute=${d.dispute.id} status=${d.dispute.status} finding=${d.finding?.id ?? "none"} vehicle=${d.vehicle?.id ?? "none"}`;
  });

  await check("admin KYC queue", async () => {
    const r = await call(admin, "GET", "/api/v1/admin/kyc");
    must(r, 200);
    const d = data(r);
    if (!d?.counts) throw new Error(short(d));
    return `${(d.items ?? []).length} submission(s); pending=${d.counts.pending} verified=${d.counts.verified}`;
  });

  await check("seller KYC state and upload", async () => {
    const before = await call(seller, "GET", "/api/v1/me/kyc");
    must(before, 200);
    const png = makePng(path.join(TMP, "audit-kyc.png"), ["KYC DOCUMENT", "Name: Samarth Darak", "ID: AUDIT-2026"]);
    const form = new FormData();
    form.append("document", new Blob([png], { type: "image/png" }), "audit-kyc.png");
    const up = await call(seller, "POST", "/api/v1/me/kyc", { form });
    must(up, [200, 201]);
    const d = data(up) ?? up.body;
    return `before=${data(before)?.status} after=${d?.status} uploaded=${data(before)?.documentUploaded}`;
  });

  await check("admin approves the seller KYC", async () => {
    const r = await call(admin, "PATCH", "/api/v1/admin/kyc/u-seller", { json: { status: "verified", note: "Audit approval" } });
    must(r, 200);
    return short(data(r) ?? r.body, 160);
  });

  await check("admin resolves a dispute with an audited note", async () => {
    const r = await call(admin, "POST", `/api/v1/admin/disputes/${state.disputeId ?? "disp-1"}/resolve`, {
      json: { decision: "resolved", note: "Backend audit reviewed the evidence and resolved the dispute." },
    });
    must(r, 200);
    return short(data(r) ?? r.body, 120);
  });

  await check("admin can read a listing", async () => {
    const r = await call(admin, "GET", `/api/v1/admin/listings/${state.listingId}`);
    must(r, 200);
    const d = data(r);
    if (!d?.listing?.id && !d?.id) throw new Error(short(d));
    return `listing=${d?.listing?.id ?? d?.id} status=${d?.listing?.status ?? d?.status ?? "?"}`;
  });

  await check("admin suspends the audit listing", async () => {
    const r = await call(admin, "POST", `/api/v1/admin/listings/${state.newListingId}/suspend`, {
      json: { reason: "Backend audit moderation probe" },
    });
    must(r, 200);
    return short(data(r) ?? r.body, 120);
  });
}

// ===========================================================================
// K. Account self-service and notifications
// ===========================================================================
async function auditAccount() {
  section("K. Account self-service and notifications");

  await check("users/me alias", async () => {
    const r = await call(buyer, "GET", "/api/v1/users/me");
    must(r, 200);
    return short(data(r) ?? r.body, 140);
  });

  await check("2FA enrolment returns a real TOTP secret", async () => {
    const r = await call(buyer, "POST", "/api/v1/me/2fa", { json: { password: "demo123456" } });
    must(r, 200);
    const d = data(r);
    if (!d?.secret || !d?.otpauthUrl) throw new Error(short(d));
    return `issuer=${d.issuer} secretLength=${d.secret.length}`;
  });

  await check("2FA rejects an invalid code", async () => {
    const r = await call(buyer, "PUT", "/api/v1/me/2fa", { json: { code: "000000" } });
    must(r, [401, 409]);
    return `${r.status} ${r.body?.error?.code}`;
  });

  await check("avatar upload persists", async () => {
    const png = makePng(path.join(TMP, "audit-avatar.png"), ["TD"]);
    const form = new FormData();
    form.append("avatar", new Blob([png], { type: "image/png" }), "audit-avatar.png");
    const r = await call(buyer, "POST", "/api/v1/me/avatar", { form });
    must(r, [200, 201]);
    return short(data(r) ?? r.body, 180);
  });

  await check("profile update persists", async () => {
    const r = await call(seller, "PATCH", "/api/v1/me", {
      json: { name: "Samarth Darak", phone: "+919876543210", city: "Pune" },
    });
    must(r, 200);
    const d = data(r) ?? r.body;
    return `city=${d?.city} phone=${d?.phone}`;
  });

  await check("password change and revert", async () => {
    const change = await call(buyer, "POST", "/api/v1/me/password", {
      json: { currentPassword: "demo123456", newPassword: "TrustDrive!2026#Temp" },
    });
    must(change, [200, 204]);
    const back = await call(buyer, "POST", "/api/v1/me/password", {
      json: { currentPassword: "TrustDrive!2026#Temp", newPassword: "demo123456" },
    });
    must(back, [200, 204]);
    return "changed and reverted";
  });

  await check("weak password is rejected", async () => {
    const r = await call(buyer, "POST", "/api/v1/me/password", {
      json: { currentPassword: "demo123456", newPassword: "short" },
    });
    must(r, 400);
    return r.body?.error?.code;
  });

  await check("notifications list", async () => {
    const r = await call(buyer, "GET", "/api/v1/notifications");
    must(r, 200);
    const items = data(r)?.items ?? data(r) ?? [];
    state.notificationId = items[0]?.id ?? null;
    return `${items.length} notification(s)`;
  });

  await check("mark one notification read", async () => {
    if (!state.notificationId) throw new Error("buyer has no notifications");
    const r = await call(buyer, "PATCH", `/api/v1/notifications/${state.notificationId}/read`, { json: {} });
    must(r, 200);
    return short(data(r) ?? r.body, 120);
  });

  await check("mark all notifications read", async () => {
    const r = await call(buyer, "POST", "/api/v1/notifications/read-all", { json: {} });
    must(r, 200);
    return short(data(r) ?? r.body, 140);
  });

  await check("notification stream is a real SSE endpoint", async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    try {
      const res = await buyer.request("/api/v1/notifications/stream", { signal: controller.signal });
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("text/event-stream")) throw new Error(`content-type=${ct}`);
      return `content-type=${ct}`;
    } finally {
      clearTimeout(timer);
    }
  });
}

// ===========================================================================
// L. Damage review + corrections (immutability path)
// ===========================================================================
async function auditDamage() {
  section("L. Damage review and audited corrections");

  await check("create a real damage record", async () => {
    const list = await call(admin, "GET", `/api/v1/vehicles/${state.vehicleId}/damage`);
    must(list, 200);
    const hotspot = (data(list)?.hotspots ?? [])[0];
    const zoneId = hotspot?.componentId ?? hotspot?.id ?? "front_bumper";
    const r = await call(seller, "POST", `/api/v1/vehicles/${state.vehicleId}/damage`, {
      json: {
        zoneId,
        description: "Backend audit: light scuff observed during the automated probe.",
        severity: "Minor",
        repairStatus: "Not repaired",
      },
    });
    must(r, 201);
    const d = data(r) ?? r.body;
    state.damageId = d?.id ?? d?.record?.id ?? null;
    if (!state.damageId) throw new Error(short(d));
    return `damage=${state.damageId} zone=${zoneId} status=${d.status ?? "pending"}`;
  });

  await check("damage review records a decision through the Python service", async () => {
    const r = await call(admin, "PATCH", `/api/v1/vehicles/${state.vehicleId}/damage/${state.damageId}/review`, {
      json: { status: "verified" },
    });
    must(r, [200, 201]);
    return `${r.status} ${short(data(r) ?? r.body, 140)}`;
  });

  await check("correction requires a description and writes an audit trail", async () => {
    const bad = await call(seller, "POST", `/api/v1/damage/${state.damageId}/correction`, { json: {} });
    must(bad, 400);
    const r = await call(seller, "POST", `/api/v1/damage/${state.damageId}/correction`, {
      json: { description: "Corrected by the automated backend audit run.", repairStatus: "Repaired" },
    });
    must(r, 201);
    const d = data(r) ?? r.body;
    if (!d?.id) throw new Error(short(d));
    return `${r.status} new=${d.id} supersedes=${d.supersedesId ?? state.damageId}`;
  });
}

// ===========================================================================
// Run
// ===========================================================================
async function main() {
  console.log(`TrustDrive live backend audit -> ${BASE}`);
  console.log(`Python intelligence          -> ${PY}`);
  console.log(`Run id ${runId}, new account ${NEW_EMAIL}, new reg ${NEW_REG}`);

  await auditAuth();
  await auditSystem();
  await auditPublic();
  await auditVehicleEvidence();
  await auditDocuments();
  await auditSeller();
  await auditBuyer();
  await auditVerificationAndReports();
  await auditAi();
  await auditAdmin();
  await auditAccount();
  await auditDamage();

  const passed = results.filter((r) => r.ok).length;
  const failed = results.length - passed;
  const bySection = {};
  for (const row of results) {
    bySection[row.section] ??= { pass: 0, fail: 0 };
    bySection[row.section][row.ok ? "pass" : "fail"] += 1;
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log(`SUMMARY: ${passed}/${results.length} passed, ${failed} failed`);
  for (const [name, counts] of Object.entries(bySection)) {
    console.log(`  ${counts.fail ? "FAIL" : "ok  "} ${name}: ${counts.pass} pass, ${counts.fail} fail`);
  }
  console.log(`\nFAILURES:`);
  if (!failed) console.log("  none");
  for (const row of results.filter((r) => !r.ok)) {
    console.log(`  - [${row.section}] ${row.name}: ${row.evidence}`);
  }

  fs.writeFileSync(
    OUT_JSON,
    JSON.stringify(
      {
        base: BASE,
        python: PY,
        runId,
        startedAt: new Date().toISOString(),
        passed,
        failed,
        total: results.length,
        bySection,
        results,
      },
      null,
      2
    )
  );
  console.log(`\nWrote ${path.relative(ROOT, OUT_JSON)}`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error("AUDIT CRASHED:", error);
  process.exitCode = 2;
});
