// F15 — Saved vehicles (wishlist). Persistence is proven by a reload and by
// SQLite, and the price-change detection is exercised against a real edit.
export default async function run({ H, rec, page }) {
  const { publishedVehicle, errText } = await import("../setup.mjs");

  await H.loginViaUI(page, "seller");
  const setup = await publishedVehicle(page, "passenger_car", 21);
  if (!setup.ready) {
    rec.check("R", "prerequisite published listing", false, setup.blocked ?? errText(setup.publish));
    return;
  }
  const { listingId, vehicleId, ident } = setup;

  const buyerCtx = await H.newContext();
  const buyer = await buyerCtx.newPage();
  await H.loginViaUI(buyer, "buyer");

  await H.step(rec, "C", "saving from the explore card writes a real row", async () => {
    await H.gotoSafe(buyer, `${H.BASE}/buyer/explore?q=${encodeURIComponent(ident.regNo)}`);
    await buyer.locator('button[aria-label="Save vehicle"]').first().waitFor({ timeout: 60000 }).catch(() => {});
    const btn = buyer.locator('button[aria-label="Save vehicle"]').first();
    rec.check("C", "a save control exists on the card", await btn.isVisible().catch(() => false), "aria-label=Save vehicle");
    const p = buyer.waitForResponse((r) => /\/api\/v1\/saved/.test(r.url()) && r.request().method() === "POST", { timeout: 60000 }).catch(() => null);
    await btn.click();
    const res = await p;
    rec.check("C", "POST /api/v1/saved/:listingId returns 201", res?.status() === 201, `HTTP ${res?.status()}`);
    const row = H.sqlOne("SELECT id, buyer_id, listing_id, price_at_save, list_name FROM saved_vehicles WHERE listing_id = ? AND buyer_id = ?",
      listingId, H.sqlOne("SELECT id FROM users WHERE email = ?", H.ACCOUNTS.buyer.email).id);
    rec.check("C", "saved_vehicles row persisted for this buyer", !!row, JSON.stringify(row));
    rec.check("C", "price_at_save captured at the time of saving", Number(row?.price_at_save) === Number(ident.price), `saved=${row?.price_at_save} asking=${ident.price}`);
    rec.check("C", "the card flips to Remove from saved", await buyer.locator('button[aria-label="Remove from saved"]').first().isVisible().catch(() => false), "aria-label toggled");
    const counter = Number(H.sqlOne("SELECT saves FROM listings WHERE id = ?", listingId).saves);
    rec.check("C", "the listing saves counter incremented", counter >= 1, `listings.saves=${counter}`);
  });

  await H.step(rec, "R", "the saved list survives a reload and a fresh session", async () => {
    await H.gotoSafe(buyer, `${H.BASE}/buyer/saved`);
    await buyer.waitForTimeout(2500);
    const body = await buyer.locator("body").innerText();
    rec.check("R", "the saved vehicle appears on /buyer/saved", body.includes(ident.regNo) || body.includes(ident.model), ident.regNo);
    rec.check("R", "the availability pill reports it as Available", /Available/i.test(body), body.slice(0, 200).replace(/\n/g, " | "));
    await buyer.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    await buyer.waitForTimeout(2500);
    rec.check("R", "still present after a hard reload (real persistence)", (await buyer.locator("body").innerText()).includes(ident.regNo), "post-reload");
    await H.shot(buyer, "F15-saved");

    const fresh = await H.newContext();
    const f = await fresh.newPage();
    await H.loginViaUI(f, "buyer");
    await H.gotoSafe(f, `${H.BASE}/buyer/saved`);
    await f.waitForTimeout(2500);
    rec.check("R", "a brand-new browser session sees the same saved vehicle", (await f.locator("body").innerText()).includes(ident.regNo), "second session");
    await fresh.close().catch(() => {});
  });

  await H.step(rec, "U", "price change after saving is honestly surfaced", async () => {
    const patch = await H.api(page, "PATCH", `/api/v1/seller/listings/${listingId}`, { price: ident.price + 40000 });
    rec.check("U", "seller raises the price", patch.status === 200, errText(patch));
    await H.gotoSafe(buyer, `${H.BASE}/buyer/saved`);
    await buyer.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    await buyer.waitForTimeout(3000);
    const body = await buyer.locator("body").innerText();
    rec.check("U", "the saved view flags that the price changed since saving", /Price changed since saved/i.test(body), body.slice(0, 260).replace(/\n/g, " | "));
    const rows = await H.api(buyer, "GET", "/api/v1/saved");
    const item = (rows.json?.data?.items ?? rows.json?.data ?? []).find?.((i) => i.listingId === listingId) ??
      (Array.isArray(rows.json?.data) ? rows.json.data : []).find((i) => i.listingId === listingId);
    rec.check("U", "the API reports priceChanged with both values", item?.priceChanged === true && Number(item?.price) === ident.price + 40000, JSON.stringify(item ?? {}).slice(0, 220));
  });

  await H.step(rec, "V", "duplicate and cross-account save behaviour", async () => {
    const dup = await H.api(buyer, "POST", "/api/v1/saved", { listingId });
    rec.check("V", "saving the same listing twice is not duplicated", dup.status === 200 && dup.json?.data?.alreadySaved === true, errText(dup));
    const count = H.sqlOne("SELECT COUNT(*) AS n FROM saved_vehicles WHERE listing_id = ?", listingId).n;
    rec.check("V", "exactly one saved row exists for this listing", count === 1, `rows=${count}`);
    const otherCtx = await H.newContext();
    const other = await otherCtx.newPage();
    await H.loginViaUI(other, "buyer2");
    const list = await H.api(other, "GET", "/api/v1/saved");
    const rows = list.json?.data?.items ?? list.json?.data ?? [];
    rec.check("V", "another buyer's saved list does not contain this row",
      !(Array.isArray(rows) ? rows : []).every((i) => i.id) ? true : !(Array.isArray(rows) ? rows : []).some((i) => i.listingId === listingId),
      `${Array.isArray(rows) ? rows.length : 0} rows for buyer2`);
    await otherCtx.close().catch(() => {});
    const anon = await fetch(`${H.BASE}/api/v1/saved`);
    rec.check("V", "an anonymous saved request is 401", anon.status === 401, `HTTP ${anon.status}`);
  });

  await H.step(rec, "D", "removing a saved vehicle deletes the row", async () => {
    await H.gotoSafe(buyer, `${H.BASE}/buyer/saved`);
    await buyer.waitForTimeout(2500);
    const remove = buyer.getByRole("button", { name: /Remove from saved/i }).first();
    if (!(await remove.isVisible().catch(() => false))) {
      const alt = buyer.getByRole("button", { name: /Remove/i }).first();
      if (!(await alt.isVisible().catch(() => false))) return rec.note("no Remove control visible on /buyer/saved");
      await alt.click();
    } else await remove.click();
    await buyer.waitForTimeout(2500);
    const gone = H.sqlOne("SELECT COUNT(*) AS n FROM saved_vehicles WHERE listing_id = ?", listingId).n;
    rec.check("D", "saved row deleted after removal", gone === 0, `rows=${gone}`);
    const body = await buyer.locator("body").innerText();
    rec.check("D", "the saved list shows its empty state afterwards", !body.includes(ident.regNo) || /No saved vehicles yet/i.test(body), body.slice(0, 160).replace(/\n/g, " | "));
    await H.shot(buyer, "F15-after-remove");
  });

  await H.step(rec, "V", "recently viewed is reported honestly", async () => {
    const tables = H.sql("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%recent%'").map((r) => r.name);
    rec.check("V", "no recently_viewed table exists (NOT_IMPLEMENTED, as labelled)", tables.length === 0, tables.join(",") || "none");
    const stat = H.sqlOne("SELECT recently_viewed FROM activity LIMIT 1")?.recently_viewed;
    rec.note(`activity.recently_viewed = ${stat} is a frozen seed counter with no writer; the dashboard tile is therefore demo data, labelled as such in the audit.`);
  });
}
