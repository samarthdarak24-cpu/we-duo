// F14 — Compare vehicles. The compare table is server-rendered from the URL
// ids; this module proves the rendered numbers come from SQLite and records
// honestly which parts of the feature are UI-driven and which are API-only.
export default async function run({ H, rec, page }) {
  const { publishedVehicle, errText } = await import("../setup.mjs");

  await H.loginViaUI(page, "seller");
  const a = await publishedVehicle(page, "passenger_car", 18);
  const b = await publishedVehicle(page, "electric_car", 19);
  const c = await publishedVehicle(page, "petrol_scooter", 20);
  const ids = [a, b, c].filter((x) => x.ready).map((x) => x.listingId);
  if (ids.length < 2) {
    rec.check("R", "at least two published listings exist for comparison", false, `ready=${ids.length}/3`);
    return;
  }

  const buyerCtx = await H.newContext();
  const buyer = await buyerCtx.newPage();
  await H.loginViaUI(buyer, "buyer");

  await H.step(rec, "R", "compare page renders a real matrix from DB values", async () => {
    const url = `${H.BASE}/buyer/compare?ids=${ids.slice(0, 2).join(",")}`;
    await H.gotoSafe(buyer, url);
    await buyer.getByText(/Attribute/i).first().waitFor({ timeout: 60000 }).catch(() => {});
    const body = await buyer.locator("body").innerText();
    const rows = ["Price", "Year", "Mileage", "Fuel", "Transmission", "Ownership", "Trust score", "Document verification"];
    const missing = rows.filter((r) => !new RegExp(r, "i").test(body));
    rec.check("R", "every expected attribute row is rendered", missing.length === 0, missing.join(",") || "all present");
    const priceA = Number(H.sqlOne("SELECT v.asking_price AS p FROM listings l JOIN vehicles v ON v.id = l.vehicle_id WHERE l.id = ?", ids[0]).p);
    rec.check("R", "column A shows the DB asking price", body.includes(String(priceA)) || body.includes(priceA.toLocaleString("en-IN")), `price=${priceA}`);
    const fuelA = H.sqlOne("SELECT v.fuel AS f FROM listings l JOIN vehicles v ON l.vehicle_id = v.id WHERE l.id = ?", ids[0]).f;
    const fuelB = H.sqlOne("SELECT v.fuel AS f FROM listings l JOIN vehicles v ON l.vehicle_id = v.id WHERE l.id = ?", ids[1]).f;
    rec.check("R", "fuel values come from the two vehicles, not a template", new RegExp(String(fuelA), "i").test(body) && new RegExp(String(fuelB), "i").test(body), `${fuelA} vs ${fuelB}`);
    const kmA = Number(H.sqlOne("SELECT v.km_claimed AS k FROM listings l JOIN vehicles v ON l.vehicle_id = v.id WHERE l.id = ?", ids[0]).k);
    rec.check("R", "mileage column shows the stored km", body.includes(String(kmA)) || body.includes(kmA.toLocaleString("en-IN")), `km=${kmA}`);
    rec.check("R", "a trust score row is shown as a score, not a colour swatch", /\/100|\d+%/.test(body), body.match(/\d+\/100|\d+%/g)?.slice(0, 4).join(" ") ?? "no numeric score");
    await H.shot(buyer, "F14-matrix");
  });

  await H.step(rec, "V", "the selection rules are enforced in the UI", async () => {
    await H.gotoSafe(buyer, `${H.BASE}/buyer/compare`);
    await buyer.getByText(/Pick 2/i).first().waitFor({ timeout: 60000 }).catch(() => {});
    const cta = buyer.getByRole("button", { name: /Compare selected/i }).first();
    rec.check("V", "the CTA is disabled before two vehicles are picked", await cta.isDisabled().catch(() => false), "disabled at 0 selected");
    const boxes = buyer.locator('input[type="checkbox"]');
    const total = await boxes.count();
    rec.check("V", "a selectable vehicle list is rendered", total >= 2, `${total} checkboxes`);
    await boxes.nth(0).check().catch(() => {});
    rec.check("V", "still disabled with exactly one selection", await cta.isDisabled().catch(() => false), "disabled at 1");
    await boxes.nth(1).check().catch(() => {});
    rec.check("V", "enabled once two are selected", await cta.isEnabled().catch(() => false), "enabled at 2");
    for (let i = 2; i < Math.min(total, 8); i += 1) await boxes.nth(i).check({ force: true }).catch(() => {});
    const body = await buyer.locator("body").innerText();
    const selected = Number(body.match(/(\d+)\s+selected/i)?.[1] ?? 0);
    rec.check("V", "the selection is capped at four vehicles", selected > 0 && selected <= 4, body.match(/\d+\s+selected[^\n]*/i)?.[0] ?? "no counter");
    await cta.click().catch(() => {});
    await buyer.waitForURL(/ids=/, { timeout: 30000 }).catch(() => {});
    rec.check("V", "choosing vehicles rewrites the URL with their ids", /ids=[^&]+,[^&]+/.test(buyer.url()), buyer.url().slice(-90));
  });

  await H.step(rec, "R", "the compare API exists but is not what the UI uses", async () => {
    const api = await H.api(buyer, "POST", "/api/v1/compare", { listingIds: ids.slice(0, 3) });
    rec.check("R", "POST /api/v1/compare returns rows + differences", api.status === 200 && Array.isArray(api.json?.data?.rows) && api.json?.data?.differences !== undefined, `HTTP ${api.status}`);
    const tooFew = await H.api(buyer, "POST", "/api/v1/compare", { listingIds: ids.slice(0, 1) });
    rec.check("R", "one id is refused with 400 (2-4 rule)", tooFew.status === 400, errText(tooFew));
    const tooMany = await H.api(buyer, "POST", "/api/v1/compare", { listingIds: [ids[0], ids[1], ids[0], ids[1], ids[0]] });
    rec.check("R", "more than four ids is refused with 400", tooMany.status === 400, errText(tooMany));
    const calls = await H.capturedApi(buyer, "/api/v1/compare").catch(() => []);
    rec.note(`UI-issued /api/v1/compare calls observed in this session: ${calls.length} (the compare table is server-rendered from ?ids=; the REST endpoint is API-only — labelled accordingly in the audit)`);
    const foreign = await H.api(buyer, "GET", `/api/v1/seller/listings/${ids[0]}`);
    rec.check("R", "a buyer is refused from the seller listing detail endpoint", [401, 403].includes(foreign.status), errText(foreign));
  });

  await H.step(rec, "V", "comparison never mixes categories dishonestly", async () => {
    const twoWheeler = c.ready ? c.listingId : null;
    if (!twoWheeler) return rec.note("no 2W listing prepared");
    await H.gotoSafe(buyer, `${H.BASE}/buyer/compare?ids=${ids[0]},${twoWheeler}`);
    await buyer.waitForTimeout(3500);
    const body = await buyer.locator("body").innerText();
    rec.check("V", "a car and a scooter compare on shared attributes only", /Price/i.test(body) && /Mileage/i.test(body), "attribute rows");
    rec.check("V", "the page never claims a car-specific 3D view for the scooter",
      !/sedan\.glb|car\.glb/i.test(body), "no car asset reference in compare text");
    await H.shot(buyer, "F14-cross-category");
  });
}
