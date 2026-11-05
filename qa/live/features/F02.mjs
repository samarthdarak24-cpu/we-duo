// F02 — Seller overview KPIs. Derived view: R is primary; C/U/D exercise the
// underlying vehicle entity through the app's own API and prove KPI reactivity.
export default async function run({ H, rec, page }) {
  let createdId = null;
  let originalName = null;
  const reg = `MH02QA${Date.now().toString().slice(-4)}`;

  await H.loginViaUI(page, "seller");

  const sqlStats = () => {
    const owner = H.sqlOne("SELECT id FROM users WHERE email = ?", H.ACCOUNTS.seller.email)?.id;
    return {
      owner,
      totalVehicles: H.sqlOne("SELECT COUNT(*) AS n FROM vehicles WHERE owner_id = ?", owner)?.n,
      activeListings: H.sqlOne("SELECT COUNT(*) AS n FROM listings l JOIN vehicles v ON v.id = l.vehicle_id WHERE v.owner_id = ? AND l.status = 'published'", owner)?.n,
      inquiries: H.sqlOne("SELECT COUNT(*) AS n FROM inquiries WHERE seller_id = ? AND status NOT IN ('resolved','cancelled')", owner)?.n,
      views: H.sqlOne("SELECT COALESCE(SUM(l.views),0) AS n FROM listings l JOIN vehicles v ON v.id = l.vehicle_id WHERE v.owner_id = ?", owner)?.n,
    };
  };

  await H.step(rec, "R", "KPI API matches live SQL", async () => {
    const api = await H.api(page, "GET", "/api/v1/seller/overview");
    rec.check("R", "GET /api/v1/seller/overview returns 200", api.status === 200, `status=${api.status}`);
    const s = api.json?.data?.stats;
    const db = sqlStats();
    rec.check("R", "stats payload exists", !!s, JSON.stringify(s ?? null).slice(0, 300));
    rec.check("R", "totalVehicles equals SQL count", s?.totalVehicles === db.totalVehicles, `api=${s?.totalVehicles} sql=${db.totalVehicles}`);
    rec.check("R", "activeListings equals SQL published count", s?.activeListings === db.activeListings, `api=${s?.activeListings} sql=${db.activeListings}`);
    rec.check("R", "inquiries equals SQL open count", s?.inquiries === db.inquiries, `api=${s?.inquiries} sql=${db.inquiries}`);
    rec.check("R", "views equals SQL sum", s?.views === db.views, `api=${s?.views} sql=${db.views}`);

    await page.goto(`${H.BASE}/seller`, { waitUntil: "domcontentloaded" });
    const body = await page.locator("body").innerText();
    rec.check("R", "UI renders the four primary KPI labels", ["Total vehicles", "Active listings", "Pending verification", "Buyer inquiries"].every((t) => body.includes(t)), body.slice(0, 250).replace(/\n/g, " | "));
    rec.check("R", "UI shows DB-derived totalVehicles value", new RegExp(`\\b${db.totalVehicles}\\b`).test(body), `expected ${db.totalVehicles}`);
    await H.shot(page, "F02-overview");
  });

  await H.step(rec, "C", "create a vehicle and watch KPI react", async () => {
    const before = (await H.api(page, "GET", "/api/v1/seller/overview")).json?.data?.stats?.totalVehicles;
    const res = await H.api(page, "POST", "/api/v1/seller/vehicles", {
      make: "QA", model: "KpiProbe", regNo: reg, year: 2020, fuel: "Petrol",
      transmission: "Manual", category: "Sedan", km: 10000, price: 500000, location: "Pune",
    });
    rec.check("C", "POST /api/v1/seller/vehicles returns 201", res.status === 201, `status=${res.status} body=${res.text.slice(0, 250)}`);
    createdId = res.json?.data?.id || null;
    if (!createdId) {
      const row = H.sqlOne("SELECT id FROM vehicles WHERE reg_no = ?", reg);
      createdId = row?.id || null;
    }
    rec.check("C", "vehicle row persisted to DB", !!createdId && !!H.sqlOne("SELECT * FROM vehicles WHERE id = ?", createdId || ""), `id=${createdId}`);
    const after = (await H.api(page, "GET", "/api/v1/seller/overview")).json?.data?.stats?.totalVehicles;
    rec.check("C", "totalVehicles KPI increased by exactly 1", after === before + 1, `before=${before} after=${after}`);
    await page.reload({ waitUntil: "domcontentloaded" });
    rec.check("C", "reloaded dashboard reflects new count", (await page.locator("body").innerText()).includes(`${after} vehicles`), `expected '${after} vehicles'`);
  });

  await H.step(rec, "U", "update vehicle and profile; both persist", async () => {
    const patch = await H.api(page, "PATCH", `/api/v1/seller/vehicles/${createdId}`, { color: "QA-Graphite", location: "Nagpur" });
    rec.check("U", "PATCH vehicle returns 200", patch.status === 200, `status=${patch.status} body=${patch.text.slice(0, 200)}`);
    const row = H.sqlOne("SELECT color, location FROM vehicles WHERE id = ?", createdId);
    rec.check("U", "vehicle fields updated in DB", row?.color === "QA-Graphite" && row?.location === "Nagpur", JSON.stringify(row));

    originalName = H.sqlOne("SELECT name FROM users WHERE email = ?", H.ACCOUNTS.seller.email)?.name;
    await page.goto(`${H.BASE}/seller/settings`, { waitUntil: "domcontentloaded" });
    await H.waitForHydration(page, "input.td-input");
    const nameInput = page.locator("input.td-input").first();
    await nameInput.fill("QA Samarth");
    const savePromise = page.waitForResponse((r) => r.url().includes("/api/v1/me") && r.request().method() === "PATCH");
    await page.getByRole("button", { name: /save changes/i }).click();
    const saved = await savePromise;
    rec.check("U", "settings Save changes PATCH /api/v1/me returns 200", saved.status() === 200, `status=${saved.status()}`);
    rec.check("U", "profile name persisted in DB", H.sqlOne("SELECT name FROM users WHERE email = ?", H.ACCOUNTS.seller.email)?.name === "QA Samarth", H.sqlOne("SELECT name FROM users WHERE email = ?", H.ACCOUNTS.seller.email)?.name);
    await page.goto(`${H.BASE}/seller`, { waitUntil: "domcontentloaded" });
    rec.check("U", "dashboard greeting reflects updated name", (await page.locator("body").innerText()).includes("Welcome back, QA"), (await page.locator("body").innerText()).slice(0, 200).replace(/\n/g, " | "));
  });

  await H.step(rec, "D", "delete (archive) vehicle and restore profile", async () => {
    const del = await H.api(page, "DELETE", `/api/v1/seller/vehicles/${createdId}`);
    rec.check("D", "DELETE vehicle returns 200", del.status === 200, `status=${del.status} body=${del.text.slice(0, 200)}`);
    const row = H.sqlOne("SELECT status FROM vehicles WHERE id = ?", createdId);
    rec.check("D", "vehicle soft-deleted (status=archived) in DB", row?.status === "archived", JSON.stringify(row));
    const listing = H.sqlOne("SELECT status FROM listings WHERE vehicle_id = ?", createdId);
    rec.check("D", "linked listing paused on archive", listing?.status === "paused", JSON.stringify(listing));

    const restore = await H.api(page, "PATCH", "/api/v1/me", { name: originalName });
    rec.check("D", "profile restored", restore.status === 200 && H.sqlOne("SELECT name FROM users WHERE email = ?", H.ACCOUNTS.seller.email)?.name === originalName, `status=${restore.status}`);
  });

  await H.step(rec, "Z", "cleanup test rows", async () => {
    if (createdId) {
      H.sqlExec("DELETE FROM listings WHERE vehicle_id = ?", createdId);
      H.sqlExec("DELETE FROM chain_records WHERE vehicle_id = ?", createdId);
      H.sqlExec("DELETE FROM audit_logs WHERE entity_type = 'vehicle' AND entity_id = ?", createdId);
      H.sqlExec("DELETE FROM vehicles WHERE id = ?", createdId);
    }
    rec.check("Z", "test vehicle fully removed from DB", !H.sqlOne("SELECT id FROM vehicles WHERE id = ?", createdId || ""), `id=${createdId}`);
  });
}
