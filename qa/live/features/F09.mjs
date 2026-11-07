// F09 — 3D inspection viewer + damage records.
// Rule under test: a hotspot is a database row made visible, never decoration.
export default async function run({ H, rec, page }) {
  const { publishedVehicle, errText } = await import("../setup.mjs");

  await H.loginViaUI(page, "seller");
  const setup = await publishedVehicle(page, "passenger_car", 11);
  if (!setup.vehicleId) {
    rec.check("R", "prerequisite published car exists", false, setup.blocked ?? errText(setup.create));
    return;
  }
  const id = setup.vehicleId;
  const description = `Live audit dent ${H.uid("DMG")} on the front bumper`;

  let damageId = null;
  await H.step(rec, "C", "damage record created from the seller viewer page", async () => {
    await H.gotoSafe(page, `${H.BASE}/seller/vehicles/${id}`);
    await page.getByText(/Vehicle 3D Inspection Studio|Record damage/i).first().waitFor({ timeout: 90000 }).catch(() => {});
    const addBtn = page.getByRole("button", { name: /^Add damage$/i }).first();
    rec.check("C", "damage editor opens from the vehicle page", await addBtn.isVisible().catch(() => false), "Add damage button");
    await addBtn.click().catch(() => {});
    await page.waitForTimeout(700);

    const ta = page.locator('textarea[placeholder="What was observed, and where?"]');
    await ta.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    const form = ta.locator("xpath=ancestor::div[.//select][1]");
    const selects = (await form.locator("select").count()) >= 3 ? form.locator("select") : page.locator("select");
    await selects.nth(0).selectOption("front_bumper").catch(async () => { await selects.nth(0).selectOption({ index: 1 }); });
    await selects.nth(1).selectOption("Moderate").catch(() => {});
    await selects.nth(2).selectOption("Repaired").catch(() => {});
    await ta.fill(description);

    const promise = page.waitForResponse((r) => r.url().includes(`/api/v1/vehicles/${id}/damage`) && r.request().method() === "POST", { timeout: 90000 }).catch(() => null);
    await page.getByRole("button", { name: /Save damage/i }).first().click();
    const res = await promise;
    const json = res ? await res.json().catch(() => ({})) : {};
    damageId = json?.data?.id ?? null;
    rec.check("C", "POST /damage returns 201 with a row id", res?.status() === 201 && !!damageId, `HTTP ${res?.status()} id=${damageId} ${JSON.stringify(json?.error ?? {}).slice(0, 120)}`);
    const row = H.sqlOne("SELECT zone_id, component_id, severity, repair_status, status, description, created_by FROM damage_records WHERE id = ?", damageId);
    rec.check("C", "damage_records row matches the form exactly",
      row?.zone_id === "front_bumper" && row?.severity === "Moderate" && row?.repair_status === "Repaired" && row?.description === description,
      JSON.stringify(row).slice(0, 240));
    rec.check("C", "new damage starts pending verification, not silently verified", row?.status === "pending", String(row?.status));
    rec.check("C", "created_by is the logged-in seller", row?.created_by === H.sqlOne("SELECT id FROM users WHERE email = ?", H.ACCOUNTS.seller.email).id, String(row?.created_by));
  });

  await H.step(rec, "V", "short descriptions are rejected server-side", async () => {
    const bad = await H.api(page, "POST", `/api/v1/vehicles/${id}/damage`, { zoneId: "roof", description: "dent", severity: "Minor", repairStatus: "Not repaired" });
    rec.check("V", "too-short description rejected with 400", bad.status === 400, errText(bad));
    const zone = await H.api(page, "POST", `/api/v1/vehicles/${id}/damage`, { zoneId: "not_a_real_zone", description: "A fabricated zone identifier", severity: "Minor", repairStatus: "Not repaired" });
    rec.check("V", "unknown zone rejected with 400 INVALID_COMPONENT", zone.status === 400 && zone.json?.error?.code === "INVALID_COMPONENT", errText(zone));
  });

  await H.step(rec, "R", "the hotspot on the 3D model is the DB row", async () => {
    const api = await H.api(page, "GET", `/api/v1/vehicles/${id}/damage`);
    const hotspots = api.json?.data?.hotspots ?? [];
    const records = api.json?.data?.records ?? [];
    rec.check("R", "GET /damage returns both records and hotspot geometry", api.status === 200 && records.length > 0 && hotspots.length > 0, `records=${records.length} hotspots=${hotspots.length}`);
    rec.check("R", "a hotspot exists only for a damaged panel", hotspots.every((h) => (h.damage?.length ?? 0) > 0 || h.count > 0), JSON.stringify(hotspots[0] ?? {}).slice(0, 200));

    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    const hotspot = page.locator('button[aria-label*="damage records"]').first();
    const visible = await hotspot.waitFor({ state: "visible", timeout: 90000 }).then(() => true).catch(() => false);
    rec.check("R", "viewer renders a DOM hotspot button for the stored damage", visible, visible ? await hotspot.getAttribute("aria-label") : "no hotspot button (WebGL or asset unavailable)");
    if (visible) {
      const label = await hotspot.getAttribute("aria-label");
      rec.check("R", "the hotspot label states its damage-record count", /\(\d+ damage records\)/.test(String(label)), String(label));
      await hotspot.click().catch(() => {});
      await page.waitForTimeout(1500);
      const body = await page.locator("body").innerText();
      rec.check("R", "inspector drawer lists the DB record, not a generic note",
        /Database Damage Records/.test(body) && body.includes(description.slice(0, 30)), body.slice(-400).replace(/\n/g, " | "));
      rec.check("R", "severity and repair status come from the row", /Moderate/i.test(body) && /Repaired/i.test(body), "inspector fields");
      await H.shot(page, "F09-inspector");
    }
    const defects = page.getByText(/Recorded Defects/i).first();
    if (await defects.isVisible().catch(() => false)) {
      const text = await defects.innerText();
      rec.check("R", "Recorded Defects bar counts the DB rows", /\(\d+\)/.test(text) && Number(text.match(/\((\d+)\)/)[1]) >= records.length, text);
    } else rec.note("Recorded Defects shortcut bar not visible in this viewport");
  });

  await H.step(rec, "U", "corrections create a superseding record, never overwrite", async () => {
    if (!damageId) return rec.note("no damage id");
    const btn = page.getByRole("button", { name: /Request correction/i }).first();
    await btn.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    await btn.click().catch(() => {});
    await page.waitForTimeout(600);
    const correctionText = "Dent depth measured at 4 mm during the panel shop inspection; severity corrected to Major.";
    const ta = page.locator('textarea').last();
    await ta.fill(correctionText);
    const statusSel = page.locator("select").filter({ has: page.locator('option[value="Pending repair"]') }).last();
    await statusSel.selectOption("Pending repair").catch(() => {});
    const promise = page.waitForResponse((r) => r.url().includes(`/api/v1/damage/${damageId}/correction`) && r.request().method() === "POST", { timeout: 90000 }).catch(() => null);
    await page.getByRole("button", { name: /File correction/i }).first().click();
    const res = await promise;
    const json = res ? await res.json().catch(() => ({})) : {};
    const newId = json?.data?.id;
    rec.check("U", "correction POST returns 201", res?.status() === 201 && !!newId, `HTTP ${res?.status()} id=${newId} ${JSON.stringify(json?.error ?? {}).slice(0, 140)}`);
    const orig = H.sqlOne("SELECT description, severity FROM damage_records WHERE id = ?", damageId);
    rec.check("U", "the original record is untouched (immutability)", orig?.description === description, JSON.stringify(orig).slice(0, 180));
    const next = H.sqlOne("SELECT supersedes_id, status, description FROM damage_records WHERE id = ?", newId);
    rec.check("U", "the new row points at the record it supersedes", next?.supersedes_id === damageId, `${next?.supersedes_id} / ${next?.status}`);
    await H.shot(page, "F09-correction");
  });

  await H.step(rec, "V", "no car model is ever shown for a two-wheeler", async () => {
    const twoWheeler = await publishedVehicle(page, "electric_scooter", 12);
    if (!twoWheeler.vehicleId) return rec.note(`2W prerequisite failed: ${twoWheeler.blocked}`);
    const g = await H.api(page, "GET", `/api/v1/vehicles/${twoWheeler.vehicleId}/3d-model`);
    const data = g.json?.data ?? {};
    rec.check("V", "2W 3D asset reported unavailable", data.assetStatus === "unavailable" && !data.assetUrl, `status=${data.assetStatus} url=${data.assetUrl}`);
    rec.check("V", "2W viewer scope labelled schematic and interactions disabled",
      data.assetScope === "labelled-schematic" && data.interactionsAvailable === false, `${data.assetScope} / ${data.interactionsAvailable}`);
    await H.gotoSafe(page, `${H.BASE}/vehicle/${twoWheeler.vehicleId}`);
    await page.waitForTimeout(3500);
    const body = await page.locator("body").innerText();
    rec.check("V", "public 2W page never mentions the sedan/car GLB", !/sedan\.glb|car\.glb|trustdrive-sedan/i.test(body), "rendered text checked");
    const car = await H.api(page, "GET", `/api/v1/vehicles/${id}/3d-model`);
    rec.check("V", "the car keeps its real GLB asset", car.json?.data?.assetStatus === "available" && !!car.json?.data?.assetUrl, JSON.stringify(car.json?.data ?? {}).slice(0, 160));
    const asset = await page.context().request.get(`${H.BASE}${car.json?.data?.assetUrl ?? ""}`).catch(() => null);
    rec.check("V", "the referenced GLB is a real binary asset, not a placeholder", asset?.status() === 200 && (asset.headers()["content-length"] ? Number(asset.headers()["content-length"]) > 100000 : true),
      `HTTP ${asset?.status()} bytes=${asset?.headers()["content-length"]}`);
  });
}
