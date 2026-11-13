// Live WRITE-flow harness: exercises every mutating endpoint against the running
// server and proves persistence by re-reading.
const BASE = process.env.TD_BASE || "http://127.0.0.1:3000";
const rows = [];
let jar = "";

function tok() {
  const m = /(?:^|;\s*)td_token=([^;]+)/.exec(jar || "");
  return m ? m[1] : "";
}

async function call(path, { method = "GET", body, form, headers = {} } = {}) {
  const h = { ...headers };
  if (jar) h.cookie = jar;
  if (tok()) h.authorization = "Bearer " + tok();
  if (body !== undefined) h["content-type"] = "application/json";
  const res = await fetch(BASE + path, {
    method, headers: h,
    body: form !== undefined ? form : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const sc = res.headers.getSetCookie ? res.headers.getSetCookie().join("; ") : res.headers.get("set-cookie") || "";
  if (sc) jar = sc.split(",").map((p) => p.split(";")[0].trim()).filter(Boolean).join("; ");
  const txt = await res.text();
  let json; try { json = JSON.parse(txt); } catch { json = { _raw: txt.slice(0, 200) }; }
  return { status: res.status, json };
}

function rec(name, r, extra = "") {
  const ok = r.status >= 200 && r.status < 300;
  const err = r.json?.error;
  rows.push({
    name, status: r.status, ok,
    detail: ok ? extra || JSON.stringify(r.json?.data).slice(0, 110) : (err ? err.code + ": " + err.message : JSON.stringify(r.json).slice(0, 160)),
  });
  return r.json?.data;
}

(async () => {
  await call("/api/v1/auth/login", { method: "POST", body: { email: "samarth@trustdrive.dev", password: "demo123456" } });

  // ---- 3.2/3.3 ADD VEHICLE (the endpoint the UI stepper actually calls)
  const AL = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789"; // VIN charset: no I, O, Q
  const rnd = (n) => Array.from({ length: n }, () => AL[Math.floor(Math.random() * AL.length)]).join("");
  const vin = ("TD" + rnd(15)).slice(0, 17);
  const reg = "MH" + (10 + (Date.now() % 70)) + "AB" + (1000 + (Date.now() % 8999));
  const v = rec("POST /seller/vehicles (draft)", await call("/api/v1/seller/vehicles", {
    method: "POST", body: { make: "Hyundai", model: "Creta", variant: "SXZ", year: 2021, vin, regNo: reg, fuel: "Petrol", transmission: "Automatic", color: "Silver", ownershipCount: 1, location: "Pune", km: 42000, price: 1450000, description: "Single owner, full service history.", condition: "Good" },
  }));
  const vid = v?.id || v?.vehicle?.id;
  const lidFromDraft = v?.listingId;
  console.log("new vehicle id:", vid, "listingId:", lidFromDraft);
  if (!vid) { console.log(JSON.stringify(rows, null, 1)); process.exit(1); }

  rec("GET /vehicles/:id", await call(`/api/v1/vehicles/${vid}`));
  rec("PATCH /seller/vehicles/:id", await call(`/api/v1/seller/vehicles/${vid}`, { method: "PATCH", body: { km: 43100, description: "Updated by live write audit." } }));

  // ---- photos
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const fd1 = new FormData();
  fd1.append("files", new Blob([png], { type: "image/png" }), "audit-front.png");
  rec("POST /vehicles/:id/photos", await call(`/api/v1/vehicles/${vid}/photos`, { method: "POST", form: fd1 }));

  // ---- 3.4 DOCUMENT UPLOAD + OCR
  const PDF = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 120>>stream\nBT /F1 12 Tf 60 780 Td (REGISTRATION CERTIFICATE MH12AB1234 VIN MA1234567890) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n",
    "utf8");
  const fd2 = new FormData();
  fd2.append("file", new Blob([PDF], { type: "application/pdf" }), "audit-rc.pdf");
  fd2.append("type", "rc");
  fd2.append("consent", "true");
  const doc = rec("POST /vehicles/:id/documents (RC)", await call(`/api/v1/vehicles/${vid}/documents`, { method: "POST", form: fd2 }));
  const docId = doc?.id || doc?.document?.id || doc?.doc?.id;
  console.log("doc id:", docId);
  rec("GET /documents/:id", await call(`/api/v1/documents/${docId}`));
  rec("GET /documents/:id/extractions", await call(`/api/v1/documents/${docId}/extractions`));
  rec("POST /documents/:id/reverify", await call(`/api/v1/documents/${docId}/reverify`, { method: "POST", body: {} }));
  rec("PATCH /documents/:id/consent", await call(`/api/v1/documents/${docId}/consent`, { method: "PATCH", body: { consent: false } }));

  // ---- mileage reading
  rec("POST /vehicles/:id/mileage", await call(`/api/v1/vehicles/${vid}/mileage`, { method: "POST", body: { km: 43100, date: new Date().toISOString().slice(0, 10), source: "service" } }));

  // ---- history
  rec("POST /vehicles/:id/history", await call(`/api/v1/vehicles/${vid}/history`, { method: "POST", body: { date: new Date().toISOString().slice(0, 10), km: 41000, category: "service", title: "Audit service event", description: "Written by live audit." } }));

  // ---- 3.6 VERIFICATION RUN
  const vr = rec("POST /vehicles/:id/verify", await call(`/api/v1/vehicles/${vid}/verify`, { method: "POST" }));
  console.log("verify run:", JSON.stringify(vr).slice(0, 400));
  const ver = rec("GET /vehicles/:id/verification", await call(`/api/v1/vehicles/${vid}/verification`));
  console.log("verification:", JSON.stringify(ver).slice(0, 300));

  // ---- 3.7 AI FINDINGS + INVESTIGATION
  rec("GET /vehicles/:id/findings", await call(`/api/v1/vehicles/${vid}/findings`));
  rec("POST /vehicles/:id/ai-investigations", await call(`/api/v1/vehicles/${vid}/ai-investigations`, { method: "POST", body: {} }));
  rec("GET /vehicles/:id/ai-investigations", await call(`/api/v1/vehicles/${vid}/ai-investigations`));
  rec("GET /vehicles/:id/risk", await call(`/api/v1/vehicles/${vid}/risk`));

  // ---- 3.8 DAMAGE / 3D
  rec("GET /vehicles/:id/components", await call(`/api/v1/vehicles/${vid}/components`));
  const comps = await call(`/api/v1/vehicles/${vid}/components`);
  const compList = comps.json?.data?.components || comps.json?.data?.items || [];
  const compId = Array.isArray(compList) && compList.length ? (compList[0].id || compList[0].componentId) : "";
  const dmg = rec("POST /vehicles/:id/damage", await call(`/api/v1/vehicles/${vid}/damage`, {
    method: "POST", body: { zoneId: compId, severity: "Minor", description: "Audit scratch on front bumper", repairDetails: "Panel repaint recommended", repairStatus: "Not repaired" },
  }));
  const dmgId = dmg?.id || dmg?.record?.id;
  rec("GET /vehicles/:id/damage", await call(`/api/v1/vehicles/${vid}/damage`));
  rec("POST /damage/:id/correction", await call(`/api/v1/damage/${dmgId}/correction`, { method: "POST", body: { description: "Audit correction: depth 2mm", reason: "Inspection follow-up" } }));
  rec("GET /vehicles/:id/3d-model", await call(`/api/v1/vehicles/${vid}/3d-model`));

  // ---- 3.9 LISTINGS
  const lst = rec("POST /seller/listings", await call("/api/v1/seller/listings", { method: "POST", body: { vehicleId: vid, price: 1450000, description: "Audit listing for live write test.", city: "Pune", status: "draft" } }));
  const lid = lst?.id || lst?.listing?.id;
  console.log("new listing id:", lid);
  for (const [label, action] of [["publish", "publish"], ["pause", "pause"], ["resume", "resume"], ["sold", "sold"]]) {
    rec(`POST /seller/listings/:id/${action}`, await call(`/api/v1/seller/listings/${lid}/${action}`, { method: "POST", body: {} }));
  }
  rec("GET /listings/:id/stats", await call(`/api/v1/listings/${lid}/stats`));
  rec("POST /seller/listings/:id/share", await call(`/api/v1/seller/listings/${lid}/share`, { method: "POST", body: {} }));

  // ---- trust / chain / reports / qr
  rec("GET /vehicles/:id/trust", await call(`/api/v1/vehicles/${vid}/trust`));
  rec("GET /vehicles/:id/trust (rerun)", await call(`/api/v1/vehicles/${vid}/trust`));
  rec("GET /vehicles/:id/chain", await call(`/api/v1/vehicles/${vid}/chain`));
  const rep = rec("GET /vehicles/:id/report", await call(`/api/v1/vehicles/${vid}/report`));
  const repId = rep?.id || rep?.report?.id;
  if (repId) {
    const dl = await call(`/api/v1/reports/${repId}/download`);
    rows.push({ name: "GET /reports/:id/download", status: dl.status, ok: dl.status < 300, detail: "bytes:" + (dl.json?._raw?.length || 0) });
  }
  rec("POST /reports/vehicle/:id", await call(`/api/v1/reports/vehicle/${vid}`, { method: "POST", body: {} }));

  // ---- notifications
  rec("GET /notifications", await call("/api/v1/notifications"));
  const nf = await call("/api/v1/notifications");
  const nid = (nf.json?.data?.items || [])[0]?.id;
  if (nid) rec("PATCH /notifications/:id/read", await call(`/api/v1/notifications/${nid}/read`, { method: "PATCH", body: {} }));

  // ---- duplicate VIN / reg guard
  rec("POST /seller/vehicles (dup VIN)", await call("/api/v1/seller/vehicles", { method: "POST", body: { make: "Hyundai", model: "Creta", year: 2021, vin, regNo: "MH99ZZ9999" } }));
  rec("POST /seller/vehicles (dup reg)", await call("/api/v1/seller/vehicles", { method: "POST", body: { make: "Hyundai", model: "Creta", year: 2021, vin: "TD" + rnd(15), regNo: reg } }));
  rec("POST /seller/vehicles (bad reg)", await call("/api/v1/seller/vehicles", { method: "POST", body: { make: "X", model: "Y", year: 2020, vin: "TD" + rnd(15), regNo: "NOTAREG" } }));

  // ---- archive
  rec("POST /seller/vehicles/:id/archive", await call(`/api/v1/seller/vehicles/${vid}/archive`, { method: "POST", body: {} }));

  console.log("\n=== SELLER WRITE FLOWS ===");
  for (const r of rows) console.log(`${r.ok ? "PASS" : "FAIL"} ${String(r.status).padEnd(5)} ${r.name.padEnd(38)} ${r.detail}`);
  console.log("\nFAILED:", rows.filter((r) => !r.ok).length, "/", rows.length);
})();
