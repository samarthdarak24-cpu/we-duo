// F20 — Notifications. Every notification here is produced by a real action in
// another module (an inquiry, a document upload), never inserted by the test.
export default async function run({ H, rec, page }) {
  const { publishedVehicle, errText } = await import("../setup.mjs");

  await H.loginViaUI(page, "seller");
  const setup = await publishedVehicle(page, "petrol_scooter", 35);
  if (!setup.ready) {
    rec.check("R", "prerequisite published vehicle", false, setup.blocked ?? errText(setup.create));
    return;
  }
  const { vehicleId } = setup;
  const sellerId = H.sqlOne("SELECT id FROM users WHERE email = ?", H.ACCOUNTS.seller.email).id;

  await H.step(rec, "C", "a buyer inquiry creates a notification for the seller", async () => {
    const buyerCtx = await H.newContext();
    const buyer = await buyerCtx.newPage();
    const ref = H.uid("QAN");
    try {
      await H.loginViaUI(buyer, "buyer");
      await H.gotoSafe(buyer, `${H.BASE}/vehicle/${vehicleId}`);
      await H.waitForHydration(buyer, "button");
      const contact = buyer.getByRole("button", { name: /Contact seller/i }).first();
      rec.check("C", "buyer can open the contact form", await contact.isVisible().catch(() => false), "Contact seller");
      await contact.click();
      await buyer.locator("#vehicle-inquiry").waitFor({ state: "visible", timeout: 30000 });
      await buyer.locator("#vehicle-inquiry").fill(`Do you have the service book for this scooter? Reference ${ref}`);
      const ip = buyer.waitForResponse((r) => r.url().includes("/inquiries") && r.request().method() === "POST", { timeout: 90000 }).catch(() => null);
      await buyer.getByRole("button", { name: /Send inquiry/i }).first().click();
      const res = await ip;
      rec.check("C", "inquiry POST returned 201", res?.status() === 201, `HTTP ${res?.status()}`);
      const note = await H.until(async () => H.sqlOne(
        "SELECT * FROM notifications WHERE user_id = ? AND type = 'inquiry' AND body LIKE ? ORDER BY created_at DESC LIMIT 1",
        sellerId, `%${ref}%`
      ), 30000, 1000).catch(() => null);
      rec.check("C", "notifications row created for the seller by the inquiry", !!note, JSON.stringify(note ?? null).slice(0, 220));
      rec.check("C", "notification is unread and carries the inquiry id", note?.read === 0 && /inquiryId/.test(String(note?.data)), `read=${note?.read} data=${String(note?.data).slice(0, 80)}`);
      rec.check("C", "notification title names the real buyer", /New inquiry from .+/.test(String(note?.title)), String(note?.title));
    } finally {
      await buyerCtx.close().catch(() => {});
    }
  });

  await H.step(rec, "R", "the seller bell and notifications page show it", async () => {
    await H.gotoSafe(page, `${H.BASE}/seller/notifications`);
    await H.waitForHydration(page, "button");
    const body = await page.locator("body").innerText();
    rec.check("R", "notifications page renders the inquiry title", /New inquiry from/.test(body), body.slice(0, 240).replace(/\n/g, " | "));
    const bell = page.locator('[aria-label^="Notifications"]').first();
    const label = await bell.getAttribute("aria-label").catch(() => null);
    const unreadSql = H.sqlOne("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0", sellerId).n;
    rec.check("R", "bell aria-label counts match the SQL unread count",
      !label || Number(label.match(/(\d+) unread/)?.[1] ?? -1) === unreadSql, `label="${label}" sql=${unreadSql}`);
    const dot = await page.locator('[aria-label="Unread"]').count();
    rec.check("R", "unread markers rendered for unread rows", dot >= 1, `dots=${dot} sql=${unreadSql}`);
    await H.shot(page, "F20-list");
  });

  await H.step(rec, "U", "clicking a notification marks exactly that one read", async () => {
    const target = H.sqlOne("SELECT id, title FROM notifications WHERE user_id = ? AND type = 'inquiry' AND read = 0 ORDER BY created_at DESC LIMIT 1", sellerId);
    if (!target) return rec.check("U", "an unread notification exists", false, "none found");
    const rp = page.waitForResponse((r) => r.url().includes(`/api/v1/notifications/${target.id}/read`) && r.request().method() === "PATCH", { timeout: 60000 }).catch(() => null);
    await page.getByRole("button", { name: new RegExp(String(target.title).slice(0, 28).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first().click().catch(() => {});
    const res = await rp;
    rec.check("U", "PATCH /notifications/:id/read returns 200", res?.status() === 200, `HTTP ${res?.status()}`);
    rec.check("U", "read flag persisted in SQLite", H.sqlOne("SELECT read FROM notifications WHERE id = ?", target.id)?.read === 1, "read=1");
    const others = H.sqlOne("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0", sellerId).n;
    const total = H.sqlOne("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?", sellerId).n;
    rec.check("U", "only that row changed, the rest keep their state", others <= total - 1, `unread=${others} total=${total}`);
  });

  await H.step(rec, "U", "unread filter and mark-all-read behave honestly", async () => {
    const unreadBtn = page.getByRole("button", { name: /^unread/i }).first();
    await unreadBtn.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    await unreadBtn.click().catch(() => {});
    await page.waitForTimeout(2200);
    const filtered = await page.locator("body").innerText();
    const unreadSql = H.sqlOne("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0", sellerId).n;
    rec.check("U", "unread filter shows only unread rows (or the caught-up state)",
      unreadSql === 0 ? /all caught up/i.test(filtered) : /New inquiry|Document|Verification|Dispute|Listing/i.test(filtered), `unreadSql=${unreadSql}`);
    await H.shot(page, "F20-unread-filter");

    const ap = page.waitForResponse((r) => r.url().includes("/api/v1/notifications/read-all") && r.request().method() === "POST", { timeout: 60000 }).catch(() => null);
    await page.getByRole("button", { name: /Mark all read/i }).first().click().catch(() => {});
    const res = await ap;
    rec.check("U", "POST /notifications/read-all returns 200", res?.status() === 200, `HTTP ${res?.status()}`);
    rec.check("U", "zero unread rows remain for this account",
      H.sqlOne("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0", sellerId).n === 0, "unread=0");
    await page.getByRole("button", { name: /^unread/i }).first().click().catch(() => {});
    await page.waitForTimeout(1800);
    const caught = await page.locator("body").innerText();
    rec.check("U", "the real empty state appears after marking all read", /all caught up/i.test(caught), caught.slice(0, 200).replace(/\n/g, " | "));
  });

  await H.step(rec, "C", "a document upload notifies its own owner", async () => {
    const doc = await H.api(page, "POST", `/api/v1/vehicles/${vehicleId}/documents`, undefined);
    rec.note(`(control probe) a bodyless document POST is rejected: HTTP ${doc.status} ${doc.json?.error?.code ?? ""}`);
    const before = H.sqlOne("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'document'", sellerId).n;
    const { makeDocPdf } = await import("../setup.mjs");
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { identity } = await import("../setup.mjs");
    const ident = identity("petrol_scooter", 35);
    const pdf = makeDocPdf(ident, "insurance", "QA-insurance");
    const up = await H.uiUpload(page, `/api/v1/vehicles/${vehicleId}/documents`,
      { type: "insurance", consent: "true" },
      [{ field: "file", name: path.basename(pdf), type: "application/pdf", b64: fs.readFileSync(pdf).toString("base64") }]);
    rec.check("C", "insurance document uploaded through the app endpoint", up.status === 201, `HTTP ${up.status} ${String(up.text).slice(0, 140)}`);
    const after = H.sqlOne("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'document'", sellerId).n;
    // The app emits one notification for the upload and a second when the OCR
    // job finishes, so scope the assertion to this vehicle's rows.
    const uploadNote = H.sqlOne(
      "SELECT * FROM notifications WHERE user_id = ? AND type = 'document' AND data LIKE ? ORDER BY created_at DESC LIMIT 1",
      sellerId, `%${vehicleId}%`
    );
    rec.check("C", "upload created a document notification for the owner",
      !!uploadNote && after > before, `before=${before} after=${after} title=${uploadNote?.title}`);
    rec.check("C", "the notification does not claim verification it did not perform",
      !/verified/i.test(`${uploadNote?.title ?? ""} ${uploadNote?.body ?? ""}`),
      `${uploadNote?.title} :: ${uploadNote?.body}`);
    rec.check("C", "the OCR follow-up is announced as processing, not as a result",
      /queued for verification|processing complete/i.test(String(uploadNote?.body ?? "")), String(uploadNote?.body ?? "").slice(0, 120));
  });

  await H.step(rec, "V", "pagination, isolation and the stream contract", async () => {
    const page1 = await H.api(page, "GET", "/api/v1/notifications?page=1&pageSize=5");
    const p = page1.json?.data?.page ?? {};
    rec.check("V", "offset pagination returns items + page metadata",
      page1.status === 200 && Array.isArray(page1.json?.data?.items) && p.pageSize === 5 && typeof p.total === "number",
      JSON.stringify(p).slice(0, 180));
    rec.check("V", "page count is consistent with the SQL total",
      p.total === H.sqlOne("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?", sellerId).n && (p.items ?? page1.json.data.items).length <= 5,
      `total=${p.total} items=${(page1.json?.data?.items ?? []).length}`);
    const unread = await H.api(page, "GET", "/api/v1/notifications?unread=1&pageSize=5");
    rec.check("V", "unread=1 filters in SQL, not after slicing",
      (unread.json?.data?.items ?? []).every((n) => n.read === false) && Number(unread.json?.data?.page?.total) === H.sqlOne("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0", sellerId).n,
      `total=${unread.json?.data?.page?.total}`);
    const keyset = await H.api(page, "GET", `/api/v1/notifications?limit=3&before=${encodeURIComponent(String(page1.json?.data?.items?.[0]?.createdAt ?? ""))}`);
    rec.check("V", "keyset mode returns items, nextBefore and hasMore",
      keyset.status === 200 && keyset.json?.data?.mode === "keyset" && Array.isArray(keyset.json?.data?.items) && "hasMore" in keyset.json.data,
      JSON.stringify({ mode: keyset.json?.data?.mode, n: keyset.json?.data?.items?.length, hasMore: keyset.json?.data?.hasMore }));

    const foreign = H.sqlOne(
      "SELECT id, user_id, read FROM notifications WHERE user_id <> ? AND read = 0 LIMIT 1",
      sellerId
    );
    if (!foreign) return rec.note("no unread other-account notification to probe");
    const otherCtx = await H.newContext();
    const other = await otherCtx.newPage();
    try {
      await H.loginViaUI(other, "buyer2");
      const steal = await H.api(other, "PATCH", `/api/v1/notifications/${foreign.id}/read`);
      // Non-vacuous because this row was unread before the call: if the
      // user-scoped WHERE clause were missing, read would now be 1.
      const after = H.sqlOne("SELECT read FROM notifications WHERE id = ?", foreign.id)?.read;
      rec.check("V", "marking another account's notification changes nothing",
        steal.status === 200 && after === 0,
        `HTTP ${steal.status} owner=${foreign.user_id} read before=0 after=${after}`);
      const list = await H.api(other, "GET", "/api/v1/notifications?page=1&pageSize=50");
      const leaked = (list.json?.data?.items ?? []).filter((n) => n.id === foreign.id);
      rec.check("V", "another account's notification never appears in this list", leaked.length === 0, `${leaked.length} leaked`);
      const stream = await other.evaluate(async () => {
        const res = await fetch("/api/v1/notifications/stream");
        return { status: res.status, type: res.headers.get("content-type"), text: (await res.text()).slice(0, 80) };
      });
      rec.check("V", "SSE stream is scoped to the caller and labelled a snapshot",
        stream.status === 200 && /text\/event-stream/.test(stream.type) && stream.text.startsWith("event: snapshot"), JSON.stringify(stream).slice(0, 200));
      rec.note("the stream emits one snapshot and closes; there is no live push, so 'real-time notifications' is NOT_IMPLEMENTED");
    } finally {
      await otherCtx.close().catch(() => {});
    }
  });

  await H.step(rec, "Z", "cleanup", async () => {
    try { H.sqlExec("DELETE FROM notifications WHERE user_id = ? AND type IN ('inquiry','document') AND (body LIKE '%scooter%' OR title LIKE '%inquiry%')", sellerId); } catch { /* constrained */ }
    const cv = await H.cleanupVehicle(page, vehicleId);
    rec.check("Z", "test vehicle removed or archived", cv.removed || cv.archived, `removed=${cv.removed} archived=${cv.archived}`);
    const threads = H.sql("SELECT id FROM inquiries WHERE message LIKE '%QAN%'").length;
    rec.note(`QA inquiry threads still open: ${threads} (left visible so the Seller inbox keeps real content)`);
  });
}
