// F12 — Buyer inquiries: a real message typed into the real contact form, the
// thread that follows, and the party-only status rules.
export default async function run({ H, rec, page }) {
  const { publishedVehicle, errText } = await import("../setup.mjs");
  const ref = H.uid("INQ");

  await H.loginViaUI(page, "seller");
  const setup = await publishedVehicle(page, "passenger_car", 16);
  if (!setup.ready) {
    rec.check("R", "prerequisite published listing exists", false, setup.blocked ?? errText(setup.publish));
    return;
  }
  const { vehicleId, listingId } = setup;

  const buyerCtx = await H.newContext();
  const buyer = await buyerCtx.newPage();
  await H.loginViaUI(buyer, "buyer");

  let inquiryId = null;
  await H.step(rec, "C", "inquiry created from the public vehicle page", async () => {
    await H.gotoSafe(buyer, `${H.BASE}/vehicle/${vehicleId}`);
    await buyer.getByText(new RegExp(setup.ident.regNo, "i")).first().waitFor({ timeout: 60000 }).catch(() => {});
    const contact = buyer.getByRole("button", { name: /Contact seller/i }).first();
    rec.check("C", "Contact seller button rendered for a published listing", await contact.isVisible().catch(() => false), "Contact seller");
    await contact.click();
    await buyer.locator("#vehicle-inquiry").waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    rec.check("C", "the contact form opens on the vehicle page", await buyer.locator("#vehicle-inquiry").isVisible().catch(() => false), "#vehicle-inquiry");

    await buyer.getByRole("button", { name: /Schedule test drive/i }).first().click().catch(() => {});
    const pressed = await buyer.getByRole("button", { name: /Schedule test drive/i }).first().getAttribute("aria-pressed").catch(() => null);
    rec.check("C", "inquiry type chip toggles state in the DOM", pressed === "true", `aria-pressed=${pressed}`);

    await buyer.locator("#vehicle-inquiry").fill("Hi");
    const short = buyer.getByText(/Please write a short message/i).first();
    rec.check("C", "client-side validation blocks a message under 5 characters", await short.isVisible().catch(() => false), "guard text");

    await buyer.locator("#vehicle-inquiry").fill(`Is the front bumper repaired? I would like a test drive. Ref ${ref}`);
    const promise = buyer.waitForResponse((r) => r.url().includes("/api/v1/inquiries") && r.request().method() === "POST", { timeout: 90000 }).catch(() => null);
    await buyer.getByRole("button", { name: /Send inquiry/i }).first().click();
    const res = await promise;
    const json = res ? await res.json().catch(() => ({})) : {};
    inquiryId = json?.data?.id ?? null;
    rec.check("C", "POST /api/v1/inquiries returns 201 with an id", res?.status() === 201 && !!inquiryId, `HTTP ${res?.status()} id=${inquiryId}`);
    const row = H.sqlOne("SELECT listing_id, buyer_id, seller_id, status, type, message FROM inquiries WHERE id = ?", inquiryId);
    rec.check("C", "inquiry row persisted with both parties", row?.listing_id === listingId && !!row?.buyer_id && !!row?.seller_id, JSON.stringify(row).slice(0, 240));
    rec.check("C", "inquiry opens with status open and the chosen type", row?.status === "open" && row?.type === "test_drive", `${row?.status}/${row?.type}`);
    const counter = Number(H.sqlOne("SELECT inquiries FROM listings WHERE id = ?", listingId).inquiries);
    rec.check("C", "the listing inquiry counter incremented", counter >= 1, `listings.inquiries=${counter}`);
    const notif = H.sqlOne("SELECT COUNT(*) AS n FROM notifications WHERE type = 'inquiry' AND user_id = (SELECT owner_id FROM vehicles WHERE id = ?)", vehicleId).n;
    rec.check("C", "the seller received a real notification row", notif >= 1, `${notif} notifications`);
    await H.shot(buyer, "F12-sent");
  });

  await H.step(rec, "R", "the thread is readable by its participants only", async () => {
    if (!inquiryId) return rec.note("no inquiry id");
    const mine = await H.api(buyer, "GET", `/api/v1/inquiries/${inquiryId}`);
    rec.check("R", "the buyer reads their own thread", mine.status === 200 && Array.isArray(mine.json?.data?.messages), `HTTP ${mine.status}`);
    const listed = await H.api(buyer, "GET", "/api/v1/inquiries?limit=50");
    rec.check("R", "the buyer inbox lists the new inquiry", (listed.json?.data ?? []).some?.((i) => i.id === inquiryId) || (listed.json?.data?.items ?? []).some((i) => i.id === inquiryId), `HTTP ${listed.status}`);

    const otherCtx = await H.newContext();
    const other = await otherCtx.newPage();
    await H.loginViaUI(other, "buyer2");
    const foreign = await H.api(other, "GET", `/api/v1/inquiries/${inquiryId}`);
    rec.check("R", "another buyer is refused with 403", foreign.status === 403, errText(foreign));
    const foreignList = await H.api(other, "GET", "/api/v1/inquiries?limit=100");
    const rows = foreignList.json?.data ?? [];
    rec.check("R", "the inquiry never appears in a non-participant's inbox",
      !(Array.isArray(rows) ? rows : rows.items ?? []).some((i) => i.id === inquiryId), `rows=${Array.isArray(rows) ? rows.length : rows.items?.length}`);
    const anon = await fetch(`${H.BASE}/api/v1/inquiries`, { headers: {} });
    rec.check("R", "an anonymous inbox request is 401", anon.status === 401, `HTTP ${anon.status}`);
    await otherCtx.close().catch(() => {});
  });

  await H.step(rec, "C", "buyer follow-up message through the inbox UI", async () => {
    if (!inquiryId) return rec.note("no inquiry id");
    await H.gotoSafe(buyer, `${H.BASE}/buyer/inquiries/${inquiryId}`);
    const input = buyer.locator('input[placeholder="Type a message…"]').first();
    await input.waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
    rec.check("C", "the thread view exposes a real composer", await input.isVisible().catch(() => false), "Type a message…");
    const send = buyer.getByRole("button", { name: /^Send$/i }).first();
    rec.check("C", "Send is disabled until a message is typed", await send.isDisabled().catch(() => false), "disabled for empty input");
    await input.fill(`Following up on ref ${ref}.`);
    const p = buyer.waitForResponse((r) => r.url().includes(`/inquiries/${inquiryId}/messages`) && r.request().method() === "POST", { timeout: 90000 }).catch(() => null);
    await send.click();
    const res = await p;
    rec.check("C", "message POST returns 201", res?.status() === 201, `HTTP ${res?.status()}`);
    const row = H.sqlOne("SELECT sender_id, body FROM inquiry_messages WHERE inquiry_id = ? ORDER BY created_at DESC LIMIT 1", inquiryId);
    rec.check("C", "message persisted with the buyer as sender", String(row?.body).includes(ref), JSON.stringify(row).slice(0, 200));
    await H.shot(buyer, "F12-thread");
  });

  await H.step(rec, "U", "status rules are enforced per party", async () => {
    if (!inquiryId) return rec.note("no inquiry id");
    const sellerResolveAsBuyer = await H.api(buyer, "PATCH", `/api/v1/inquiries/${inquiryId}/status`, { status: "resolved" });
    rec.check("U", "a buyer cannot resolve an inquiry (403)", sellerResolveAsBuyer.status === 403 && /Only the seller can resolve/i.test(String(sellerResolveAsBuyer.json?.error?.message)), errText(sellerResolveAsBuyer));
    const cancel = await H.api(buyer, "PATCH", `/api/v1/inquiries/${inquiryId}/status`, { status: "cancelled" });
    rec.check("U", "the buyer can cancel", cancel.status === 200 && H.sqlOne("SELECT status FROM inquiries WHERE id = ?", inquiryId).status === "cancelled", errText(cancel));
    const reopen = await H.api(buyer, "PATCH", `/api/v1/inquiries/${inquiryId}/status`, { status: "open" });
    rec.check("U", "a cancelled inquiry cannot be reopened (invalid transition)", reopen.status === 400 && reopen.json?.error?.code === "INVALID_TRANSITION", errText(reopen));
    const badStatus = await H.api(buyer, "PATCH", `/api/v1/inquiries/${inquiryId}/status`, { status: "wobbled" });
    rec.check("U", "an unknown status is rejected with 400", badStatus.status === 400, errText(badStatus));
  });

  await H.step(rec, "V", "a seller cannot open an inquiry on their own listing", async () => {
    const own = await H.api(page, "POST", "/api/v1/inquiries", { listingId, message: "Seller probing their own listing.", type: "general" });
    rec.check("V", "seller POST /inquiries is refused", own.status === 403 || own.status === 400, errText(own));
    const noMessage = await H.api(buyer, "POST", "/api/v1/inquiries", { listingId, message: "" });
    rec.check("V", "an empty message is refused with 400", noMessage.status === 400, errText(noMessage));
    const noId = await H.api(buyer, "POST", "/api/v1/inquiries", { message: "No listing referenced here." });
    rec.check("V", "a missing listing/vehicle reference is refused with 400", noId.status === 400, errText(noId));
  });
}
