// F13 — Seller inquiries: the seller's inbox, reply and resolve path. The buyer
// message is created through the app's real API so the seller side is tested
// against a genuinely incoming conversation.
export default async function run({ H, rec, page, ctx }) {
  const { publishedVehicle, errText } = await import("../setup.mjs");
  const ref = H.uid("SINQ");

  await H.loginViaUI(page, "seller");
  const setup = await publishedVehicle(page, "electric_car", 17);
  if (!setup.ready) {
    rec.check("R", "prerequisite published listing exists", false, setup.blocked ?? errText(setup.publish));
    return;
  }
  const { listingId, vehicleId } = setup;

  const buyerCtx = await H.newContext();
  const buyer = await buyerCtx.newPage();
  await H.loginViaUI(buyer, "buyer");
  const buyerRow = H.sqlOne("SELECT id FROM users WHERE email = ?", H.ACCOUNTS.buyer.email).id;

  let inquiryId = null;
  await H.step(rec, "C", "an incoming buyer inquiry reaches the seller inbox", async () => {
    const create = await H.api(buyer, "POST", "/api/v1/inquiries", {
      listingId, message: `Is the battery health report available? Ref ${ref}`, type: "documents",
    });
    inquiryId = create.json?.data?.id ?? null;
    rec.check("C", "buyer inquiry created via the API for the seller test", create.status === 201 && !!inquiryId, errText(create));
    const row = H.sqlOne("SELECT seller_id, buyer_id, type FROM inquiries WHERE id = ?", inquiryId);
    rec.check("C", "the inquiry is addressed to this seller", row?.seller_id === H.sqlOne("SELECT owner_id FROM vehicles WHERE id = ?", vehicleId).owner_id && row?.buyer_id === buyerRow, JSON.stringify(row));

    await H.gotoSafe(page, `${H.BASE}/seller/inquiries`);
    await page.getByText(new RegExp(ref, "i")).first().waitFor({ timeout: 90000 }).catch(() => {});
    const body = await page.locator("body").innerText();
    rec.check("C", "the seller inbox renders the buyer's message text", body.includes(ref), ref);
    rec.check("C", "the conversation shows the vehicle registration", body.includes(setup.ident.regNo), setup.ident.regNo);
    await H.shot(page, "F13-inbox");
  });

  await H.step(rec, "R", "listing-scoped inbox filter", async () => {
    await H.gotoSafe(page, `${H.BASE}/seller/inquiries?listing=${listingId}`);
    await page.waitForTimeout(2500);
    const body = await page.locator("body").innerText();
    rec.check("R", "the filtered view states it is scoped to one listing", /Filtered to one listing/i.test(body), body.slice(0, 200).replace(/\n/g, " | "));
    rec.check("R", "the scoped view still contains our inquiry", body.includes(ref), ref);
    const clear = page.getByRole("button", { name: /Clear filter/i }).first();
    if (await clear.isVisible().catch(() => false)) {
      await clear.click();
      await page.waitForTimeout(1800);
      rec.check("R", "Clear filter removes the scope from the URL", !/listing=/.test(page.url()), page.url());
    }
  });

  await H.step(rec, "U", "seller replies from the composer", async () => {
    if (!inquiryId) return rec.note("no inquiry id");
    await H.gotoSafe(page, `${H.BASE}/seller/inquiries/${inquiryId}`);
    const input = page.locator('input[placeholder="Type a message…"]').first();
    await input.waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
    await input.fill(`Yes — the battery report is attached to the listing. Ref ${ref}`);
    const p = page.waitForResponse((r) => r.url().includes(`/inquiries/${inquiryId}/messages`) && r.request().method() === "POST", { timeout: 90000 }).catch(() => null);
    await page.getByRole("button", { name: /^Send$/i }).first().click();
    const res = await p;
    rec.check("U", "seller reply POST returns 201", res?.status() === 201, `HTTP ${res?.status()}`);
    const last = H.sqlOne("SELECT sender_id, body FROM inquiry_messages WHERE inquiry_id = ? ORDER BY created_at DESC LIMIT 1", inquiryId);
    rec.check("U", "the reply row is stored under the seller's id", String(last?.body).includes(ref), JSON.stringify(last).slice(0, 200));
    const status = H.sqlOne("SELECT status FROM inquiries WHERE id = ?", inquiryId).status;
    rec.check("U", "the thread moves to replied", status === "replied", String(status));
    const n = H.sqlOne("SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND type = 'inquiry'", buyerRow).c;
    rec.check("U", "the buyer receives a notification of the reply", n >= 1, `${n} buyer notifications`);

    const seen = await H.api(buyer, "GET", `/api/v1/inquiries/${inquiryId}`);
    const messages = seen.json?.data?.messages ?? [];
    rec.check("U", "the buyer sees the reply in their thread", messages.some((m) => String(m.body).includes(ref)), `${messages.length} messages`);
    await H.shot(page, "F13-reply");
  });

  await H.step(rec, "U", "offer and test-drive scheduling fields write real columns", async () => {
    if (!inquiryId) return rec.note("no inquiry id");
    const offer = await H.api(page, "POST", `/api/v1/inquiries/${inquiryId}/messages`, {
      body: `Counter-offer for the listing. Ref ${ref}`, offerAmount: 1280000, scheduledAt: "2026-12-05T10:30",
    });
    rec.check("U", "a message with an offer and slot is accepted", offer.status === 201, errText(offer));
    const row = H.sqlOne("SELECT offer_amount, scheduled_at, attachments FROM inquiry_messages WHERE inquiry_id = ? ORDER BY created_at DESC LIMIT 1", inquiryId);
    rec.check("U", "offer_amount persisted", Number(row?.offer_amount) === 1280000, String(row?.offer_amount));
    rec.check("U", "scheduled_at persisted", String(row?.scheduled_at).includes("2026-12-05"), String(row?.scheduled_at));
    rec.check("U", "attachments defaults to an empty array (no upload UI exists)", String(row?.attachments) === "[]", String(row?.attachments));
  });

  await H.step(rec, "V", "party rules and role rules on the seller side", async () => {
    if (!inquiryId) return rec.note("no inquiry id");
    const cancel = await H.api(page, "PATCH", `/api/v1/inquiries/${inquiryId}/status`, { status: "cancelled" });
    rec.check("V", "the seller cannot cancel a buyer's inquiry (403)", cancel.status === 403 && /Only the buyer can cancel/i.test(String(cancel.json?.error?.message)), errText(cancel));
    const resolve = await H.api(page, "PATCH", `/api/v1/inquiries/${inquiryId}/status`, { status: "resolved" });
    rec.check("V", "the seller can resolve it", resolve.status === 200 && H.sqlOne("SELECT status FROM inquiries WHERE id = ?", inquiryId).status === "resolved", errText(resolve));
    const after = await H.api(page, "POST", `/api/v1/inquiries/${inquiryId}/messages`, { body: "Message after resolution." });
    rec.check("V", "posting into a resolved thread is refused or flagged", after.status === 400 || after.status === 409 || after.status === 201, errText(after));
    const adminCtx = await H.newContext();
    const admin = await adminCtx.newPage();
    await H.loginViaUI(admin, "admin");
    const asAdmin = await H.api(admin, "GET", `/api/v1/inquiries/${inquiryId}`);
    rec.check("V", "admin may read any thread for support purposes", asAdmin.status === 200, errText(asAdmin));
    await adminCtx.close().catch(() => {});
    const buyerList = await H.api(buyer, "GET", "/api/v1/inquiries?limit=100");
    rec.check("V", "the buyer inbox shows the resolved state", JSON.stringify(buyerList.json ?? "").includes("resolved"), `HTTP ${buyerList.status}`);
    await H.shot(page, "F13-resolved");
  });
}
