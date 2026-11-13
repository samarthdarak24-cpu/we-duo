// ---------------------------------------------------------------------------
// OCR negative-path proof: invalid type, corrupt PDF, low-quality image and a
// duplicate re-upload. Each check asserts the REAL HTTP status, the stored
// document state and that a failed read is never reported as "verified".
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
} from "../live/harness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, "shots-six");
const RUN = Date.now().toString(36).toUpperCase();
const results = [];

function check(label, ok, detail = "") {
  results.push({ label, ok: !!ok, detail: String(detail).slice(0, 500) });
  console.log(`  ${ok ? "PASS" : "FAIL"} ${label}${detail ? ` :: ${String(detail).slice(0, 220)}` : ""}`);
}

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page, "#login-email");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill("demo123456");
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/seller/, { timeout: 30000 }).catch(() => {});
}

async function upload(page, vehicleId, type, name, mime, bytes) {
  return page.evaluate(
    async ({ vehicleId, type, name, mime, b64 }) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
      const fd = new FormData();
      fd.append("type", type);
      fd.append("file", new File([arr], name, { type: mime }));
      const res = await fetch(`/api/v1/vehicles/${vehicleId}/documents`, {
        method: "POST",
        body: fd,
        credentials: "same-origin",
      });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* keep null */ }
      return { status: res.status, json, text: text.slice(0, 1200) };
    },
    { vehicleId, type, name, mime, b64: bytes.toString("base64") }
  );
}

async function makeRc(context, { regNo, vin, file }) {
  const p = await context.newPage();
  await p.setViewportSize({ width: 1100, height: 760 });
  await p.setContent(`<!doctype html><html><body style="margin:0;background:#eee">
    <div style="width:1000px;margin:40px auto;background:#fff;border:3px solid #111;padding:44px 54px;font-family:Arial">
      <div style="text-align:center;font-size:30px;font-weight:700">GOVERNMENT OF MAHARASHTRA</div>
      <div style="text-align:center;font-size:26px;font-weight:700;margin-top:6px">REGISTRATION CERTIFICATE</div>
      <table style="font-size:30px;line-height:1.72;border-spacing:0 4px;margin-top:24px">
        <tr><td style="width:420px">Registration Number</td><td style="font-weight:700">${regNo}</td></tr>
        <tr><td>Chassis Number (VIN)</td><td style="font-weight:700">${vin}</td></tr>
        <tr><td>Owner Name</td><td>OCR Negative Test</td></tr>
        <tr><td>Vehicle Model</td><td>Honda City</td></tr>
        <tr><td>Odometer</td><td>45000 km</td></tr>
      </table>
    </div></body></html>`);
  await p.waitForTimeout(300);
  const buf = await p.screenshot({ type: "png" });
  fs.writeFileSync(file, buf);
  await p.close();
  return buf;
}

const ctx = await newContext();
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 160)); });
await login(page, "samarth@trustdrive.dev");

const regNo = `MH14NV${String(1000 + Math.floor(Math.random() * 9000))}`;
const vin = `MAT${String(Date.now()).slice(-10)}NVTX`;
const created = await api(page, "POST", "/api/v1/vehicles", {
  regNo, vin, make: "Honda", model: "City", variant: "VX", year: 2021,
  fuel: "Petrol", transmission: "Automatic", color: "White",
  category: "Sedan", askingPrice: 700000, mileage: 45000,
  location: "Pune, Maharashtra", description: `OCR negative proof ${RUN}`,
});
const vehicleId = created.json?.data?.id;
if (!vehicleId) throw new Error(`vehicle create failed: ${created.status} ${created.text}`);
console.log(`vehicle ${vehicleId} (${regNo})`);

// 1. Unsupported file type -------------------------------------------------
{
  const before = sql("SELECT id FROM documents WHERE vehicle_id = ?", vehicleId).length;
  const res = await upload(page, vehicleId, "rc", "notes.txt", "text/plain", Buffer.from("this is not a document"));
  const after = sql("SELECT id FROM documents WHERE vehicle_id = ?", vehicleId).length;
  check("unsupported text file rejected with 415", res.status === 415, `HTTP ${res.status} ${res.text.slice(0, 120)}`);
  check("no document row was created for the rejected file", before === after, `${before} → ${after}`);
}

// 2. Corrupt PDF that passes magic-byte sniffing ---------------------------
{
  const res = await upload(page, vehicleId, "insurance", "corrupt.pdf", "application/pdf", Buffer.from("%PDF-1.4\nthis is not a real pdf body"));
  const docId = res.json?.data?.id;
  const row = docId ? sqlOne("SELECT * FROM documents WHERE id = ?", docId) : null;
  const ocr = res.json?.data?.ocr;
  check("corrupt PDF is accepted as a file but not verified", res.status === 201 && row?.status !== "verified", `HTTP ${res.status} status=${row?.status} ocr=${JSON.stringify(ocr)}`);
  check("corrupt PDF carries an honest failure reason", !!row?.status_reason, String(row?.status_reason));
}

// 3. Low-quality / unreadable image ----------------------------------------
{
  // 2x2 white PNG: valid image bytes, zero readable text.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHgQCAZ7r6sAAAAAASUVORK5CYII=",
    "base64"
  );
  const res = await upload(page, vehicleId, "service", "blank.png", "image/png", png);
  const docId = res.json?.data?.id;
  const row = docId ? sqlOne("SELECT * FROM documents WHERE id = ?", docId) : null;
  const ocr = res.json?.data?.ocr;
  check("unreadable image is not reported as verified", res.status === 201 && row?.status !== "verified", `HTTP ${res.status} status=${row?.status} ocr=${JSON.stringify(ocr)}`);
  check("unreadable image has a real failure/low-confidence state", ["unavailable", "processed"].includes(ocr?.status) && (row?.status === "pending" || row?.status === "needs_correction"), `doc=${row?.status} ocr=${ocr?.status} reason=${row?.status_reason}`);
}

// 4. Duplicate RC re-upload ------------------------------------------------
{
  const file = path.join(SHOTS, `rc-neg-${RUN}.png`);
  const bytes = await makeRc(page.context(), { regNo, vin, file });
  const first = await upload(page, vehicleId, "rc", "rc-neg.png", "image/png", bytes);
  const firstId = first.json?.data?.id;
  const firstRow = firstId ? sqlOne("SELECT * FROM documents WHERE id = ?", firstId) : null;
  check("clean RC extracted and verified", first.status === 201 && firstRow?.status === "verified", `HTTP ${first.status} ${firstRow?.status} ${first.json?.data?.ocr?.engine}`);

  const second = await upload(page, vehicleId, "rc", "rc-neg-copy.png", "image/png", bytes);
  const secondId = second.json?.data?.id;
  const secondRow = secondId ? sqlOne("SELECT * FROM documents WHERE id = ?", secondId) : null;
  let extracted = {};
  try { extracted = JSON.parse(secondRow?.extracted || "{}"); } catch { /* keep */ }
  check("duplicate re-upload is flagged, not verified again", second.status === 201 && secondRow?.status === "needs_correction", `HTTP ${second.status} status=${secondRow?.status}`);
  check("duplicate points at the original document", secondId !== firstId && !!extracted?.duplicate_of, `duplicate_of=${extracted?.duplicate_of} flags=${JSON.stringify(extracted?.flags)}`);

  await page.goto(`${BASE}/seller/documents?vehicle=${vehicleId}`, { waitUntil: "domcontentloaded" });
  await page.getByText("Document library").waitFor({ timeout: 60000 });
  await waitForHydration(page, "select.td-select");
  const body = await page.locator("body").innerText();
  check("UI shows the duplicate/correction state", /duplicate|needs correction|review/i.test(body), body.match(/duplicate[^\n]*/i)?.[0] ?? "checked document library text");
  await page.screenshot({ path: path.join(SHOTS, "ocr-negative.png"), fullPage: false });
}

fs.writeFileSync(path.join(__dirname, "ocr_negative_results.json"), JSON.stringify({ run: RUN, vehicleId, regNo, results }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n=== OCR negative paths: ${failed === 0 ? "PASS" : "FAIL"} (${results.length - failed}/${results.length}) ===`);
await closeAll();
if (failed) process.exitCode = 1;
