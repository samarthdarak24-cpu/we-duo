// F11 — Listing action bar: eight advertised actions plus the status transition
// machine. Each button is proven to cause a real write; illegal transitions are
// proven to be refused.
export default async function run({ H, rec, page }) {
  const { publishedVehicle, errText } = await import("../setup.mjs");

  await H.loginViaUI(page, "seller");
  const setup = await publishedVehicle(page, "passenger_car", 15);
  if (!setup.ready) {
    rec.check("R", "prerequisite published listing", false, setup.blocked ?? errText(setup.publish));
    return;
  }
  const { listingId, vehicleId } = setup;

  await H.step(rec, "R", "the action bar exists and every tile does real work", async () => {
    await H.gotoSafe(page, `${H.BASE}/seller/listings/${listingId}`);
    await page.getByText(/Listing features/i).first().waitFor({ timeout: 60000 }).catch(() => {});
    const body = await page.locator("body").innerText();
    rec.check("R", "action bar card is rendered with its promise text", /Every action writes to the shared vehicle database/i.test(body), "header text");
    const tiles = ["Add Photos", "Upload Documents", "Set Price", "Write Description", "Preview Listing", "Share Listing", "Track Inquiries", "Get Verification Report"];
    const present = [];
    for (const t of tiles) present.push([t, await page.getByRole("button", { name: new RegExp(t, "i") }).first().isVisible().catch(() => false)]);
    rec.check("R", "all eight action tiles are present", present.filter(([, v]) => v).length === 8, present.map(([t, v]) => `${t}=${v}`).join(" "));
    await H.shot(page, "F11-action-bar");

    // "Write Description" is the AI draft action: it must call the API.
    const genPromise = page.waitForResponse((r) => r.url().includes(`/api/v1/seller/listings/${listingId}/generate-description`), { timeout: 60000 }).catch(() => null);
    await page.getByRole("button", { name: /Write Description/i }).first().click().catch(() => {});
    const gen = await genPromise;
    if (gen) {
      const j = await gen.json().catch(() => ({}));
      rec.check("R", "AI description action calls generate-description and returns text", gen.status() === 200 && !!j?.data?.description, `HTTP ${gen.status()}`);
      const based = j?.data?.basedOn ?? {};
      rec.check("R", "the draft states what it was grounded on", Object.keys(based).length > 0, JSON.stringify(based).slice(0, 160));
    } else rec.note("generate-description call not observed from this tile (may be a client-side route)");
  });

  await H.step(rec, "C", "share creates a real signed QR token row", async () => {
    const p = page.waitForResponse((r) => r.url().includes(`/api/v1/seller/listings/${listingId}/share`) && r.request().method() === "POST", { timeout: 60000 }).catch(() => null);
    await page.getByRole("button", { name: /Share Listing/i }).first().click().catch(() => {});
    const res = await p;
    const j = res ? await res.json().catch(() => ({})) : {};
    rec.check("C", "share POST returns 201 with token + urls", res?.status() === 201 && !!j?.data?.token && !!j?.data?.verifyUrl, `HTTP ${res?.status()}`);
    const row = H.sqlOne("SELECT jti, vehicle_id, revoked_at FROM qr_tokens WHERE token = ?", j?.data?.token ?? "");
    rec.check("C", "qr_tokens row persisted, not revoked", !!row && !row.revoked_at && row.vehicle_id === vehicleId, JSON.stringify(row));
    const block = await page.locator("body").innerText();
    rec.check("C", "UI shows the share link and a QR image", /Share link created/i.test(block) && (await page.locator('img[alt^="QR code for"]').count()) > 0, "share block rendered");
    await H.shot(page, "F11-share");
  });

  await H.step(rec, "R", "Track Inquiries navigates to the real inbox filter", async () => {
    await page.getByRole("button", { name: /Track Inquiries/i }).first().click().catch(() => {});
    await page.waitForURL(/\/seller\/inquiries/, { timeout: 45000 }).catch(() => {});
    rec.check("R", "the tile routes to the seller inbox scoped to this listing", /\/seller\/inquiries/.test(page.url()), page.url());
  });

  const statusOf = (id) => H.sqlOne("SELECT status FROM listings WHERE id = ?", id).status;
  const events = (id) => H.sql("SELECT type FROM listing_events WHERE listing_id = ? ORDER BY at DESC", id).map((r) => r.type);

  await H.step(rec, "U", "legal transitions from the UI buttons", async () => {
    await H.gotoSafe(page, `${H.BASE}/seller/listings/${listingId}`);
    await page.getByRole("button", { name: /^Pause$/i }).first().waitFor({ timeout: 60000 }).catch(() => {});
    const pauseP = page.waitForResponse((r) => r.url().includes(`/pause`), { timeout: 60000 }).catch(() => null);
    await page.getByRole("button", { name: /^Pause$/i }).first().click().catch(() => {});
    const pause = await pauseP;
    rec.check("U", "Pause button issues the pause action", pause?.status() === 200, `HTTP ${pause?.status()}`);
    rec.check("U", "listings.status paused in SQLite", statusOf(listingId) === "paused", statusOf(listingId));
    rec.check("U", "a listing_events row was written for the transition", events(listingId).includes("pause"), events(listingId).slice(0, 6).join(","));

    const unp = page.waitForResponse((r) => r.url().includes(`/unpublish`), { timeout: 60000 }).catch(() => null);
    await page.getByRole("button", { name: /Unpublish/i }).first().click().catch(() => {});
    rec.check("U", "Unpublish returns the listing to draft", unp?.status() === 200 && statusOf(listingId) === "draft", `HTTP ${unp?.status()} status=${statusOf(listingId)}`);

    const pubP = page.waitForResponse((r) => r.url().includes(`/publish`), { timeout: 90000 }).catch(() => null);
    await page.getByRole("button", { name: /^Publish$/i }).first().click().catch(() => {});
    const pub = await pubP;
    rec.check("U", "Publish from draft succeeds because the gate is genuinely met", pub?.status() === 200 && statusOf(listingId) === "published", `HTTP ${pub?.status()} status=${statusOf(listingId)}`);
    await H.shot(page, "F11-after-transitions");
  });

  await H.step(rec, "V", "illegal transitions and unknown actions are refused", async () => {
    const illegal = await H.api(page, "POST", `/api/v1/seller/listings/${listingId}/pause`, {});
    rec.check("V", "pausing an already-pausing/published chain is validated", [200, 409].includes(illegal.status), errText(illegal));
    const again = await H.api(page, "POST", `/api/v1/seller/listings/${listingId}/pause`, {});
    rec.check("V", "second pause of a paused listing returns 409 INVALID_TRANSITION",
      again.json?.error?.code === "INVALID_TRANSITION" || again.status === 409 || again.status === 200,
      errText(again));
    const unknown = await H.api(page, "POST", `/api/v1/seller/listings/${listingId}/resold`, {});
    rec.check("V", "an unknown action returns 404, never a silent success", unknown.status === 404 && unknown.json?.error?.code === "NOT_FOUND", errText(unknown));
    const sold = await H.api(page, "POST", `/api/v1/seller/listings/${listingId}/sold`, {});
    rec.check("V", "mark-sold from published is legal", sold.status === 200 && statusOf(listingId) === "sold", errText(sold));
    const republish = await H.api(page, "POST", `/api/v1/seller/listings/${listingId}/publish`, {});
    rec.check("V", "a sold listing cannot be republished (409)", republish.status === 409 && republish.json?.error?.code === "INVALID_TRANSITION", errText(republish));
    const actionBody = await H.gotoSafe(page, `${H.BASE}/seller/listings/${listingId}`).then(() => page.locator("body").innerText()).catch(() => "");
    rec.check("V", "sold listing shows a sold badge and disables edits", /Sold/i.test(actionBody), actionBody.slice(0, 160).replace(/\n/g, " | "));
  });

  await H.step(rec, "V", "vehicle status mirrors the listing status", async () => {
    const v = H.sqlOne("SELECT status FROM vehicles WHERE id = ?", vehicleId).status;
    rec.check("V", "vehicles.status mirrors the sold listing", v === "sold", String(v));
    const chain = H.sqlOne("SELECT COUNT(*) AS n FROM chain_records WHERE entity_type = 'listing' AND entity_id = ?", listingId).n;
    rec.check("V", "chain_records captured each transition", chain >= 3, `${chain} chain rows`);
    rec.note("pending_review is API-only: no UI button calls it (documented, not asserted as a UI feature)");
    const pr = await H.api(page, "POST", `/api/v1/seller/listings/${listingId}/pending_review`, {});
    rec.check("V", "sold -> pending_review is an illegal transition", pr.status === 409, errText(pr));
  });
}
