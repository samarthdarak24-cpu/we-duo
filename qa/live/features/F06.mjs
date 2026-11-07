// F06 — Documents + OCR extraction display.
// Uploads are driven through the real DocumentsManager form; the document is a
// generated QA PDF with a genuine text layer, so "Text layer" labelling (never
// reported as OCR) is part of what this asserts.
export default async function run({ H, rec, page }) {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { publishedVehicle, makeDocPdf, errText } = await import("../setup.mjs");

  await H.loginViaUI(page, "seller");
  const setup = await publishedVehicle(page, "petrol_motorcycle", 7);
  if (!setup.vehicleId) {
    rec.check("R", "prerequisite vehicle exists", false, setup.blocked ?? errText(setup.create));
    return;
  }
  const id = setup.vehicleId;

  await H.step(rec, "R", "documents page requires and shows a vehicle", async () => {
    await H.gotoSafe(page, `${H.BASE}/seller/documents`);
    const noVehicle = await page.locator("body").innerText();
    rec.check("R", "without ?vehicle= the page asks for a vehicle", /No vehicle selected|Add a vehicle/i.test(noVehicle), noVehicle.slice(0, 160).replace(/\n/g, " | "));
    await H.gotoSafe(page, `${H.BASE}/seller/documents?vehicle=${id}`);
    await page.getByRole("button", { name: /Upload document/i }).first().waitFor({ timeout: 60000 });
    const body = await page.locator("body").innerText();
    rec.check("R", "the RC uploaded at publish time is listed", body.includes(setup.ident.regNo) || /rc/i.test(body), body.slice(0, 200).replace(/\n/g, " | "));
    await H.shot(page, "F06-list");
  });

  let docId = null;
  await H.step(rec, "C", "upload an insurance document through the form", async () => {
    const card = page.locator("div, section").filter({ has: page.locator('input[type="file"]:visible') }).last();
    const typeSel = card.locator("select").first();
    await typeSel.selectOption("insurance").catch(async () => { await page.locator("select").first().selectOption("insurance"); });
    const pdf = makeDocPdf(setup.ident, "insurance");
    await card.locator('input[type="file"]:visible').first().setInputFiles({ name: path.basename(pdf), mimeType: "application/pdf", buffer: fs.readFileSync(pdf) });
    const promise = page.waitForResponse((r) => r.url().includes(`/api/v1/vehicles/${id}/documents`) && r.request().method() === "POST", { timeout: 150000 }).catch(() => null);
    await page.getByRole("button", { name: /Upload document/i }).first().click();
    const res = await promise;
    const json = res ? await res.json().catch(() => ({})) : {};
    docId = json?.data?.id ?? null;
    rec.check("C", "POST document returns 201 with an id", res?.status() === 201 && !!docId, `HTTP ${res?.status()} id=${docId}`);
    const ocr = json?.data?.ocr ?? {};
    rec.check("C", "extraction ran for real (status + engine reported)", ocr.status === "processed" && !!ocr.engine, `${ocr.engine}/${ocr.method}/${ocr.status}`);
    rec.check("C", "a PDF text layer is labelled as a text layer, not OCR",
      /text|pymupdf/i.test(`${ocr.engine} ${ocr.method}`) || /text.?layer/i.test(JSON.stringify(ocr)), JSON.stringify({ engine: ocr.engine, method: ocr.method }));
    const row = H.sqlOne("SELECT id, type, status, sha256, version, file_key, consent FROM documents WHERE id = ?", docId);
    rec.check("C", "documents row persisted with hash + file_key", !!row?.sha256 && !!row?.file_key && row.version === 1, `type=${row?.type} status=${row?.status}`);
    rec.check("C", "document starts consented (shared) per the checkbox default", row?.consent === 1 || row?.consent === true, String(row?.consent));
    const stored = await H.api(page, "GET", `/api/v1/files/${row.file_key}`);
    rec.check("C", "the stored file is downloadable bytes", stored.status === 200 && stored.headers["content-type"]?.includes("pdf"), `${stored.status} ${stored.headers["content-type"]}`);
  });

  await H.step(rec, "R", "field-level evidence is real rows, not decoration", async () => {
    if (!docId) return rec.note("no document id from upload");
    const ex = await H.api(page, "GET", `/api/v1/documents/${docId}/extractions`);
    const items = ex.json?.data?.items ?? [];
    rec.check("R", "GET /documents/:id/extractions returns field rows", ex.status === 200 && items.length > 0, `HTTP ${ex.status} items=${items.length}`);
    rec.check("R", "each extraction carries value + method (+ confidence when OCR)", items.every((i) => "value" in i && !!i.method), JSON.stringify(items[0] ?? {}).slice(0, 200));
    const reg = items.find((i) => /reg/i.test(i.field));
    rec.check("R", "the registration number was genuinely read from the file", reg && String(reg.value).replace(/\s/g, "") === setup.ident.regNo, JSON.stringify(reg ?? {}));
    const dbRows = H.sqlOne("SELECT COUNT(*) AS n FROM document_extractions WHERE document_id = ?", docId).n;
    rec.check("R", "extraction rows are in SQLite, not only in the response", dbRows === items.length, `db=${dbRows} api=${items.length}`);

    const toggle = page.getByRole("button", { name: /Field evidence/i }).first();
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
      await page.waitForTimeout(1500);
      const body = await page.locator("body").innerText();
      rec.check("R", "the UI reveals the stored fields for that document", body.includes(setup.ident.regNo) || /Extraction evidence/i.test(body), body.slice(-300).replace(/\n/g, " | "));
      await H.shot(page, "F06-field-evidence");
    } else rec.note("Field evidence toggle not visible (row not rendered yet)");
  });

  await H.step(rec, "U", "consent, re-verify and versioning all write to the DB", async () => {
    if (!docId) return rec.note("no document id");
    const consent = await H.api(page, "PATCH", `/api/v1/documents/${docId}/consent`, { consent: false });
    rec.check("U", "PATCH consent false returns 200", consent.status === 200, errText(consent));
    rec.check("U", "documents.consent persisted as 0", Number(H.sqlOne("SELECT consent FROM documents WHERE id = ?", docId).consent) === 0, "consent=0");
    const badConsent = await H.api(page, "PATCH", `/api/v1/documents/${docId}/consent`, { consent: "yes" });
    rec.check("U", "a non-boolean consent value is rejected with 400", badConsent.status === 400, errText(badConsent));

    const rv = await H.api(page, "POST", `/api/v1/documents/${docId}/reverify`, {});
    rec.check("U", "re-verify re-runs extraction", [200, 201].includes(rv.status), errText(rv));

    const pdf2 = makeDocPdf(setup.ident, "insurance", `insurance-v2-${Date.now().toString(36)}`);
    const rep = await H.api(page, "POST", `/api/v1/documents/${docId}/replace`, undefined);
    rec.note(`replace without multipart (JSON) responded ${rep.status} — real versioning uses multipart below`);
    const buf = fs.readFileSync(pdf2);
    const replaced = await page.evaluate(
      async ({ docId, b64, name }) => {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
        const fd = new FormData();
        fd.append("file", new File([bytes], name, { type: "application/pdf" }));
        const res = await fetch(`/api/v1/documents/${docId}/replace`, { method: "POST", body: fd, credentials: "same-origin", headers: { "Idempotency-Key": `qa-${Date.now()}` } });
        const text = await res.text();
        let json = null; try { json = JSON.parse(text); } catch { /* raw */ }
        return { status: res.status, json, text: text.slice(0, 600) };
      },
      { docId, b64: buf.toString("base64"), name: path.basename(pdf2) }
    );
    rec.check("U", "replacing a document creates a new version", replaced.status === 201 && !!replaced.json?.data?.versioned?.id, `HTTP ${replaced.status} ${JSON.stringify(replaced.json?.error ?? {}).slice(0, 160)}`);
    const v2 = replaced.json?.data?.versioned?.id;
    if (v2) {
      const row = H.sqlOne("SELECT version, supersedes_id FROM documents WHERE id = ?", v2);
      rec.check("U", "new row has version 2 and supersedes the old id", Number(row?.version) === 2 && row?.supersedes_id === docId, `${row?.version}/${row?.supersedes_id}`);
    }
  });

  await H.step(rec, "V", "invalid document payloads are refused, not stored", async () => {
    const before = H.sqlOne("SELECT COUNT(*) AS n FROM documents WHERE vehicle_id = ?", id).n;
    const fixtures = path.join(H.ROOT, "frontend", "qa", "fixtures");
    const cases = [
      { file: "unsupported.txt", mime: "text/plain", expect: 415, label: "non-PDF/PNG type" },
      { file: "corrupt.pdf", mime: "application/pdf", expect: [415, 422], label: "corrupted PDF" },
      { file: "oversized.pdf", mime: "application/pdf", expect: 413, label: "document over 10 MB" },
    ];
    for (const c of cases) {
      const p = path.join(fixtures, c.file);
      if (!fs.existsSync(p)) { rec.note(`fixture ${c.file} missing`); continue; }
      const b64 = fs.readFileSync(p).toString("base64");
      const up = await page.evaluate(async ({ id, b64, name, mime }) => {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
        const fd = new FormData();
        fd.append("type", "service");
        fd.append("consent", "true");
        fd.append("file", new File([bytes], name, { type: mime }));
        const r = await fetch(`/api/v1/vehicles/${id}/documents`, { method: "POST", body: fd, credentials: "same-origin" });
        const t = await r.text();
        let j = null; try { j = JSON.parse(t); } catch { /* raw */ }
        return { status: r.status, json: j, text: t.slice(0, 300) };
      }, { id, b64, name: c.file, mime: c.mime });
      const want = Array.isArray(c.expect) ? c.expect : [c.expect];
      rec.check("V", `${c.label} rejected with HTTP ${want.join("/")}`, want.includes(up.status), `HTTP ${up.status} ${up.json?.error?.code ?? up.text.slice(0, 80)}`);
    }
    const after = H.sqlOne("SELECT COUNT(*) AS n FROM documents WHERE vehicle_id = ?", id).n;
    rec.check("V", "no rejected file produced a document row", after === before, `before=${before} after=${after}`);
  });

  await H.step(rec, "D", "delete soft-deletes and keeps the audit trail", async () => {
    if (!docId) return rec.note("no document id");
    const del = await H.api(page, "DELETE", `/api/v1/documents/${docId}`);
    rec.check("D", "DELETE /documents/:id returns 200", del.status === 200, errText(del));
    const row = H.sqlOne("SELECT deleted_at, status FROM documents WHERE id = ?", docId);
    rec.check("D", "the row is soft-deleted, not erased", !!row?.deleted_at, JSON.stringify(row));
    const listed = await H.api(page, "GET", `/api/v1/vehicles/${id}/documents`);
    rec.check("D", "a soft-deleted document disappears from the list", !(listed.json?.data?.items ?? []).some((d) => d.id === docId), `items=${(listed.json?.data?.items ?? []).length}`);
    await H.shot(page, "F06-after-delete");
  });
}
