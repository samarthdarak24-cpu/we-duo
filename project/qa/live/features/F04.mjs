// F04 — Add-vehicle wizard: the whole six-step flow driven by real clicks and
// real file inputs, for one combustion two-wheeler and one electric car.
// This is the module that proves the publish gate is satisfied by genuine
// uploads rather than by API shortcuts.
export default async function run({ H, rec, page, ctx }) {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { identity, makeDocPdf, PHOTOS } = await import("../setup.mjs");

  await H.loginViaUI(page, "seller");

  // The stepper is advanced with its own "Continue" control. Its step chips
  // embed the ordinal in the accessible name ("3 Documents"), so the only
  // reliable proof of arrival is the control that only exists on that step.
  // Saving the draft already lands on the Photos step, hence the arrival-first
  // check before clicking anything.
  async function advanceTo(buttonText, label) {
    const arrival = () => page.getByRole("button", { name: buttonText }).first().isVisible().catch(() => false);
    if (await arrival()) return true;
    const nextBtn = page.getByRole("button", { name: /^Continue$/i }).first();
    if (await nextBtn.isVisible().catch(() => false)) await nextBtn.click().catch(() => {});
    await page.waitForTimeout(600);
    const reached = await arrival();
    rec.check("U", `${label}: wizard reached the ${label} step`, reached, `waiting for ${buttonText}`);
    return reached;
  }

  for (const catId of ["petrol_motorcycle", "electric_car"]) {
    const tag = catId === "electric_car" ? "EV" : "2W";
    const ident = identity(catId, catId === "electric_car" ? 40 : 41);

    await H.step(rec, "V", `${tag}: category and field rules`, async () => {
      await H.gotoSafe(page, `${H.BASE}/seller/add-vehicle`);
      await H.waitForHydration(page, "select");
      const sel = page.getByLabel(/Vehicle category/i).first();
      const options = await sel.locator("option").allTextContents();
      rec.check("V", `${tag}: the 6 implemented categories are offered`, options.length === 6, options.join(" / ").slice(0, 200));
      await sel.selectOption(catId);
      await page.waitForTimeout(800);

      const body = await page.locator("body").innerText();
      if (ident.twoWheeler) {
        rec.check("V", `${tag}: identifier label is chassis/frame, not a 17-char VIN rule`,
          /Chassis \/ frame number/i.test(body) && !/VIN \(17 characters\)/.test(body), body.match(/Chassis \/ frame number|VIN \(17 characters\)/g)?.join(" | ") ?? "no label");
      } else {
        rec.check("V", `${tag}: car identifier label is "VIN (17 characters)"`, /VIN \(17 characters\)/.test(body), "label present");
      }
      if (ident.electric) {
        const engCc = await page.getByLabel(/^Engine capacity \(CC\)/i).first().isVisible().catch(() => false);
        const engNo = await page.getByLabel(/^Engine number/i).first().isVisible().catch(() => false);
        const motor = await page.getByLabel(/Motor number/i).first().isVisible().catch(() => false);
        const soh = await page.getByLabel(/Battery State of Health/i).first().isVisible().catch(() => false);
        const cap = await page.getByLabel(/Battery capacity \(kWh\)/i).first().isVisible().catch(() => false);
        rec.check("V", `${tag}: EV wizard hides combustion fields`, !engCc && !engNo, `engineCc=${engCc} engineNo=${engNo}`);
        rec.check("V", `${tag}: EV wizard exposes motor + battery fields`, motor && soh && cap, `motor=${motor} soh=${soh} capacity=${cap}`);
        rec.check("V", `${tag}: EV odometer label is distance, not state of health`, /Total distance reading \(km\)|Odometer reading \(km\)/.test(body), "odometer label");
      } else {
        const engCc = await page.getByLabel(/^Engine capacity \(CC\)/i).first().isVisible().catch(() => false);
        const engNo = await page.getByLabel(/^Engine number/i).first().isVisible().catch(() => false);
        const soh = await page.getByLabel(/Battery State of Health/i).first().isVisible().catch(() => false);
        rec.check("V", `${tag}: combustion wizard exposes engine fields`, engCc && engNo, `engineCc=${engCc} engineNo=${engNo}`);
        rec.check("V", `${tag}: combustion wizard shows no battery SOH field`, !soh, "no battery field");
      }
      await H.shot(page, `F04-${catId}-fields`);
    });

    let vehicleId = null;
    let listingId = null;

    await H.step(rec, "C", `${tag}: step 1 basic info creates a real draft`, async () => {
      await page.getByLabel(/Registration number/i).first().fill(ident.regNo);
      await page.getByLabel(/Chassis \/ frame number|VIN \(17 characters\)/i).first().fill(ident.vin);
      await page.getByLabel(/Manufacturer/i).first().fill(ident.make);
      await page.getByLabel(/^Model/i).first().fill(ident.model);
      await page.getByLabel(/Manufacturing year/i).first().fill(String(ident.year));
      await page.getByLabel(/^Location/i).first().fill("Pune, Maharashtra");
      await page.getByLabel(/Asking price/i).first().fill(String(ident.price));
      await page.getByLabel(/reading \(km\)|distance reading/i).first().fill(String(ident.km));
      if (ident.electric) {
        await page.getByLabel(/Battery State of Health/i).first().fill(String(ident.soh));
        await page.getByLabel(/Battery capacity \(kWh\)/i).first().fill("35");
        await page.getByLabel(/Motor number/i).first().fill(ident.motorNumber).catch(() => {});
      } else {
        await page.getByLabel(/^Engine number/i).first().fill(ident.engineNumber).catch(() => {});
        await page.getByLabel(/^Engine capacity \(CC\)/i).first().fill("349").catch(() => {});
      }
      const trans = page.getByLabel(/Transmission/i).first();
      if (await trans.isVisible().catch(() => false)) await trans.selectOption({ index: 1 }).catch(() => {});

      const postPromise = page.waitForResponse(
        (r) => r.url().includes("/api/v1/seller/vehicles") && r.request().method() === "POST",
        { timeout: 90000 }
      ).catch(() => null);
      await page.getByRole("button", { name: /Save draft & continue/i }).click();
      const res = await postPromise;
      const json = res ? await res.json().catch(() => ({})) : {};
      vehicleId = json?.data?.id ?? null;
      listingId = json?.data?.listingId ?? null;
      rec.check("C", `${tag}: wizard POST /seller/vehicles returns 201`, res?.status() === 201, `HTTP ${res?.status()} ${JSON.stringify(json?.error ?? {})}`.slice(0, 200));
      rec.check("C", `${tag}: response carries a real vehicle id`, !!vehicleId, String(vehicleId));
      if (!vehicleId) return;
      const row = H.sqlOne("SELECT * FROM vehicles WHERE id = ?", vehicleId);
      rec.check("C", `${tag}: DB row matches the typed values`, row?.reg_no === ident.regNo && row?.vin === ident.vin && row?.vehicle_category_id === catId,
        `${row?.reg_no}/${row?.vin}/${row?.vehicle_category_id}`);
      rec.check("C", `${tag}: draft listing auto-created as status draft`, H.sqlOne("SELECT status FROM listings WHERE id = ?", listingId)?.status === "draft", String(listingId));
      if (ident.electric) {
        const specs = JSON.parse(H.sqlOne("SELECT specs FROM vehicle_specs WHERE vehicle_id = ?", vehicleId)?.specs ?? "{}");
        rec.check("C", `${tag}: battery SOH stored separately from odometer km`,
          Number(specs.battery_soh) === ident.soh && Number(row.km_claimed) === ident.km && Number(specs.battery_soh) !== Number(row.km_claimed),
          `soh=${specs.battery_soh} km=${row.km_claimed}`);
        rec.check("C", `${tag}: no engine_cc written for an EV`, specs.engine_cc === undefined, JSON.stringify(specs).slice(0, 180));
      }
      await H.shot(page, `F04-${catId}-draft`);
    });

    if (!vehicleId) {
      rec.check("C", `${tag}: wizard produced a vehicle to continue with`, false, "no vehicle id");
      continue;
    }

    await H.step(rec, "U", `${tag}: step 2 photos upload through the file input`, async () => {
      if (!(await advanceTo(/Upload photos/i, `${tag} step 2 (photos)`))) return;
      const input = page.getByLabel("Vehicle photos").first();
      await input.waitFor({ state: "attached", timeout: 30000 }).catch(() => {});
      const files = PHOTOS.slice(0, 3).map((p) => ({ name: path.basename(p), mimeType: "image/jpeg", buffer: fs.readFileSync(p) }));
      await input.setInputFiles(files);
      const upPromise = page.waitForResponse(
        (r) => r.url().includes(`/api/v1/vehicles/${vehicleId}/photos`) && r.request().method() === "POST",
        { timeout: 90000 }
      ).catch(() => null);
      await page.getByRole("button", { name: /Upload photos/i }).first().click();
      const res = await upPromise;
      rec.check("U", `${tag}: 3 photos uploaded from the wizard`, res?.status() === 201, `HTTP ${res?.status()}`);
      const listing = H.sqlOne("SELECT id FROM listings WHERE vehicle_id = ?", vehicleId).id;
      const rows = H.sqlOne("SELECT COUNT(*) AS n FROM listing_images WHERE listing_id = ?", listing).n;
      rec.check("U", `${tag}: listing_images rows persisted`, rows === 3, `rows=${rows}`);
      rec.check("U", `${tag}: cover image set from a real upload`, !!H.sqlOne("SELECT cover_image FROM listings WHERE id = ?", listing).cover_image, "cover_image");
      await H.shot(page, `F04-${catId}-photos`);
    });

    await H.step(rec, "C", `${tag}: step 3 document upload reaches OCR and verifies`, async () => {
      if (!(await advanceTo(/Upload document/i, `${tag} step 3 (documents)`))) return;
      await page.getByLabel(/Document type/i).first().selectOption(ident.twoWheeler ? "rc_2w" : "rc").catch(() => {});
      const pdf = makeDocPdf(ident, "rc");
      await page.getByLabel(/File \(PDF or image/i).first()
        .setInputFiles({ name: path.basename(pdf), mimeType: "application/pdf", buffer: fs.readFileSync(pdf) });
      const consent = page.getByLabel(/Share this document with buyers/i).first();
      if (await consent.isVisible().catch(() => false)) await consent.check().catch(() => {});
      const docPromise = page.waitForResponse(
        (r) => r.url().includes(`/api/v1/vehicles/${vehicleId}/documents`) && r.request().method() === "POST",
        { timeout: 150000 }
      ).catch(() => null);
      await page.getByRole("button", { name: /Upload document/i }).first().click();
      const res = await docPromise;
      const json = res ? await res.json().catch(() => ({})) : {};
      const ocr = json?.data?.ocr ?? {};
      rec.check("C", `${tag}: RC document uploaded`, res?.status() === 201, `HTTP ${res?.status()} ${JSON.stringify(json?.error ?? {})}`.slice(0, 200));
      rec.check("C", `${tag}: real extraction engine reported for the RC`, ["processed"].includes(ocr.status) && !!ocr.engine, `${ocr.engine} / ${ocr.method} / ${ocr.status}`);
      rec.check("C", `${tag}: RC auto-verified from extracted fields`, ocr.documentStatus === "verified", `status=${ocr.documentStatus} confidence=${ocr.confidence}`);
      const doc = H.sqlOne("SELECT type, status, sha256 FROM documents WHERE vehicle_id = ? ORDER BY uploaded_at DESC LIMIT 1", vehicleId);
      rec.check("C", `${tag}: verified RC row + hash persisted`, doc?.status === "verified" && /^[0-9a-f]{64}$/.test(String(doc?.sha256)), `${doc?.type}/${doc?.status}`);
      const extractionCount = H.sqlOne("SELECT COUNT(*) AS n FROM document_extractions WHERE vehicle_id = ?", vehicleId).n;
      rec.check("C", `${tag}: field-level extraction rows stored`, extractionCount > 0, `${extractionCount} rows`);
      await H.shot(page, `F04-${catId}-documents`);
    });

    await H.step(rec, "C", `${tag}: step 4 history + step 5 verification`, async () => {
      if (!(await advanceTo(/Add current reading as history/i, `${tag} step 4 (history)`))) return;
      const hp = page.waitForResponse((r) => r.url().includes(`/api/v1/vehicles/${vehicleId}/history`) && r.request().method() === "POST", { timeout: 60000 }).catch(() => null);
      await page.getByRole("button", { name: /Add current reading as history/i }).first().click();
      const hr = await hp;
      rec.check("C", `${tag}: history event created from the wizard`, hr?.status() === 201, `HTTP ${hr?.status()}`);
      rec.check("C", `${tag}: history_events row persisted`, H.sqlOne("SELECT COUNT(*) AS n FROM history_events WHERE vehicle_id = ?", vehicleId).n > 0, "history_events");

      if (!(await advanceTo(/Run verification/i, `${tag} step 5 (verification)`))) return;
      const vp = page.waitForResponse((r) => r.url().includes(`/api/v1/vehicles/${vehicleId}/verify`) && r.request().method() === "POST", { timeout: 120000 }).catch(() => null);
      await page.getByRole("button", { name: /Run verification/i }).first().click();
      const vr = await vp;
      const vj = vr ? await vr.json().catch(() => ({})) : {};
      const checks = vj?.data?.checks ?? [];
      rec.check("C", `${tag}: verification run returns real checks`, vr?.status() === 200 && checks.length >= 6, `HTTP ${vr?.status()} checks=${checks.length}`);
      const puc = checks.find((c) => c.key === "puc");
      if (ident.electric) rec.check("C", `${tag}: EV PUC check is not_applicable, never a pass`, puc && /not_applicable/.test(JSON.stringify(puc)), JSON.stringify(puc ?? {}).slice(0, 160));
      await H.shot(page, `F04-${catId}-verification`);
    });

    await H.step(rec, "U", `${tag}: step 6 publishes only once the gate is genuinely met`, async () => {
      if (!(await advanceTo(/Check publish readiness/i, `${tag} step 6 (review & publish)`))) return;
      await page.getByRole("button", { name: /Check publish readiness/i }).first().click();
      await page.waitForTimeout(3000);
      const body = await page.locator("body").innerText();
      rec.check("U", `${tag}: readiness panel rendered`, /Blockers \(\d+\)|Warnings \(\d+\)|ready to publish/i.test(body), body.slice(-260).replace(/\n/g, " | "));
      const pub = page.getByRole("button", { name: /^Publish listing$/i }).first();
      await pub.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
      const pp = page.waitForResponse((r) => r.url().includes("/publish") && r.request().method() === "POST", { timeout: 120000 }).catch(() => null);
      await pub.click().catch(() => {});
      const pres = await pp;
      const pjson = pres ? await pres.json().catch(() => ({})) : {};
      rec.check("U", `${tag}: publish succeeds from the wizard`, pres?.status() === 200, `HTTP ${pres?.status()} ${JSON.stringify(pjson?.error?.details ?? pjson?.error ?? {})}`.slice(0, 260));
      rec.check("U", `${tag}: listings.status published in SQLite`, H.sqlOne("SELECT status FROM listings WHERE id = ?", listingId)?.status === "published", String(listingId));
      await H.shot(page, `F04-${catId}-published`);
      await H.gotoSafe(page, `${H.BASE}/seller/vehicles/${vehicleId}`);
      // A cold `next dev` compile can serve the shell first, so wait for the
      // identifier itself rather than reading the page too early.
      const rendered = await page.getByText(ident.regNo, { exact: false }).first()
        .waitFor({ state: "visible", timeout: 90000 }).then(() => true).catch(() => false);
      const after = await page.locator("body").innerText();
      rec.check("U", `${tag}: state survives a reload of the vehicle page`,
        rendered && after.includes(ident.regNo) && after.includes(new Intl.NumberFormat("en-IN").format(ident.km)),
        `url=${new URL(page.url()).pathname} rendered=${rendered} :: ${after.slice(0, 200).replace(/\n/g, " | ")}`);
      // This page shows the trust band, not a listing badge, so the published
      // status is verified where the app actually renders it.
      await H.gotoSafe(page, `${H.BASE}/seller/vehicles`);
      const listRow = page.locator("tbody tr").filter({ hasText: ident.regNo }).first();
      const listVisible = await listRow.waitFor({ state: "visible", timeout: 90000 }).then(() => true).catch(() => false);
      const rowText = listVisible ? await listRow.innerText().catch(() => "") : "";
      rec.check("U", `${tag}: My Vehicles list shows the row as Published`, listVisible && /Published/i.test(rowText),
        rowText.replace(/\n/g, " | ").slice(0, 220));
    });

    rec.note(`${tag} wizard vehicle ${vehicleId} reg ${ident.regNo}`);
  }
}
