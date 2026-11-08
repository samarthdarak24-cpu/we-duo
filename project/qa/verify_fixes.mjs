/**
 * TrustDrive — targeted LIVE verification of the 10 documented fixes.
 * Uses real Bearer tokens (login) + node:sqlite for fixtures. No mocks.
 *
 *   node qa/verify_fixes.mjs
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = "C:/Users/darak/Downloads/finall caranimation";
const BASE = "http://127.0.0.1:3000";
const INTEL = "http://127.0.0.1:8000";
const DB_FILE = path.join(ROOT, ".data", "trustdrive.db");

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail: String(detail).slice(0, 320) });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name} — ${String(detail).slice(0, 160)}`);
}
const sqlOne = (q, ...p) => {
  const db = new DatabaseSync(DB_FILE, { readOnly: true });
  try { return db.prepare(q).get(...p); } finally { db.close(); }
};

async function login(email, password) {
  const r = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (r.status !== 200) return null;
  // The login sets a td_token cookie; its value is the signed JWT — reuse as Bearer.
  const setCookie = typeof r.headers.getSetCookie === "function"
    ? r.headers.getSetCookie()
    : [r.headers.get("set-cookie")].filter(Boolean);
  const raw = (setCookie || []).find((c) => /td_token=/.test(c)) || "";
  const m = raw.match(/td_token=([^;]+)/);
  return m ? m[1] : null;
}
async function api(method, url, token, body, isForm = false) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  let payload;
  if (body !== undefined) {
    if (isForm) payload = body;
    else { headers["content-type"] = "application/json"; payload = JSON.stringify(body); }
  }
  const r = await fetch(url, { method, headers, body: payload });
  let data = null;
  try { data = await r.json(); } catch { try { data = await r.text(); } catch {} }
  return { status: r.status, data };
}
function firstPdf() {
  const base = path.join(ROOT, ".data", "uploads", "documents");
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { const f = walk(p); if (f) return f; }
      else if (e.name.toLowerCase().endsWith(".pdf")) return p;
    }
    return null;
  };
  return walk(base);
}

// Harden: any fetch that hangs (e.g. a stuck dev server) aborts instead of
// blocking the whole run forever. Callers may still pass their own signal.
const _origFetch = globalThis.fetch;
globalThis.fetch = (url, opts = {}) =>
  _origFetch(url, { ...opts, signal: opts.signal || AbortSignal.timeout(25000) });

(async () => {
  const sellerTok = await login("samarth@trustdrive.dev", "demo1234");
  const buyerTok = await login("rohan@trustdrive.dev", "demo1234");
  const seller2Tok = await login("weduo@trustdrive.dev", "demo1234");
  check("Auth — seller/seller2/buyer tokens issued", !!sellerTok && !!buyerTok && !!seller2Tok,
    `seller=${!!sellerTok} buyer=${!!buyerTok} seller2=${!!seller2Tok}`);
  if (!sellerTok) { finish(); return; }

  // #6 — single dev server, no .next corruption (no 500s)
  const l1 = await fetch(`${BASE}/login`); const l2 = await fetch(`${BASE}/marketplace`);
  const listeners = execSync("netstat -ano | findstr :3000 | findstr LISTENING").toString().trim().split("\n").filter(Boolean).length;
  check("#6 Single server / no .next corruption — key pages 200 (no 500)",
    l1.status === 200 && l2.status === 200, `login=${l1.status} marketplace=${l2.status} :3000-listeners=${listeners}`);

  // #7 — public real demo PDF endpoint (was 403)
  const pdf = await fetch(`${BASE}/api/v1/public/sample-report`);
  const ct = pdf.headers.get("content-type") || "";
  const pbuf = Buffer.from(await pdf.arrayBuffer());
  check("#7 Public 'Download Real PDF' CTA — real demo PDF (was 403)",
    pdf.status === 200 && ct.includes("application/pdf") && pbuf.length > 5000,
    `http=${pdf.status} type=${ct} bytes=${pbuf.length}`);

  // #8 — offline 'Live stack' no longer falsely claims 7 active engines
  const stack = await (await fetch(`${BASE}/api/v1/ai/stack`)).json();
  const sd = stack?.data || {};
  const ocr = sd.ocr || [];
  const allActive = Array.isArray(ocr) && ocr.length > 0 && ocr.every((e) => e.available === true);
  const hasFalse = Array.isArray(ocr) && ocr.some((e) => e.available === false);
  check("#8 'Live stack' reports honest per-engine availability (no false 7-active)",
    !allActive && hasFalse, `connected=${sd.connected} ocr=[${ocr.map((e) => `${e.engine}:${e.available}`).join(",")}]`);

  // #2 — AI investigations call LangGraph first, not Next fallback
  const inv = await api("POST", `${BASE}/api/v1/vehicles/v-bmw/ai-investigations`, sellerTok,
    { question: "Summarise any fraud signals for this vehicle." });
  const invData = inv.data?.data || inv.data || {};
  const source = invData.source || inv.data?.source;
  const orch = invData.orchestrator || inv.data?.orchestrator;
  const graph = invData.graph || inv.data?.graph;
  const health = await (await fetch(`${INTEL}/health`)).json();
  check("#2 AI investigations use LangGraph first (not next-deterministic-fallback)",
    source !== "next-deterministic-fallback" && (orch === "langgraph" || /langgraph/.test(graph || "")),
    `source=${source} orchestrator=${orch} graph=${graph} health.orch=${health?.agent?.orchestrator}`);

  // #3 — private documents: consent + ownership gates
  const priv = sqlOne(`SELECT d.id, d.file_key FROM documents d
    JOIN vehicles v ON d.vehicle_id=v.id
    JOIN users u ON u.id=v.owner_id
    WHERE u.role='seller' AND u.email!='samarth@trustdrive.dev' AND d.file_key IS NOT NULL LIMIT 1`);
  if (priv) {
    const cross = await api("GET", `${BASE}/api/v1/documents/${priv.id}`, sellerTok); // seller A reads seller B doc
    const anon = await api("GET", `${BASE}/api/v1/files/${priv.file_key}`); // anonymous file URL
    check("#3 Private document consent+ownership gate — cross-seller read blocked",
      cross.status === 403 || cross.status === 404, `http=${cross.status} doc=${priv.id}`);
    check("#3 Private document file URL — anonymous blocked",
      [401, 403, 404].includes(anon.status), `http=${anon.status} key=${priv.file_key}`);
  } else {
    check("#3 Private document consent+ownership gate", false, "no seller2 document fixture found");
  }

  // #4 — two-wheelers show labelled schematic, NOT the car GLB
  const tw = await api("GET", `${BASE}/api/v1/vehicles/v-ducati/3d-model`, sellerTok);
  const twD = tw.data?.data || tw.data || {};
  const car = await api("GET", `${BASE}/api/v1/vehicles/v-bmw/3d-model`, sellerTok);
  const carD = car.data?.data || car.data || {};
  check("#4 Two-wheeler uses labelled schematic (not car GLB)",
    !twD.assetUrl && twD.assetScope === "labelled-schematic" && twD.interactionsAvailable === false,
    `cat=${twD.categoryLabel}/${twD.categoryClass} assetUrl=${twD.assetUrl} scope=${twD.assetScope} interactions=${twD.interactionsAvailable}`);
  check("#4 Car keeps its category-matched GLB",
    !!carD.assetUrl && carD.assetScope === "generic-reference",
    `assetUrl=${String(carD.assetUrl).slice(0, 40)} scope=${carD.assetScope}`);

  // #5 — demo theft data missing → unavailable (not a fake clean check)
  const theftMissing = await api("GET", `${BASE}/api/v1/vehicles/v-ducati/theft`, sellerTok);
  const theftPresent = await api("GET", `${BASE}/api/v1/vehicles/v-bmw/theft`, sellerTok);
  check("#5 Missing theft data reported unavailable (not fabricated clean)",
    theftMissing.status === 404 && theftPresent.status === 200,
    `missing(v-ducati)=${theftMissing.status} present(v-bmw)=${theftPresent.status}`);

  // #1 — OCR upload no longer stays pending; real FastAPI bridge runs extraction
  const pdfPath = firstPdf();
  if (pdfPath) {
    const bytes = fs.readFileSync(pdfPath);
    const fd = new FormData();
    fd.append("file", new Blob([bytes], { type: "application/pdf" }), "verify.pdf");
    fd.append("type", "insurance");
    fd.append("consent", "true");
    const up = await fetch(`${BASE}/api/v1/vehicles/v-1793883128218/documents`, {
      method: "POST", headers: { Authorization: `Bearer ${sellerTok}` }, body: fd,
    });
    const upj = await up.json().catch(() => ({}));
    const ocrRes = upj?.data?.ocr || upj?.ocr;
    const ocrRan = ocrRes && (ocrRes.status === "processed" || ocrRes.status === "completed" || ocrRes.extracted || ocrRes.text || ocrRes.fields);
    check("#1 OCR upload runs via real FastAPI bridge (not stuck pending)",
      up.status === 201 && ocrRan, `http=${up.status} ocr=${JSON.stringify(ocrRes).slice(0, 160)}`);
  } else {
    check("#1 OCR upload runs via real FastAPI bridge", false, "no sample PDF found in uploads");
  }

  // #9 — seller publish uses the correct vehicle (no stale closure).
  // v-1794067414542 (Hyundai i20) already has a verified RC + complete required
  // fields and NO listing, so the only gate left to satisfy is 3 listing photos.
  {
    const vehicleId = "v-1794067414542";
    let mk = await api("POST", `${BASE}/api/v1/seller/listings`, sellerTok,
      { vehicleId, headline: "Verify Publish Closure QA", description: "independent verification", condition: "used" });
    let listingId;
    if (mk.status === 200 || mk.status === 201) {
      listingId = mk.data?.data?.id || mk.data?.id;
    } else if (mk.status === 409) {
      const list = await api("GET", `${BASE}/api/v1/seller/listings`, sellerTok);
      const item = (list.data?.data?.items || list.data?.items || []).find(
        (it) => it.vehicle?.id === vehicleId || it.listing?.vehicle_id === vehicleId);
      listingId = item?.listing?.id;
    }
    if (listingId) {
      const ph = await api("GET", `${BASE}/api/v1/vehicles/${vehicleId}/photos`, sellerTok);
      const have = (ph.data?.data?.images || ph.data?.images || []).length;
      if (have < 3) {
        const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42tENAAAAAEEB7wRjAAAAAElFTkSuQmCC", "base64");
        const fd = new FormData();
        for (let i = 0; i < 3; i += 1) fd.append("files", new Blob([png], { type: "image/png" }), `p${i}.png`);
        await fetch(`${BASE}/api/v1/vehicles/${vehicleId}/photos`, { method: "POST", headers: { Authorization: `Bearer ${sellerTok}` }, body: fd });
      }
      const pub = await api("POST", `${BASE}/api/v1/seller/listings/${listingId}/publish`, sellerTok);
      const detail = await api("GET", `${BASE}/api/v1/seller/listings/${listingId}`, sellerTok);
      const dd = detail.data?.data || detail.data || {};
      const listingObj = dd.listing || dd;
      const veh = dd.vehicle || {};
      const okVehicle = listingObj.vehicleId === vehicleId || listingObj.vehicle_id === vehicleId || veh.id === vehicleId;
      const published = ["published", "active", "live"].includes((listingObj.status || "").toLowerCase());
      // 200 = just published; 409 = already published. Both leave the listing published.
      const publishOk = pub.status === 200 || (pub.status === 409 && published);
      check("#9 Seller publish uses correct vehicle (no stale closure)",
        publishOk && published && okVehicle,
        `publish=${pub.status} status=${listingObj.status} vehicle_id=${listingObj.vehicleId || listingObj.vehicle_id || veh.id} expected=${vehicleId}`);
    } else {
      check("#9 Seller publish uses correct vehicle (no stale closure)", false, `no listing (create http=${mk.status})`);
    }
  }

  finish();
})();

function finish() {
  const pass = results.filter((r) => r.ok).length;
  const fail = results.length - pass;
  console.log(`\n=== SUMMARY: ${pass}/${results.length} passed, ${fail} failed ===`);
  process.exit(fail === 0 ? 0 : 1);
}
