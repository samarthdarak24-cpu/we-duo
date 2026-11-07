// F17 — Trust score. The score must be deterministic, additive and driven only
// by real SQLite rows: coverage earns points, open findings cost points, and a
// cleared finding stops costing them. Nothing here is allowed to be LLM-set.
const SEVERITY_POINTS = { low: 8, medium: 12, high: 25, critical: 40 };
const clamp = (n) => Math.max(0, Math.min(100, n));

export default async function run({ H, rec, page, ctx }) {
  const { publishedVehicle, errText } = await import("../setup.mjs");

  await H.loginViaUI(page, "seller");
  const setup = await publishedVehicle(page, "petrol_scooter", 32);
  if (!setup.ready) {
    rec.check("R", "prerequisite published vehicle", false, setup.blocked ?? errText(setup.create));
    return;
  }
  const { vehicleId, ident } = setup;

  const trust = async (actor = page) => {
    const res = await H.api(actor, "GET", `/api/v1/vehicles/${vehicleId}/trust`);
    return res.json?.data ?? null;
  };
  // Independent re-derivation from the ledger rows, exactly as the engine defines it.
  const expectedTrust = (t) => {
    const penalty = (t?.breakdown ?? []).reduce((s, b) => s + Number(b.points ?? 0), 0);
    return clamp(Math.round(Number(t?.evidenceCoverage ?? 0)) - penalty);
  };
  const openPoints = () => H.sql(
    "SELECT code, severity, points, status FROM findings WHERE vehicle_id = ? AND status <> 'cleared'",
    vehicleId
  ).reduce((s, f) => s + Number(f.points ?? SEVERITY_POINTS[f.severity] ?? 0), 0);

  let baseline = null;
  await H.step(rec, "R", "score is additive coverage with no findings on file", async () => {
    baseline = await trust();
    rec.check("R", "GET /vehicles/:id/trust returns the full contract",
      baseline && typeof baseline.trustScore === "number" && typeof baseline.riskScore === "number"
        && !!baseline.band && !!baseline.bandLabel && typeof baseline.evidenceCoverage === "number" && Array.isArray(baseline.breakdown),
      JSON.stringify(baseline ?? null).slice(0, 260));
    rec.check("R", "a brand-new vehicle has no open findings", H.sql("SELECT id FROM findings WHERE vehicle_id = ?", vehicleId).length === 0,
      "findings table rows for this vehicle");
    rec.check("R", "no evidence means low coverage, but zero invented penalties",
      baseline.breakdown.length === 0 && baseline.trustScore === Math.round(baseline.evidenceCoverage),
      `score=${baseline.trustScore} coverage=${baseline.evidenceCoverage}`);
    rec.check("R", "risk score is exactly 100 minus trust", baseline.riskScore === 100 - baseline.trustScore,
      `trust=${baseline.trustScore} risk=${baseline.riskScore}`);
    rec.check("R", "band thresholds match the documented rule",
      baseline.band === (baseline.trustScore >= 85 ? "strong" : baseline.trustScore >= 65 ? "moderate" : baseline.trustScore >= 40 ? "caution" : "high_risk"),
      `score=${baseline.trustScore} band=${baseline.band}/${baseline.bandLabel}`);
    await H.shot(page, "F17-baseline");
  });

  await H.step(rec, "V", "same inputs, same score (deterministic, no LLM)", async () => {
    const a = await trust();
    const b = await trust();
    rec.check("V", "two consecutive reads are byte-identical",
      JSON.stringify(a) === JSON.stringify(b), `scores ${a?.trustScore}/${b?.trustScore}`);
    rec.check("V", "score equals the independently recomputed value",
      a.trustScore === expectedTrust(a), `api=${a.trustScore} recomputed=${expectedTrust(a)}`);
    const buyerCtx = await H.newContext();
    const buyer = await buyerCtx.newPage();
    try {
      await H.loginViaUI(buyer, "buyer");
      const asBuyer = await trust(buyer);
      rec.check("V", "buyer and seller roles see the identical score",
        JSON.stringify(asBuyer) === JSON.stringify(a), `buyer=${asBuyer?.trustScore} seller=${a.trustScore}`);
    } finally {
      await buyerCtx.close().catch(() => {});
    }
  });

  await H.step(rec, "C", "a real critical finding costs exactly its points", async () => {
    await H.gotoSafe(page, `${H.BASE}/seller/history?vehicle=${vehicleId}`);
    await H.waitForHydration(page, 'input[aria-label="Odometer reading in kilometres"]');
    await page.getByLabel("Reading date").fill("2026-08-01");
    await page.getByLabel("Odometer reading in kilometres").fill(String(ident.km + 1200));
    await page.getByRole("button", { name: /Add reading/i }).first().click();
    await page.waitForTimeout(2500);
    await page.getByLabel("Reading date").fill("2026-09-01");
    await page.getByLabel("Odometer reading in kilometres").fill(String(ident.km + 200));
    const p = page.waitForResponse((r) => r.url().includes("/mileage") && r.request().method() === "POST", { timeout: 90000 }).catch(() => null);
    await page.getByRole("button", { name: /Add reading/i }).first().click();
    await p;
    const after = await trust();
    const finding = H.sqlOne("SELECT * FROM findings WHERE vehicle_id = ? AND code = 'ODOMETER_ROLLBACK'", vehicleId);
    rec.check("C", "adding a rollback reading created a critical finding", !!finding && finding.severity === "critical", `${finding?.severity}/${finding?.status}`);
    // The score is clamped to 0..100, so a 31-point vehicle losing 40 points
    // lands on 0 rather than a negative number.
    const expected = clamp(baseline.trustScore - openPoints());
    rec.check("C", "trust dropped by exactly the finding's points (clamped at 0)",
      after.trustScore === expected,
      `baseline=${baseline.trustScore} openPoints=${openPoints()} expected=${expected} now=${after.trustScore}`);
    // The penalty list is derived from the same rows the check above reads, so
    // give the write a moment to be visible before calling this a defect.
    const itemised = await H.until(async () => {
      const t = await trust();
      return t?.breakdown?.some((x) => x.code === "ODOMETER_ROLLBACK") ? t : null;
    }, 25000);
    rec.check("C", "the penalty is itemised with its code", !!itemised,
      JSON.stringify((itemised ?? after).breakdown).slice(0, 200));
    const after2 = itemised ?? after;
    rec.check("C", "score still equals the recomputation after the change", after2.trustScore === expectedTrust(after2),
      `api=${after2.trustScore} recomputed=${expectedTrust(after2)}`);
    await H.shot(page, "F17-after-finding");
  });

  await H.step(rec, "R", "buyer sees the score and the honesty framing", async () => {
    const buyerCtx = await H.newContext();
    const buyer = await buyerCtx.newPage();
    try {
      await H.loginViaUI(buyer, "buyer");
      await H.gotoSafe(buyer, `${H.BASE}/vehicle/${vehicleId}`);
      const body = await buyer.locator("body").innerText();
      const t = await trust(buyer);
      rec.check("R", "buyer role can read the same trust score", t?.trustScore === (await trust(page)).trustScore,
        `buyer=${t?.trustScore} seller=${(await trust(page)).trustScore}`);
      rec.check("R", "vehicle page renders the trust score the API returned", body.includes(`${t.trustScore}/100`) || body.includes(String(t.trustScore)),
        `score=${t.trustScore}`);
      rec.check("R", "missing evidence is framed as coverage, never as proven fraud",
        /unverified coverage|not a clean record|not proof/i.test(body), body.slice(0, 1800).match(/[^.\n]*coverage[^.\n]*/i)?.[0] ?? "");
      await H.shot(buyer, "F17-buyer-trust");

      await H.gotoSafe(buyer, `${H.BASE}/buyer/risk`);
      const riskBody = await buyer.locator("body").innerText();
      rec.check("R", "/buyer/risk labels the rule version and says deterministic",
        /rules[- ]v?\d/i.test(riskBody) && /deterministic/i.test(riskBody),
        riskBody.match(/rules[- ]v[\d.]+[^\n]*/i)?.[0] ?? riskBody.slice(0, 160).replace(/\n/g, " | "));
      await H.shot(buyer, "F17-risk-page");
    } finally {
      await buyerCtx.close().catch(() => {});
    }
  });

  await H.step(rec, "U", "an admin-cleared finding stops costing points", async () => {
    const finding = H.sqlOne("SELECT id FROM findings WHERE vehicle_id = ? AND code = 'ODOMETER_ROLLBACK'", vehicleId);
    if (!finding) return rec.check("U", "a finding exists to dispute", false, "no ODOMETER_ROLLBACK row");
    await H.gotoSafe(page, `${H.BASE}/seller/fraud?vehicle=${vehicleId}`);
    await H.waitForHydration(page, "button");
    await page.getByText(/AI investigation/i).first().waitFor({ timeout: 60000 }).catch(() => {});
    // FraudPanel opens the first finding by default, so only click when the
    // accordion is actually collapsed; clicking an open one hides the controls.
    const accordion = page.getByRole("button", { name: /ODOMETER_ROLLBACK/i }).first();
    rec.check("U", "the rollback finding is listed on the fraud panel", await accordion.isVisible().catch(() => false), "accordion row containing ODOMETER_ROLLBACK");
    if ((await accordion.getAttribute("aria-expanded").catch(() => "true")) === "false") {
      await accordion.click().catch(() => {});
      await page.waitForTimeout(900);
    }
    const dispute = page.getByRole("button", { name: /Add context \/ dispute/i }).first();
    const clickable = await dispute.isVisible().catch(() => false);
    rec.check("U", "dispute control rendered on the fraud panel", clickable, "Add context / dispute");
    if (clickable) {
      await dispute.click();
      const box = page.getByLabel(/Your explanation/i).first();
      await box.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
      await box.fill("The odometer cluster was replaced by an authorised service centre; invoice reviewed.").catch(() => {});
      const dp = page.waitForResponse((r) => r.url().includes("/dispute") && r.request().method() === "POST", { timeout: 90000 }).catch(() => null);
      await page.getByRole("button", { name: /Submit dispute/i }).first().click().catch(() => {});
      const dres = await dp;
      rec.check("U", "dispute created through the UI (201)", dres?.status() === 201, `HTTP ${dres?.status()}`);
    }
    const disputeRow = H.sqlOne("SELECT id, status FROM disputes WHERE finding_id = ? ORDER BY created_at DESC LIMIT 1", finding.id);
    rec.check("U", "disputes row persisted", !!disputeRow, JSON.stringify(disputeRow ?? null).slice(0, 160));
    const explained = H.sqlOne("SELECT status FROM findings WHERE id = ?", finding.id);
    rec.check("U", "a pending dispute marks the finding explained but never deletes it",
      ["explained", "open"].includes(explained?.status), String(explained?.status));

    const adminCtx = await H.newContext();
    const admin = await adminCtx.newPage();
    try {
      await H.loginViaUI(admin, "admin");
      await H.gotoSafe(admin, `${H.BASE}/admin/queue`);
      await H.waitForHydration(admin, "button");
      const row = admin.locator("article.card").filter({ hasText: "Odometer rollback" }).first();
      const toggle = row.locator("button[aria-expanded]").first();
      rec.check("U", "the dispute is visible in the real admin queue", await toggle.isVisible().catch(() => false), "article with 'Odometer rollback'");
      await toggle.click().catch(() => {});
      await admin.getByLabel(/Review note/i).first().fill("QA: service invoice confirms the cluster was replaced; evidence reviewed.", { timeout: 30000 }).catch(() => {});
      const rp = admin.waitForResponse((r) => r.url().includes("/admin/disputes/") && r.url().includes("/resolve") && r.request().method() === "POST", { timeout: 90000 }).catch(() => null);
      await admin.getByRole("button", { name: /Resolve & clear finding/i }).first().click().catch(() => {});
      const rres = await rp;
      rec.check("U", "admin resolve endpoint returned 200", rres?.status() === 200, `HTTP ${rres?.status()}`);
      const cleared = H.sqlOne("SELECT status FROM findings WHERE id = ?", finding.id);
      rec.check("U", "finding status cleared in SQLite", cleared?.status === "cleared", String(cleared?.status));
      const afterClear = await trust();
      rec.check("U", "cleared finding no longer reduces the score",
        afterClear.trustScore === baseline.trustScore, `baseline=${baseline.trustScore} afterClear=${afterClear.trustScore}`);
      rec.check("U", "the decision is audit-logged", H.sql("SELECT id FROM audit_logs WHERE entity_type = 'dispute' AND entity_id = ?", disputeRow?.id ?? "").length > 0,
        "audit_logs rows for this dispute");
      await H.shot(admin, "F17-admin-resolved");
    } finally {
      await adminCtx.close().catch(() => {});
    }
  });

  await H.step(rec, "V", "trust endpoint access contract", async () => {
    const anon = await H.api(page, "GET", "/api/v1/vehicles/does-not-exist/trust");
    rec.check("V", "unknown vehicle id is 404, not a fake score", anon.status === 404, `HTTP ${anon.status}`);
    const adminCtx = await H.newContext();
    const admin = await adminCtx.newPage();
    try {
      await H.loginViaUI(admin, "admin");
      const asAdmin = await H.api(admin, "GET", `/api/v1/vehicles/${vehicleId}/trust`);
      rec.check("V", "admin can read the same trust summary the queue screen needs",
        asAdmin.status === 200 && typeof asAdmin.json?.data?.trustScore === "number",
        `HTTP ${asAdmin.status} ${asAdmin.json?.error?.code ?? ""}`);
      const same = asAdmin.json?.data?.trustScore === (await trust()).trustScore;
      rec.check("V", "the admin view is the same deterministic score, not a second one", same,
        `admin=${asAdmin.json?.data?.trustScore}`);
      const queueTrust = await H.api(admin, "GET", "/api/v1/admin/queue");
      rec.note(`admin /api/v1/admin/queue HTTP ${queueTrust.status}; its payload ${JSON.stringify(queueTrust.json).includes("trustScore") ? "carries" : "does not carry"} trust scores`);
    } finally {
      await adminCtx.close().catch(() => {});
    }
  });

  await H.step(rec, "Z", "cleanup", async () => {
    for (const q of [
      "DELETE FROM disputes WHERE finding_id IN (SELECT id FROM findings WHERE vehicle_id = ?)",
      "DELETE FROM mileage_readings WHERE vehicle_id = ?",
      "DELETE FROM findings WHERE vehicle_id = ?",
    ]) {
      try { H.sqlExec(q, vehicleId); } catch { /* leave constrained rows to the archive path */ }
    }
    const left = H.sqlOne("SELECT COUNT(*) AS n FROM findings WHERE vehicle_id = ?", vehicleId).n;
    rec.check("Z", "no QA findings left on this vehicle", left === 0, `rows=${left}`);
    const cv = await H.cleanupVehicle(page, vehicleId);
    rec.check("Z", "test vehicle removed or archived", cv.removed || cv.archived, `removed=${cv.removed} archived=${cv.archived}`);
    rec.check("Z", "no open finding rows remain for the QA vehicle",
      H.sql("SELECT id FROM findings WHERE vehicle_id = ? AND status = 'open'", vehicleId).length === 0, "findings");
  });
}
