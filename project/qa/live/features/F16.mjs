// F16 — Mileage / odometer analysis. Readings are added through the real
// Seller history form; the rollback flag, the finding it creates and the
// buyer-facing cross-modal panel are then checked against SQLite and the DOM.
const kmFmt = (n) => new Intl.NumberFormat("en-IN").format(n) + " km";

export default async function run({ H, rec, page, ctx }) {
  const { publishedVehicle, errText } = await import("../setup.mjs");

  // The reading list comes from the server component, so it only updates after
  // router.refresh() lands — poll the DOM instead of reading it immediately.
  let lastBody = "";
  const shown = async (p, text) => {
    const found = await H.until(async () => {
      lastBody = await p.locator("body").innerText().catch(() => lastBody);
      return lastBody.includes(text);
    }, 60000, 1000);
    return !!found;
  };
  const bodyNote = () => lastBody.slice(-320).replace(/\n/g, " | ");

  await H.loginViaUI(page, "seller");
  const setup = await publishedVehicle(page, "petrol_motorcycle", 31);
  if (!setup.ready) {
    rec.check("R", "prerequisite published vehicle", false, setup.blocked ?? errText(setup.create));
    return;
  }
  const { vehicleId, ident } = setup;
  const base = ident.km;

  await H.step(rec, "R", "history page opens on the selected vehicle", async () => {
    await H.gotoSafe(page, `${H.BASE}/seller/history?vehicle=${vehicleId}`);
    await H.waitForHydration(page, 'input[aria-label="Odometer reading in kilometres"]');
    const body = await page.locator("body").innerText();
    rec.check("R", "/seller/history renders this vehicle", body.includes(ident.regNo), ident.regNo);
    rec.check("R", "readings list has a real empty state first", /No odometer readings on file/i.test(body), body.slice(0, 200).replace(/\n/g, " | "));
    await H.shot(page, "F16-empty");
  });

  // ---- C: a normal, increasing reading ------------------------------------
  let firstReadingId = null;
  await H.step(rec, "C", "seller adds a higher odometer reading through the form", async () => {
    await page.getByLabel("Reading date").fill("2026-08-01");
    await page.getByLabel("Odometer reading in kilometres").fill(String(base + 1500));
    const p = page.waitForResponse(
      (r) => r.url().includes(`/api/v1/vehicles/${vehicleId}/mileage`) && r.request().method() === "POST",
      { timeout: 90000 }
    ).catch(() => null);
    await page.getByRole("button", { name: /Add reading/i }).first().click();
    const res = await p;
    const json = res ? await res.json().catch(() => ({})) : {};
    firstReadingId = json?.data?.id ?? null;
    rec.check("C", "POST /mileage returns 201", res?.status() === 201, `HTTP ${res?.status()} ${JSON.stringify(json?.error ?? {})}`.slice(0, 180));
    const row = H.sqlOne("SELECT * FROM mileage_readings WHERE id = ?", firstReadingId ?? "");
    rec.check("C", "mileage_readings row persisted", !!row, `id=${firstReadingId}`);
    rec.check("C", "seller reading is a claim, not a verified record",
      row?.verified === 0 && row?.is_seller_claim === 1 && row?.source === "seller_submitted",
      `verified=${row?.verified} claim=${row?.is_seller_claim} source=${row?.source}`);
    rec.check("C", "an increasing reading is not flagged", row?.flagged === 0, `flagged=${row?.flagged}`);
    rec.check("C", "UI renders the new km value with the Claim badge",
      (await shown(page, kmFmt(base + 1500))) && /Claim/.test(lastBody), bodyNote());
    await H.shot(page, "F16-reading-added");
  });

  // ---- U: the rollback case, which must flag and raise a finding ---------
  await H.step(rec, "U", "a lower later reading is flagged as a possible rollback", async () => {
    await page.getByLabel("Reading date").fill("2026-09-01");
    await page.getByLabel("Odometer reading in kilometres").fill(String(base + 300));
    const p = page.waitForResponse(
      (r) => r.url().includes(`/api/v1/vehicles/${vehicleId}/mileage`) && r.request().method() === "POST",
      { timeout: 90000 }
    ).catch(() => null);
    await page.getByRole("button", { name: /Add reading/i }).first().click();
    const res = await p;
    const json = res ? await res.json().catch(() => ({})) : {};
    const id = json?.data?.id ?? null;
    rec.check("U", "second POST /mileage returns 201", res?.status() === 201, `HTTP ${res?.status()}`);
    rec.check("U", "API reports the reading as flagged", json?.data?.flagged === true, JSON.stringify(json?.data ?? {}).slice(0, 180));
    const row = H.sqlOne("SELECT * FROM mileage_readings WHERE id = ?", id ?? "");
    rec.check("U", "SQLite flagged = 1", row?.flagged === 1 && Number(row?.km) === base + 300, `flagged=${row?.flagged} km=${row?.km}`);
    const finding = H.sqlOne("SELECT * FROM findings WHERE vehicle_id = ? AND code = 'ODOMETER_ROLLBACK'", vehicleId);
    rec.check("U", "ODOMETER_ROLLBACK finding written", !!finding, finding ? `${finding.severity} ${finding.status}` : "no row");
    rec.check("U", "rollback finding is critical and open", finding?.severity === "critical" && finding?.status !== "cleared", `${finding?.severity}/${finding?.status}`);
    rec.check("U", "UI shows the Flagged badge, not a silent pass",
      (await shown(page, kmFmt(base + 300))) && /Flagged/.test(lastBody), bodyNote());
    await H.shot(page, "F16-flagged");
  });

  // ---- V: invalid readings are rejected with no side effect --------------
  await H.step(rec, "V", "negative and non-numeric odometer input rejected", async () => {
    const before = H.sqlOne("SELECT COUNT(*) AS n FROM mileage_readings WHERE vehicle_id = ?", vehicleId).n;
    const neg = await H.api(page, "POST", `/api/v1/vehicles/${vehicleId}/mileage`, { date: "2026-10-01", km: -100 });
    rec.check("V", "negative km rejected with 400 VALIDATION_FAILED",
      neg.status === 400 && neg.json?.error?.code === "VALIDATION_FAILED", `HTTP ${neg.status} ${neg.text.slice(0, 140)}`);
    const nan = await H.api(page, "POST", `/api/v1/vehicles/${vehicleId}/mileage`, { date: "2026-10-01", km: "lots" });
    rec.check("V", "non-numeric km rejected", nan.status === 400, `HTTP ${nan.status} ${nan.text.slice(0, 140)}`);
    const noDate = await H.api(page, "POST", `/api/v1/vehicles/${vehicleId}/mileage`, { km: 100 });
    rec.check("V", "missing date rejected", noDate.status === 400, `HTTP ${noDate.status} ${noDate.text.slice(0, 140)}`);
    const after = H.sqlOne("SELECT COUNT(*) AS n FROM mileage_readings WHERE vehicle_id = ?", vehicleId).n;
    rec.check("V", "no rejected reading was persisted", after === before, `before=${before} after=${after}`);
  });

  // ---- R: verified vs claimed are kept apart -----------------------------
  await H.step(rec, "R", "claimed km never presented as verified km", async () => {
    const view = await H.api(page, "GET", `/api/v1/vehicles/${vehicleId}/mileage`);
    const d = view.json?.data ?? {};
    rec.check("R", "GET /mileage returns readings, verifiedKm, claimedKm, crossModal",
      Array.isArray(d.readings) && d.readings.length >= 2 && "verifiedKm" in d && "claimedKm" in d && !!d.crossModal,
      `readings=${d.readings?.length} verified=${d.verifiedKm} claimed=${d.claimedKm}`);
    rec.check("R", "seller-only history means 0 verified km", d.verifiedKm === 0, `verifiedKm=${d.verifiedKm}`);
    rec.check("R", "claimed km equals the last seller reading", Number(d.claimedKm) === base + 300, `claimedKm=${d.claimedKm}`);
    const flaggedCount = (d.readings ?? []).filter((r) => r.flagged).length;
    rec.check("R", "one reading flagged in the API view", flaggedCount === 1, `flagged=${flaggedCount}`);

    const body = await page.locator("body").innerText();
    rec.check("R", "history panel separates 'Last verified' from 'Seller claimed'",
      /Last verified/i.test(body) && /Seller claimed/i.test(body), body.slice(0, 400).replace(/\n/g, " | "));
    await H.shot(page, "F16-claimed-vs-verified");
  });

  // ---- buyer-side evidence, honest labelling -----------------------------
  await H.step(rec, "R", "buyer vehicle page shows the mileage evidence", async () => {
    const buyerCtx = await H.newContext();
    const buyer = await buyerCtx.newPage();
    try {
      await H.loginViaUI(buyer, "buyer");
      await H.gotoSafe(buyer, `${H.BASE}/vehicle/${vehicleId}`);
      await H.waitForHydration(buyer, '[role="tab"]').catch(() => {});
      // The odometer panel lives on the vehicle page's History tab.
      const historyTab = buyer.getByRole("tab", { name: /history/i }).first();
      if (await historyTab.isVisible().catch(() => false)) await historyTab.click().catch(() => {});
      const hasOdo = await shown(buyer, "Odometer readings");
      const body = lastBody;
      rec.check("R", "buyer sees the Odometer readings section", hasOdo, body.slice(0, 200).replace(/\n/g, " | "));
      rec.check("R", "flagged reading is labelled a warning, not proof",
        /not proof of tampering/i.test(body) && /Flagged/.test(body), body.match(/Flagged readings[^\n]*/i)?.[0] ?? "no warning wording");
      rec.check("R", "cross-modal odometer check rendered with method + rule version",
        /Cross-modal odometer check/i.test(body) && /cross-modal-odometer/.test(body) && /rules[^\d]{0,10}\d/i.test(body),
        body.match(/Method:[^\n]*/)?.[0] ?? body.match(/cross-modal-odometer[^\n]*/)?.[0] ?? "no method line");
      rec.check("R", "unverified seller readings are shown as claims", /Claim/.test(body), "Claim badge");
      await H.shot(buyer, "F16-buyer-mileage");
    } finally {
      await buyerCtx.close().catch(() => {});
    }
  });

  // ---- V: permission boundary on mileage writes --------------------------
  await H.step(rec, "V", "another seller cannot write into this vehicle's odometer", async () => {
    const other = H.sqlOne("SELECT id FROM vehicles WHERE owner_id <> (SELECT id FROM users WHERE email = ?) AND status <> 'archived' LIMIT 1", H.ACCOUNTS.seller.email)?.id;
    if (!other) return rec.note("no other-owner vehicle available");
    const cross = await H.api(page, "POST", `/api/v1/vehicles/${other}/mileage`, { date: "2026-01-01", km: 5 });
    rec.check("V", "cross-owner mileage write refused", [403, 404].includes(cross.status), `HTTP ${cross.status} ${cross.text.slice(0, 120)}`);
    const rows = H.sqlOne("SELECT COUNT(*) AS n FROM mileage_readings WHERE vehicle_id = ? AND km = 5", other).n;
    rec.check("V", "refused write left no row", rows === 0, `rows=${rows}`);
  });

  await H.step(rec, "Z", "cleanup the QA readings and finding", async () => {
    for (const q of ["DELETE FROM mileage_readings WHERE vehicle_id = ?", "DELETE FROM findings WHERE vehicle_id = ? AND code = 'ODOMETER_ROLLBACK'"]) {
      try { H.sqlExec(q, vehicleId); } catch { /* leave to the DB if constrained */ }
    }
    const left = H.sqlOne("SELECT COUNT(*) AS n FROM mileage_readings WHERE vehicle_id = ?", vehicleId).n;
    rec.check("Z", "test mileage rows removed, seed data untouched", left === 0, `left=${left}`);
    const cv = await H.cleanupVehicle(page, vehicleId);
    rec.check("Z", "test vehicle removed or archived", cv.removed || cv.archived, `removed=${cv.removed} archived=${cv.archived}`);
  });
}
