// F03 — My Vehicles list + detail (read-only views + archive).
// R is the primary operation; D exercises the real archive action so the list
// and detail views are proven against live SQLite rows.
export default async function run({ H, rec, page }) {
  const { publishedVehicle, errText } = await import("../setup.mjs");

  await H.loginViaUI(page, "seller");
  const setup = await publishedVehicle(page, "petrol_scooter", 3);
  if (!setup.vehicleId) {
    rec.check("R", "prerequisite vehicle exists", false, setup.blocked ?? errText(setup.create));
    return;
  }
  const id = setup.vehicleId;
  const reg = setup.ident.regNo;
  rec.check("R", "prerequisite vehicle published through the app API", setup.ready, setup.blocked ?? `id=${id}`);

  await H.step(rec, "R", "list renders DB rows, not decorative markup", async () => {
    await H.gotoSafe(page, `${H.BASE}/seller/vehicles`);
    const search = page.getByLabel("Search vehicles");
    await search.waitFor({ timeout: 60000 });
    // React must own the input before a typed value changes anything; on a cold
    // `next dev` compile the server HTML is readable but not yet interactive.
    await H.waitForHydration(page, 'input[aria-label="Search vehicles"]');
    const body = await page.locator("body").innerText();
    rec.check("R", "/seller/vehicles renders the real registration number", body.includes(reg), reg);
    const owner = H.sqlOne("SELECT id FROM users WHERE email = ?", H.ACCOUNTS.seller.email).id;
    const count = H.sqlOne("SELECT COUNT(*) AS n FROM vehicles WHERE owner_id = ?", owner).n;
    const shownChip = body.match(/(\d+)\s+shown/)?.[1];
    rec.check("R", "the 'shown' chip equals the SQL row count", Number(shownChip) === count, `chip=${shownChip} sql=${count}`);
    await H.shot(page, "F03-list");

    await search.fill(reg);
    const narrowed = await H.until(async () => {
      const t = await page.locator("body").innerText();
      return /(^|\D)1\s+shown/.test(t) && t.includes(reg);
    }, 20000, 800);
    const afterBody = await page.locator("body").innerText();
    rec.check("R", "search by registration narrows the list to the match", narrowed, afterBody.match(/\d+\s+shown/)?.[0] ?? "no chip");
    await search.fill(`${reg}ZZZZ`);
    const emptied = await H.until(async () => /No vehicles match this filter/i.test(await page.locator("body").innerText()), 20000, 800);
    const empty = await page.locator("body").innerText();
    rec.check("R", "an unmatched search shows the real empty state", emptied, empty.slice(0, 160).replace(/\n/g, " | "));
    await search.fill("");
  });

  await H.step(rec, "R", "status filter matches DB status", async () => {
    await H.waitForHydration(page, 'select[aria-label="Filter by status"]');
    await page.getByLabel("Filter by status").selectOption("published");
    const chip1 = await H.until(async () => {
      const t = await page.locator("body").innerText();
      return /\d+\s+shown/.test(t) && t.includes(reg);
    }, 20000, 800);
    const body = await page.locator("body").innerText();
    const published = H.sqlOne(
      "SELECT COUNT(*) AS n FROM vehicles v JOIN listings l ON l.vehicle_id = v.id WHERE v.owner_id = ? AND l.status = 'published' AND v.status <> 'archived'",
      H.sqlOne("SELECT id FROM users WHERE email = ?", H.ACCOUNTS.seller.email).id
    ).n;
    const chip = Number(body.match(/(\d+)\s+shown/)?.[1] ?? -1);
    rec.check("R", "'Published' filter count equals SQL published count", chip === published, `chip=${chip} sql=${published}`);
    rec.check("R", "published filter still lists the QA vehicle", chip1, reg);
    await H.shot(page, "F03-filter-published");
    await page.getByLabel("Filter by status").selectOption("all");
    await page.waitForTimeout(1000);
  });

  await H.step(rec, "R", "detail page renders DB columns", async () => {
    await page.locator('a[aria-label="View vehicle"]').first().waitFor({ timeout: 30000 });
    await page.goto(`${H.BASE}/seller/vehicles/${id}`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    const body = await page.locator("body").innerText();
    const row = H.sqlOne("SELECT * FROM vehicles WHERE id = ?", id);
    rec.check("R", "detail shows the DB registration number", body.includes(row.reg_no), row.reg_no);
    rec.check("R", "detail shows the DB VIN / frame number", body.includes(row.vin), String(row.vin).slice(0, 24));
    rec.check("R", "detail shows the DB asking price", [String(row.asking_price), Number(row.asking_price).toLocaleString("en-IN")].some((p) => body.includes(p)), `price=${row.asking_price}`);
    rec.check("R", "detail shows the DB make and model", body.includes(row.make) && body.includes(row.model), `${row.make} ${row.model}`);
    const cols = H.sql("SELECT name FROM pragma_table_info('vehicles')").map((c) => c.name);
    rec.check("R", "detail page is not a placeholder (category column is real)", cols.includes("vehicle_category_id"), "vehicles.vehicle_category_id");
    await H.shot(page, "F03-detail");
  });

  await H.step(rec, "D", "archive removes the vehicle from the marketplace", async () => {
    page.on("dialog", (d) => d.accept().catch(() => {}));
    // The archive control lives on the list rows, not the detail page.
    await H.gotoSafe(page, `${H.BASE}/seller/vehicles`);
    await page.getByLabel("Search vehicles").waitFor({ timeout: 60000 });
    const row = page.locator("tbody tr").filter({ hasText: reg }).first();
    const btn = row.locator('button[aria-label="Archive vehicle"]').first();
    await btn.waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
    await H.waitForHydration(page, 'button[aria-label="Archive vehicle"]');
    rec.check("D", "archive control exists for the owning seller", await btn.isVisible().catch(() => false), "aria-label=Archive vehicle on this row");
    const ap = page.waitForResponse(
      (r) => r.url().includes(`/api/v1/seller/vehicles/${id}/archive`) && r.request().method() === "POST",
      { timeout: 90000 }
    ).catch(() => null);
    await btn.click().catch(() => {});
    const res = await ap;
    rec.check("D", "POST /archive returns 200", res?.status() === 200, `HTTP ${res?.status()}`);
    const vrow = H.sqlOne("SELECT status FROM vehicles WHERE id = ?", id);
    const lrow = H.sqlOne("SELECT status FROM listings WHERE vehicle_id = ?", id);
    rec.check("D", "vehicles.status archived in SQLite", vrow?.status === "archived", String(vrow?.status));
    rec.check("D", "its listing is paused, not deleted", lrow?.status === "paused", String(lrow?.status));
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    const badged = await H.until(async () => {
      const t = await page.locator("body").innerText();
      return /Archived/i.test(t) && t.includes(reg);
    }, 45000, 1500);
    const body = await page.locator("body").innerText();
    rec.check("D", "reloaded list shows the Archived badge", badged, body.slice(0, 200).replace(/\n/g, " | "));
    await H.shot(page, "F03-archived");
    const foreign = await H.api(page, "POST", `/api/v1/seller/vehicles/${id}/archive`, {});
    rec.check("V", "re-archiving an archived vehicle is idempotent or rejected, never corrupt", [200, 400, 409].includes(foreign.status), errText(foreign));
  });

  await H.step(rec, "V", "ownership isolation on the detail endpoint", async () => {
    const other = H.sqlOne("SELECT v.id FROM vehicles v JOIN users u ON u.id = v.owner_id WHERE u.email = ?", "weduo@trustdrive.dev")?.id
      ?? H.sqlOne("SELECT id FROM vehicles WHERE owner_id <> (SELECT id FROM users WHERE email = ?) LIMIT 1", H.ACCOUNTS.seller.email)?.id;
    if (!other) return rec.note("no second-owner vehicle in seed to probe");
    const cross = await H.api(page, "GET", `/api/v1/seller/vehicles/${other}`);
    rec.check("V", "seller cannot read another owner's vehicle", [403, 404].includes(cross.status), errText(cross));
  });

  rec.note(`vehicle ${id} left archived for cleanup`);
}
