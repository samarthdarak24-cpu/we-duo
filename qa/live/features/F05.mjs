// F05 — Vehicle detail + edit: the listing editor is the app's real edit
// surface for an existing vehicle. Every save is a UI click, verified against
// the SQLite row and a reload.
export default async function run({ H, rec, page }) {
  const { publishedVehicle, errText } = await import("../setup.mjs");

  await H.loginViaUI(page, "seller");
  const setup = await publishedVehicle(page, "passenger_car", 5);
  if (!setup.vehicleId) {
    rec.check("R", "prerequisite published vehicle exists", false, setup.blocked ?? errText(setup.create));
    return;
  }
  const { vehicleId, listingId, ident } = setup;

  await H.step(rec, "R", "editor renders current DB values", async () => {
    await H.gotoSafe(page, `${H.BASE}/seller/listings/${listingId}`);
    await page.locator("#listing-headline").waitFor({ timeout: 60000 });
    rec.check("R", "headline input is filled from the DB listing", (await page.locator("#listing-headline").inputValue()).length > 0, await page.locator("#listing-headline").inputValue());
    const priceValue = await page.locator("#listing-price").inputValue();
    rec.check("R", "price input matches vehicles.asking_price", Number(priceValue) === Number(ident.price), `expected ${ident.price} got ${priceValue}`);
    rec.check("R", "gallery shows the 3 uploaded photos", /3\/20/.test(await page.locator("body").innerText()), "gallery count 3/20");
    await H.shot(page, "F05-editor");
  });

  const newHeadline = `Live audit edit ${H.uid("QA")} — single owner`;
  await H.step(rec, "U", "save changes writes through REST and SQLite", async () => {
    await page.locator("#listing-headline").fill(newHeadline);
    await page.locator("#listing-description").fill("Edited by the live functional audit. Evidence-backed condition report available.");
    await page.locator("#listing-price").fill(String(ident.price + 5000));
    await page.locator("#listing-condition").selectOption("Excellent");
    await page.locator("#listing-location").fill("Nashik, Maharashtra");
    const patchPromise = page.waitForResponse(
      (r) => r.url().includes(`/api/v1/seller/listings/${listingId}`) && r.request().method() === "PATCH",
      { timeout: 90000 }
    ).catch(() => null);
    await page.getByRole("button", { name: /Save changes/i }).first().click();
    const res = await patchPromise;
    rec.check("U", "PATCH /seller/listings/:id returns 200", res?.status() === 200, `HTTP ${res?.status()}`);
    // Price lives on vehicles.asking_price; listings has no price column.
    const row = H.sqlOne(
      "SELECT l.headline, l.description, l.condition, l.location, l.status, v.asking_price AS price FROM listings l JOIN vehicles v ON v.id = l.vehicle_id WHERE l.id = ?",
      listingId
    );
    rec.check("U", "headline persisted exactly", row?.headline === newHeadline, String(row?.headline).slice(0, 80));
    rec.check("U", "condition + location + price persisted", row?.condition === "Excellent" && row?.location === "Nashik, Maharashtra" && Number(row?.price) === ident.price + 5000,
      `${row?.condition}/${row?.location}/${row?.price}`);
    rec.check("U", "editing a published listing does not unpublish it", row?.status === "published", String(row?.status));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#listing-headline").waitFor({ timeout: 60000 });
    rec.check("U", "reloaded editor shows the saved headline", (await page.locator("#listing-headline").inputValue()) === newHeadline, await page.locator("#listing-headline").inputValue());
    await H.shot(page, "F05-after-save");
  });

  await H.step(rec, "V", "server-side validation rejects bad values", async () => {
    const tooLong = "x".repeat(150);
    const bad = await H.api(page, "PATCH", `/api/v1/seller/listings/${listingId}`, { headline: tooLong });
    rec.check("V", "headline over 140 characters rejected with 400", bad.status === 400 && bad.json?.error?.code === "VALIDATION_FAILED", errText(bad));
    const negPrice = await H.api(page, "PATCH", `/api/v1/seller/listings/${listingId}`, { price: -5 });
    rec.check("V", "negative price rejected with 400", negPrice.status === 400, errText(negPrice));
    const badCond = await H.api(page, "PATCH", `/api/v1/seller/listings/${listingId}`, { condition: "Stolen" });
    rec.check("V", "condition outside the whitelist rejected", badCond.status === 400, errText(badCond));
    const still = H.sqlOne("SELECT l.headline, v.asking_price AS price, l.condition FROM listings l JOIN vehicles v ON v.id = l.vehicle_id WHERE l.id = ?", listingId);
    rec.check("V", "rejected requests changed nothing in the DB", still.headline === newHeadline && Number(still.price) === ident.price + 5000 && still.condition === "Excellent",
      `${String(still.headline).slice(0, 40)}/${still.price}/${still.condition}`);
  });

  await H.step(rec, "U", "gallery controls mutate real rows", async () => {
    const before = H.sqlOne("SELECT cover_image FROM listings WHERE id = ?", listingId).cover_image;
    const setCover = page.getByRole("button", { name: /^Set cover$/i }).nth(1);
    if (await setCover.isVisible().catch(() => false)) {
      const p = page.waitForResponse((r) => r.url().includes(`/api/v1/vehicles/${vehicleId}/photos`) && r.request().method() === "PATCH", { timeout: 60000 }).catch(() => null);
      await setCover.click();
      const res = await p;
      rec.check("U", "Set cover issues PATCH and returns 200", res?.status() === 200, `HTTP ${res?.status()}`);
      const after = H.sqlOne("SELECT cover_image FROM listings WHERE id = ?", listingId).cover_image;
      rec.check("U", "cover_image actually changed in SQLite", after !== before, `${before} -> ${after}`);
    } else rec.note("Set cover button not visible (fewer than 2 photos?)");

    const remove = page.getByRole("button", { name: /Remove photo/i }).first();
    if (await remove.isVisible().catch(() => false)) {
      await page.on("dialog", (d) => d.accept().catch(() => {}));
      const d = page.waitForResponse((r) => r.url().includes(`/api/v1/vehicles/${vehicleId}/photos`) && r.request().method() === "DELETE", { timeout: 60000 }).catch(() => null);
      await remove.click();
      const res = await d;
      rec.check("U", "Remove photo issues DELETE and returns 200", res?.status() === 200, `HTTP ${res?.status()}`);
      const n = H.sqlOne("SELECT COUNT(*) AS n FROM listing_images WHERE listing_id = ?", listingId).n;
      rec.check("U", "image row removed from listing_images", n === 2, `rows=${n}`);
      const gate = await H.api(page, "GET", `/api/v1/seller/listings/${listingId}`);
      rec.check("U", "publish readiness now reports the photo blocker again",
        JSON.stringify(gate.json?.data ?? {}).includes("photo") || /blocker/i.test(JSON.stringify(gate.json?.data ?? {})),
        String(JSON.stringify(gate.json?.data?.gate ?? gate.json?.data ?? {}).slice(0, 200)));
    } else rec.note("Remove photo button not visible");
    await H.shot(page, "F05-gallery");
  });

  await H.step(rec, "V", "a sold listing is immutable to edits", async () => {
    const sold = await publishedVehicle(page, "petrol_scooter", 6);
    if (!sold.ready) return rec.note(`second vehicle not published: ${sold.blocked}`);
    const mark = await H.api(page, "POST", `/api/v1/seller/listings/${sold.listingId}/sold`, {});
    rec.check("V", "mark-sold transition returns 200", mark.status === 200, errText(mark));
    const edit = await H.api(page, "PATCH", `/api/v1/seller/listings/${sold.listingId}`, { headline: "Too late" });
    rec.check("V", "editing a sold listing returns 409 INVALID_TRANSITION",
      edit.status === 409 && edit.json?.error?.code === "INVALID_TRANSITION", errText(edit));
    rec.check("V", "sold listing keeps its original headline in SQLite",
      H.sqlOne("SELECT headline FROM listings WHERE id = ?", sold.listingId).headline !== "Too late", "headline unchanged");
  });
}
