// F10 — Listings manager + marketplace discovery (search, filters, sort,
// pagination). The counts shown to a buyer are reconciled against SQLite so a
// hardcoded or decorative result set cannot pass.
export default async function run({ H, rec, page }) {
  const { publishedVehicle, errText } = await import("../setup.mjs");

  await H.loginViaUI(page, "seller");
  const car = await publishedVehicle(page, "passenger_car", 13);
  if (!car.vehicleId) {
    rec.check("R", "prerequisite published car exists", false, car.blocked ?? errText(car.create));
    return;
  }
  rec.check("R", "published car listing available for the marketplace", car.ready, `id=${car.vehicleId} reg=${car.ident.regNo}`);

  await H.step(rec, "R", "seller listings manager renders real state", async () => {
    await H.gotoSafe(page, `${H.BASE}/seller/listings`);
    await page.getByText(/Publish readiness|Marketplace Listings|Listings/i).first().waitFor({ timeout: 60000 }).catch(() => {});
    const body = await page.locator("body").innerText();
    rec.check("R", "the listing row for the QA vehicle is rendered", body.includes(car.ident.regNo) || body.includes(car.ident.model), car.ident.regNo);
    rec.check("R", "readiness is expressed as blockers/warnings, not a fake percentage", /blocker|Ready|minimum/i.test(body), body.slice(0, 220).replace(/\n/g, " | "));
    await H.shot(page, "F10-seller-listings");
  });

  await H.step(rec, "V", "a bare draft cannot be published from the listings UI", async () => {
    const { identity } = await import("../setup.mjs");
    const ident = identity("passenger_car", 70);
    const bare = await H.api(page, "POST", "/api/v1/seller/vehicles", {
      make: "QA", model: "BareDraft", year: 2021, regNo: ident.regNo, vin: ident.vin,
      fuel: "Petrol", transmission: "Manual",
      category: "Petrol Car", categoryId: "passenger_car", condition: "Good", location: "Pune", price: 400000, km: 10000,
    });
    if (bare.status !== 201) return rec.note(`bare draft failed: ${errText(bare)}`);
    const listingId = bare.json.data.listingId;
    const res = await H.api(page, "POST", `/api/v1/seller/listings/${listingId}/publish`, {});
    rec.check("V", "publishing a photo-less, document-less draft is blocked with 422",
      res.status === 422 && res.json?.error?.code === "PUBLISH_BLOCKED", errText(res));
    const det = res.json?.error?.details ?? {};
    rec.check("V", "the gate names the photo blocker explicitly", JSON.stringify(det).includes("photo") || /3 vehicle photos/i.test(JSON.stringify(det)), JSON.stringify(det).slice(0, 260));
    rec.check("V", "the gate reports the missing verified RC", /rc/i.test(JSON.stringify(det).toLowerCase()), JSON.stringify(det).slice(0, 260));
    rec.check("V", "blocked listing stays draft in SQLite", H.sqlOne("SELECT status FROM listings WHERE id = ?", listingId).status === "draft", "status=draft");
  });

  const buyerCtx = await H.newContext();
  const buyer = await buyerCtx.newPage();
  await H.loginViaUI(buyer, "buyer");

  await H.step(rec, "R", "marketplace API results equal SQL truth", async () => {
    const all = await H.api(buyer, "GET", "/api/v1/marketplace/listings?pageSize=100");
    const items = all.json?.data?.items ?? [];
    const sql = H.sqlOne("SELECT COUNT(*) AS n FROM listings l JOIN vehicles v ON v.id = l.vehicle_id WHERE l.status = 'published' AND v.status <> 'archived'").n;
    rec.check("R", "GET /marketplace/listings returns published rows only", all.status === 200 && items.length > 0, `HTTP ${all.status} items=${items.length}`);
    rec.check("R", "total count matches the SQL published count", Number(all.json?.data?.page?.total) === sql, `api=${all.json?.data?.page?.total} sql=${sql}`);
    rec.check("R", "the QA listing is discoverable", items.some((i) => i.listingId === car.listingId || i.id === car.vehicleId), car.listingId);
    rec.check("R", "no draft or archived listing leaks into the marketplace",
      !(all.json?.data?.items ?? []).some((i) => /draft|archived/i.test(String(i.status ?? ""))), "status scan");
  });

  await H.step(rec, "R", "filters, search and sorting behave correctly", async () => {
    const byCat = await H.api(buyer, "GET", `/api/v1/marketplace/listings?category=passenger_car&pageSize=100`);
    const catItems = byCat.json?.data?.items ?? [];
    rec.check("R", "category filter returns only that category", catItems.every((i) => !i.categoryId || i.categoryId === "passenger_car"), `${catItems.length} items`);
    const byReg = await H.api(buyer, "GET", `/api/v1/marketplace/listings?q=${encodeURIComponent(car.ident.regNo)}&pageSize=100`);
    rec.check("R", "search by registration number finds the listing", (byReg.json?.data?.items ?? []).some((i) => i.listingId === car.listingId || i.id === car.vehicleId), car.ident.regNo);
    const byModel = await H.api(buyer, "GET", `/api/v1/marketplace/listings?q=${encodeURIComponent(car.ident.model)}&pageSize=100`);
    rec.check("R", "search by model matches the make/model text", (byModel.json?.data?.items ?? []).length > 0, `${(byModel.json?.data?.items ?? []).length} hits`);
    const none = await H.api(buyer, "GET", `/api/v1/marketplace/listings?q=ZZZNOSUCHVEHICLEZZZ`);
    rec.check("R", "a nonsense query returns an empty result set, not an error", none.status === 200 && (none.json?.data?.items ?? []).length === 0, `HTTP ${none.status}`);

    const cheap = await H.api(buyer, "GET", "/api/v1/marketplace/listings?priceMax=200000&pageSize=100");
    rec.check("R", "price ceiling respected", (cheap.json?.data?.items ?? []).every((i) => Number(i.price) <= 200000), (cheap.json?.data?.items ?? []).map((i) => i.price).join(",").slice(0, 120));
    const ev = await H.api(buyer, "GET", "/api/v1/marketplace/listings?fuel=Electric&pageSize=100");
    rec.check("R", "fuel filter returns electric only", (ev.json?.data?.items ?? []).every((i) => /electric/i.test(String(i.fuel ?? ""))), `${(ev.json?.data?.items ?? []).length} items`);
    const km = await H.api(buyer, "GET", "/api/v1/marketplace/listings?kmMax=15000&pageSize=100");
    rec.check("R", "odometer ceiling respected", (km.json?.data?.items ?? []).every((i) => Number(i.km) <= 15000), `${(km.json?.data?.items ?? []).length} items`);

    const asc = await H.api(buyer, "GET", "/api/v1/marketplace/listings?sort=price_asc&pageSize=20");
    const prices = (asc.json?.data?.items ?? []).map((i) => Number(i.price));
    rec.check("R", "sort=price_asc returns ascending prices", prices.every((p, i) => i === 0 || prices[i - 1] <= p), prices.join(",").slice(0, 120));
    const desc = await H.api(buyer, "GET", "/api/v1/marketplace/listings?sort=price_desc&pageSize=20");
    const dprices = (desc.json?.data?.items ?? []).map((i) => Number(i.price));
    rec.check("R", "sort=price_desc returns descending prices", dprices.every((p, i) => i === 0 || dprices[i - 1] >= p), dprices.join(",").slice(0, 120));
  });

  await H.step(rec, "R", "pagination never repeats or drops rows", async () => {
    const p1 = await H.api(buyer, "GET", "/api/v1/marketplace/listings?page=1&pageSize=5");
    const p2 = await H.api(buyer, "GET", "/api/v1/marketplace/listings?page=2&pageSize=5");
    const a = (p1.json?.data?.items ?? []).map((i) => i.listingId ?? i.id);
    const b = (p2.json?.data?.items ?? []).map((i) => i.listingId ?? i.id);
    rec.check("R", "page size honoured", a.length === 5, `${a.length} on page 1`);
    rec.check("R", "page 2 is a disjoint set from page 1", a.every((x) => !b.includes(x)), `${a.slice(0, 3)} vs ${b.slice(0, 3)}`);
    const page = p1.json?.data?.page ?? {};
    rec.check("R", "pagination metadata consistent with the total", Number(page.totalPages) === Math.ceil(Number(page.total) / 5), JSON.stringify(page));
    const big = await H.api(buyer, "GET", "/api/v1/marketplace/listings?page=9999&pageSize=5");
    rec.check("R", "an out-of-range page yields an empty page, not a crash", big.status === 200 && (big.json?.data?.items ?? []).length === 0, `HTTP ${big.status}`);
  });

  await H.step(rec, "R", "buyer explore + marketplace UI use the same data", async () => {
    await H.gotoSafe(buyer, `${H.BASE}/buyer/explore`);
    await buyer.getByText(/listings/i).first().waitFor({ timeout: 60000 }).catch(() => {});
    const body = await buyer.locator("body").innerText();
    const chip = Number(body.match(/(\d+)\s+listings/)?.[1] ?? -1);
    const total = Number((await H.api(buyer, "GET", "/api/v1/marketplace/listings?pageSize=1")).json?.data?.page?.total ?? -1);
    rec.check("R", "the explore 'listings' chip equals the API total", chip === total, `chip=${chip} api=${total}`);
    await H.shot(buyer, "F10-buyer-explore");
    await H.gotoSafe(buyer, `${H.BASE}/marketplace`);
    await buyer.waitForTimeout(2000);
    const cards = await buyer.locator('a[aria-label^="View"]').count().catch(() => 0);
    rec.check("R", "marketplace grid renders vehicle cards", cards > 0, `${cards} card links`);
    const tab = buyer.locator('a[href="/buyer/explore?tab=verified"]').first();
    if (await tab.isVisible().catch(() => false)) {
      await tab.click();
      await buyer.waitForTimeout(2500);
      rec.check("R", "the Verified tab navigates and re-renders", /buyer\/explore\?tab=verified/.test(buyer.url()), buyer.url());
    }
    await H.shot(buyer, "F10-marketplace");
  });

  await H.step(rec, "V", "private vehicles never surface in public search", async () => {
    const draftId = car.vehicleId;
    const paused = await H.api(page, "POST", `/api/v1/seller/listings/${car.listingId}/pause`, {});
    rec.check("V", "seller can pause their own listing", paused.status === 200, errText(paused));
    const search = await H.api(buyer, "GET", `/api/v1/marketplace/listings?q=${encodeURIComponent(car.ident.regNo)}&pageSize=100`);
    rec.check("V", "a paused listing leaves the public result set", !(search.json?.data?.items ?? []).some((i) => i.listingId === car.listingId), car.ident.regNo);
    const back = await H.api(page, "POST", `/api/v1/seller/listings/${car.listingId}/publish`, {});
    rec.check("V", "republishing restores public visibility", back.status === 200, errText(back));
    const again = await H.api(buyer, "GET", `/api/v1/marketplace/listings?q=${encodeURIComponent(car.ident.regNo)}&pageSize=100`);
    rec.check("V", "the listing is discoverable again", (again.json?.data?.items ?? []).some((i) => i.listingId === car.listingId), "re-discovered");
    rec.note(`draftId check skipped for ${draftId}`);
  });
}
