// F19 — QR / signed share link. The QR must come from a persisted, revocable
// token; the public page must be reachable without a login; and revoking must
// actually stop it working. Anything the app does not do (scan analytics,
// expiry) is recorded as a limitation rather than asserted as a feature.
export default async function run({ H, rec, page }) {
  const { publishedVehicle, errText } = await import("../setup.mjs");

  await H.loginViaUI(page, "seller");
  const setup = await publishedVehicle(page, "electric_scooter", 34);
  if (!setup.ready) {
    rec.check("R", "prerequisite published vehicle", false, setup.blocked ?? errText(setup.create));
    return;
  }
  const { vehicleId, listingId, ident } = setup;
  let token = null;
  let verifyUrl = null;

  await H.step(rec, "C", "seller mints a share link + QR from the listing page", async () => {
    await H.gotoSafe(page, `${H.BASE}/seller/listings/${listingId}`);
    await H.waitForHydration(page, "button");
    const shareBtn = page.getByRole("button", { name: /Share Listing/i }).first();
    await shareBtn.waitFor({ state: "visible", timeout: 60000 });
    const sp = page.waitForResponse(
      (r) => r.url().includes(`/api/v1/seller/listings/${listingId}/share`) && r.request().method() === "POST",
      { timeout: 90000 }
    ).catch(() => null);
    await shareBtn.click();
    const res = await sp;
    const json = res ? await res.json().catch(() => ({})) : {};
    token = json?.data?.token ?? null;
    verifyUrl = json?.data?.verifyUrl ?? null;
    rec.check("C", "POST /listings/:id/share returns 201", res?.status() === 201, `HTTP ${res?.status()} ${JSON.stringify(json?.error ?? {})}`.slice(0, 200));
    rec.check("C", "response carries token, verify URL and QR data URL",
      !!token && /\/verify\//.test(String(verifyUrl)) && /^data:image\/(png|svg\+xml)/.test(String(json?.data?.qrDataUrl)),
      `${String(token).slice(0, 18)}… len=${String(token).length}`);
    const row = H.sqlOne("SELECT * FROM qr_tokens WHERE vehicle_id = ? ORDER BY created_at DESC LIMIT 1", vehicleId);
    rec.check("C", "qr_tokens row persisted with the same token", !!row && row.token === token, `jti=${row?.jti} revoked=${row?.revoked_at}`);
    rec.check("C", "token id is 32 hex characters and the row starts un-revoked",
      /^[0-9a-f]{32}$/.test(String(row?.jti)) && !row?.revoked_at && row?.created_by, `created_by=${row?.created_by}`);
    rec.check("C", "token is a signed pair (payload.signature), not a bare uuid", /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(String(token)), String(token).slice(0, 40));
    const body = await page.locator("body").innerText();
    rec.check("C", "UI shows the created share state, not a silent success", /Share link created|active/i.test(body), body.slice(0, 240).replace(/\n/g, " | "));
    const qrImg = page.locator('img[alt^="QR code for"]').first();
    rec.check("C", "QR image rendered from the real token", await qrImg.isVisible().catch(() => false), await qrImg.getAttribute("alt").catch(() => ""));
    await H.shot(page, "F19-share");
  });

  await H.step(rec, "R", "anonymous visitor can verify through the public page", async () => {
    const anon = await H.newContext();
    const anonPage = await anon.newPage();
    try {
      await H.gotoSafe(anonPage, verifyUrl);
      const body = await anonPage.locator("body").innerText();
      rec.check("R", "/verify/<token> renders without any login", !/Sign in|Log in to continue/i.test(body) && /Vehicle record found/i.test(body), body.slice(0, 220).replace(/\n/g, " | "));
      rec.check("R", "public page shows this vehicle's real identity", body.includes(ident.regNo) || body.includes(String(ident.vin)), `${ident.regNo}/${String(ident.vin).slice(0, 10)}`);
      rec.check("R", "integrity is stated as a hash chain, not as blockchain", /Hash chain (intact|broken)/i.test(body), body.match(/Hash chain [^\n]*/i)?.[0] ?? "");
      rec.check("R", "on-chain anchoring is explicitly not claimed", !/anchored on (a )?blockchain/i.test(body), body.match(/On-chain[^\n]*/i)?.[0] ?? "no on-chain claim rendered");
      await H.shot(anonPage, "F19-public-valid");
    } finally {
      await anon.close().catch(() => {});
    }
  });

  await H.step(rec, "V", "tampered and unknown tokens cannot guess their way in", async () => {
    const anon = await H.newContext();
    const anonPage = await anon.newPage();
    try {
      const tampered = `${token.slice(0, token.length - 6)}AAAAAA`;
      await H.gotoSafe(anonPage, `${H.BASE}/verify/${encodeURIComponent(tampered)}`);
      const body = await anonPage.locator("body").innerText();
      rec.check("V", "a modified signature does not reveal the record", /No TrustDrive record|has been revoked/i.test(body), body.slice(0, 220).replace(/\n/g, " | "));
      await H.gotoSafe(anonPage, `${H.BASE}/verify/not-a-real-token-at-all`);
      const junk = await anonPage.locator("body").innerText();
      rec.check("V", "a nonsense token yields an honest not-registered message", /No TrustDrive record/i.test(junk), junk.slice(0, 200).replace(/\n/g, " | "));
      await H.shot(anonPage, "F19-public-unknown");
    } finally {
      await anon.close().catch(() => {});
    }
  });

  await H.step(rec, "R", "verify API contract for the same tokens", async () => {
    const ok = await H.api(page, "GET", `/api/v1/verify/${encodeURIComponent(token)}`);
    rec.check("R", "GET /verify/:token resolves the live token", ok.status === 200 && !!ok.json?.data, `HTTP ${ok.status}`);
    const before = H.sqlOne("SELECT COUNT(*) AS n FROM audit_logs WHERE action LIKE '%qr%' OR action LIKE '%scan%' OR action LIKE '%verify%'").n;
    const again = await H.api(page, "GET", `/api/v1/verify/${encodeURIComponent(token)}`);
    const after = H.sqlOne("SELECT COUNT(*) AS n FROM audit_logs WHERE action LIKE '%qr%' OR action LIKE '%scan%' OR action LIKE '%verify%'").n;
    rec.check("R", "verify is read-only: no scan counter or audit row is invented", again.status === 200 && before === after, `audit before=${before} after=${after}`);
    rec.note("qr_tokens has no expiry and no scan-count column, so 'expired link' and 'N scans' are NOT_IMPLEMENTED in this build");
    const junk = await H.api(page, "GET", "/api/v1/verify/definitely-not-a-token");
    rec.check("V", "unknown token resolves to 404 NO_RECORD, never a stale record", junk.status === 404 && junk.json?.error?.code === "NO_RECORD", `HTTP ${junk.status} ${junk.json?.error?.code}`);
  });

  await H.step(rec, "U", "buyer verification lookup UI resolves the same vehicle", async () => {
    const buyerCtx = await H.newContext();
    const buyer = await buyerCtx.newPage();
    try {
      await H.loginViaUI(buyer, "buyer");
      await H.gotoSafe(buyer, `${H.BASE}/buyer/verification`);
      await H.waitForHydration(buyer, 'input[aria-label="Vehicle identifier"]');
      await buyer.getByLabel("Vehicle identifier").fill(ident.regNo);
      const lp = buyer.waitForResponse((r) => r.url().includes("/api/v1/verification/lookup") && r.request().method() === "POST", { timeout: 90000 }).catch(() => null);
      await buyer.getByRole("button", { name: /^Verify$/i }).first().click();
      const res = await lp;
      const json = res ? await res.json().catch(() => ({})) : {};
      rec.check("U", "registration lookup returns this vehicle", res?.status() === 200 && JSON.stringify(json).includes(vehicleId), `HTTP ${res?.status()}`);
      const body = await buyer.locator("body").innerText();
      rec.check("U", "lookup result renders trust and coverage, not a guarantee", /Evidence coverage/i.test(body) && !/guaranteed fault[- ]free/i.test(body), body.match(/Evidence coverage[^\n]*/i)?.[0] ?? "");

      await buyer.getByRole("button", { name: /QR token/i }).first().click().catch(() => {});
      await buyer.getByLabel("Vehicle identifier").fill(token);
      const qp = buyer.waitForResponse((r) => r.url().includes(`/api/v1/verify/`) && r.request().method() === "GET", { timeout: 90000 }).catch(() => null);
      await buyer.getByRole("button", { name: /^Verify$/i }).first().click();
      const qres = await qp;
      rec.check("U", "the same page resolves a pasted QR token", qres?.status() === 200, `HTTP ${qres?.status()}`);

      await buyer.getByLabel("Vehicle identifier").fill("MH99ZZZ0000");
      await buyer.getByRole("button", { name: /^Verify$/i }).first().click();
      await buyer.waitForTimeout(2500);
      const none = await buyer.locator("body").innerText();
      rec.check("V", "an unknown identifier shows 'No record found', not an error", /No record found|not registered/i.test(none), none.slice(0, 200).replace(/\n/g, " | "));
      await H.shot(buyer, "F19-buyer-lookup");
    } finally {
      await buyerCtx.close().catch(() => {});
    }
  });

  await H.step(rec, "D", "revoking kills every active link for the vehicle", async () => {
    await H.gotoSafe(page, `${H.BASE}/seller/listings/${listingId}`);
    await H.waitForHydration(page, "button");
    // The revoke control only renders inside the share panel, so open it again
    // through the real action bar rather than assuming client state survived.
    const shareAgain = page.getByRole("button", { name: /Share Listing/i }).first();
    await shareAgain.waitFor({ state: "visible", timeout: 60000 });
    await shareAgain.click();
    await page.getByRole("button", { name: /Revoke all links/i }).first().waitFor({ state: "visible", timeout: 90000 }).catch(() => {});
    const revoke = page.getByRole("button", { name: /Revoke all links/i }).first();
    rec.check("D", "revoke control rendered", await revoke.isVisible().catch(() => false), "Revoke all links");
    const rp = page.waitForResponse(
      (r) => r.url().includes(`/api/v1/seller/listings/${listingId}/share`) && r.request().method() === "DELETE",
      { timeout: 90000 }
    ).catch(() => null);
    await revoke.click().catch(() => {});
    const res = await rp;
    rec.check("D", "DELETE /share returns 200", res?.status() === 200, `HTTP ${res?.status()}`);
    const row = H.sqlOne("SELECT revoked_at FROM qr_tokens WHERE token = ?", token);
    rec.check("D", "the token row keeps its history and gains revoked_at", !!row?.revoked_at, `revoked_at=${row?.revoked_at}`);
    const gone = await H.api(page, "GET", `/api/v1/verify/${encodeURIComponent(token)}`);
    rec.check("D", "revoked token now returns 410 QR_REVOKED", gone.status === 410 && gone.json?.error?.code === "QR_REVOKED", `HTTP ${gone.status} ${gone.json?.error?.code}`);
    const anon = await H.newContext();
    const anonPage = await anon.newPage();
    try {
      await H.gotoSafe(anonPage, verifyUrl);
      const body = await anonPage.locator("body").innerText();
      rec.check("D", "public page states the code was revoked", /has been revoked/i.test(body), body.slice(0, 220).replace(/\n/g, " | "));
      await H.shot(anonPage, "F19-revoked");
    } finally {
      await anon.close().catch(() => {});
    }
    const events = H.sql("SELECT type FROM listing_events WHERE listing_id = ? AND type LIKE 'share%'", listingId);
    rec.check("D", "share and revoke are recorded as listing events", events.some((e) => e.type === "share") && events.some((e) => e.type === "share_revoked"),
      events.map((e) => e.type).join(","));
  });

  await H.step(rec, "Z", "cleanup", async () => {
    try { H.sqlExec("DELETE FROM listing_events WHERE listing_id = ?", listingId); } catch { /* constrained */ }
    try { H.sqlExec("DELETE FROM qr_tokens WHERE vehicle_id = ?", vehicleId); } catch { /* constrained */ }
    const left = H.sqlOne("SELECT COUNT(*) AS n FROM qr_tokens WHERE vehicle_id = ?", vehicleId).n;
    rec.check("Z", "QA tokens removed", left === 0, `rows=${left}`);
    const seedTokens = H.sqlOne("SELECT COUNT(*) AS n FROM qr_tokens").n;
    rec.check("Z", "seeded demo tokens still present", seedTokens > 0, `total=${seedTokens}`);
    const cv = await H.cleanupVehicle(page, vehicleId);
    rec.check("Z", "test vehicle removed or archived", cv.removed || cv.archived, `removed=${cv.removed} archived=${cv.archived}`);
  });
}
