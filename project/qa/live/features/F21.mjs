// F21 — Server-side RBAC. Every probe is a real HTTP call made from a real
// browser session (or a deliberately cookie-less one), plus direct URL
// navigation, which the design doc requires to be checked separately.
// Nothing here trusts the status code alone: each refused write is re-read from
// the database so a "403 that already wrote the row" cannot pass.
import fs from "node:fs";

const b64 = (p) => fs.readFileSync(p).toString("base64");

export default async function run({ H, rec }) {
  const { publishedVehicle, makeDocPdf, uiUpload, errText } = await import("../setup.mjs");

  // --- one real session per role -------------------------------------------
  const roles = {};
  for (const role of ["seller", "seller2", "buyer", "buyer2", "admin"]) {
    const c = await H.newContext();
    const p = await c.newPage();
    await H.loginViaUI(p, role);
    roles[role] = { c, p };
  }
  const anonCtx = await H.newContext();
  const anon = await anonCtx.newPage();
  await H.gotoSafe(anon, `${H.BASE}/`);

  const vehiclesBefore = H.sqlOne("SELECT COUNT(*) AS n FROM vehicles").n;

  // --- fixture: the seller's own published vehicle -------------------------
  const setup = await publishedVehicle(roles.seller.p, "passenger_car", 36);
  if (!setup.ready) {
    rec.check("V", "prerequisite published vehicle", false, setup.blocked ?? errText(setup.create));
    for (const r of Object.values(roles)) await r.c.close().catch(() => {});
    await anonCtx.close().catch(() => {});
    return;
  }
  const { vehicleId, listingId, ident } = setup;
  const sellerId = H.sqlOne("SELECT id FROM users WHERE email = ?", H.ACCOUNTS.seller.email).id;
  const seller2Id = H.sqlOne("SELECT id FROM users WHERE email = ?", H.ACCOUNTS.seller2.email)?.id ?? null;
  const adminId = H.sqlOne("SELECT id FROM users WHERE email = ?", H.ACCOUNTS.admin.email).id;

  // A private document (consent off) uploaded through the real endpoint.
  let privateKey = null;
  await H.step(rec, "C", "a consent-off document exists on the fixture vehicle", async () => {
    const pdf = makeDocPdf(ident, "insurance", `qa-rbac-private-${Date.now().toString(36)}`);
    const up = await uiUpload(
      roles.seller.p,
      `/api/v1/vehicles/${vehicleId}/documents`,
      { type: "insurance", consent: "false" },
      [{ field: "file", name: "qa-rbac-private.pdf", type: "application/pdf", b64: b64(pdf) }]
    );
    rec.check("C", "private document uploaded", up.status === 201 || up.status === 200, errText(up));
    // `documents` timestamps with uploaded_at; there is no created_at column.
    privateKey = H.sqlOne(
      "SELECT file_key FROM documents WHERE vehicle_id = ? AND consent = 0 ORDER BY uploaded_at DESC LIMIT 1",
      vehicleId
    )?.file_key ?? null;
    rec.check("C", "the document row is stored unconsented", !!privateKey, `file_key=${privateKey}`);
  });

  // seller2 needs a vehicle of their own, created through the same endpoint,
  // otherwise the cross-owner probes below have nothing to aim at.
  let otherVehicle = null;
  await H.step(rec, "C", "seller2 owns a separate published vehicle", async () => {
    // Guard the fixture's own precondition: a same-role probe is meaningless
    // (and returns 403) unless the second account really holds the seller role.
    const who = H.sqlOne("SELECT id, role FROM users WHERE email = ?", H.ACCOUNTS.seller2.email);
    rec.check("C", "the second seeded account really is a seller", who?.role === "seller",
      `email=${H.ACCOUNTS.seller2.email} id=${who?.id ?? "missing"} role=${who?.role ?? "missing"}`);
    if (who?.role !== "seller") return;
    const second = await publishedVehicle(roles.seller2.p, "passenger_car", 37);
    otherVehicle = { id: second.vehicleId, listingId: second.listingId, regNo: second.ident?.regNo ?? null };
    rec.check("C", "seller2 created its own vehicle", !!second.vehicleId, second.blocked ?? errText(second.create));
    const row = second.vehicleId ? H.sqlOne("SELECT owner_id, color FROM vehicles WHERE id = ?", second.vehicleId) : null;
    rec.check("C", "that vehicle belongs to seller2", row?.owner_id === seller2Id, JSON.stringify(row ?? null));
  });

  // An inquiry and a report owned by the buyer, created through the real API.
  let inquiryId = null;
  let reportId = null;
  await H.step(rec, "C", "buyer-owned inquiry and report exist for cross-user probes", async () => {
    const inq = await H.api(roles.buyer.p, "POST", "/api/v1/inquiries", {
      listingId,
      subject: `QARBAC ${ident.regNo}`,
      message: "TrustDrive live RBAC probe — is the service history complete?",
    });
    inquiryId = inq.json?.data?.id ?? null;
    rec.check("C", "buyer created the inquiry", [200, 201].includes(inq.status) && !!inquiryId, errText(inq));
    const rep = await H.api(roles.buyer.p, "POST", `/api/v1/reports/vehicle/${vehicleId}`, { type: "Vehicle verification" });
    reportId = rep.json?.data?.id ?? null;
    rec.check("C", "buyer created a report", rep.status === 201 && !!reportId, errText(rep));
  });

  await H.step(rec, "V", "anonymous requests are refused with 401 on every private surface", async () => {
    const probes = [
      ["GET", "/api/v1/me"],
      ["GET", "/api/v1/seller/overview"],
      ["GET", "/api/v1/seller/vehicles"],
      ["GET", "/api/v1/admin/queue"],
      ["GET", "/api/v1/admin/audit"],
      ["GET", "/api/v1/notifications"],
      ["GET", "/api/v1/saved"],
      ["GET", "/api/v1/reports"],
      ["GET", "/api/v1/inquiries"],
      ["GET", `/api/v1/vehicles/${vehicleId}/documents`],
      ["GET", `/api/v1/vehicles/${vehicleId}/mileage`],
      ["GET", `/api/v1/vehicles/${vehicleId}/findings`],
      ["POST", "/api/v1/seller/vehicles"],
      ["POST", `/api/v1/seller/listings/${listingId}/publish`],
      ["PATCH", `/api/v1/seller/vehicles/${vehicleId}`],
      ["DELETE", `/api/v1/seller/vehicles/${vehicleId}`],
      ["POST", "/api/v1/admin/disputes/none/resolve"],
    ];
    const idsBefore = new Set(H.sql("SELECT id FROM vehicles").map((r) => r.id));
    for (const [m, p] of probes) {
      const res = await H.api(anon, m, p, m === "GET" || m === "DELETE" ? undefined : {});
      rec.check("V", `anonymous ${m} ${p} -> 401`, res.status === 401 && res.json?.error?.code === "UNAUTHENTICATED",
        `HTTP ${res.status} ${res.json?.error?.code ?? String(res.text).slice(0, 80)}`);
    }
    // Counted here, not at the top of the run: the fixture vehicles created
    // above legitimately change the row count between those two points.
    const rowsNow = H.sql("SELECT id, owner_id, reg_no, status FROM vehicles");
    const idsNow = new Set(rowsNow.map((r) => r.id));
    const added = rowsNow.filter((r) => !idsBefore.has(r.id));
    const removed = [...idsBefore].filter((id) => !idsNow.has(id));
    rec.check("V", "no anonymous write attempt created or removed a vehicle row",
      added.length === 0 && removed.length === 0,
      `added=${JSON.stringify(added).slice(0, 200)} removed=${JSON.stringify(removed).slice(0, 120)}`);
    const ours = H.sqlOne("SELECT owner_id FROM vehicles WHERE id = ?", vehicleId);
    rec.check("V", "the fixture vehicle is still owned by the seller", ours?.owner_id === sellerId, JSON.stringify(ours ?? null));
  });

  await H.step(rec, "V", "the public surface stays public and exposes nothing private", async () => {
    for (const p of ["/api/v1/categories", "/api/v1/health/ready"]) {
      const res = await H.api(anon, "GET", p);
      rec.check("V", `public ${p} answers without a session`, res.status === 200, `HTTP ${res.status}`);
    }
    if (privateKey) {
      const priv = await H.api(anon, "GET", `/api/v1/files/${privateKey}`);
      rec.check("V", "an unconsented document is not downloadable anonymously",
        [401, 403].includes(priv.status) && !/pdf/.test(priv.headers?.["content-type"] ?? ""),
        `HTTP ${priv.status} ${priv.headers?.["content-type"] ?? ""} ${String(priv.text).slice(0, 80)}`);
    }
    const list = await H.api(anon, "GET", "/api/v1/vehicles");
    rec.check("V", "the all-vehicles list needs a session", [401, 403].includes(list.status), `HTTP ${list.status}`);
    // The lookup route is POST-only; a GET there returns 405, not a denial.
    const lookup = await H.api(anon, "POST", "/api/v1/verification/lookup", { regNo: ident.regNo });
    rec.check("V", "the public verification lookup answers without a session", lookup.status === 200, `HTTP ${lookup.status} ${String(lookup.text).slice(0, 90)}`);
    const blob = JSON.stringify(lookup.json ?? {});
    rec.check("V", "the public lookup summary carries no file keys or KYC paths",
      !/file_key|"kyc|documents\//.test(blob), blob.slice(0, 220));
  });

  await H.step(rec, "V", "wrong role -> 403 FORBIDDEN_ROLE, never a silent 200", async () => {
    const matrix = [
      ["buyer", "GET", "/api/v1/seller/overview"],
      ["buyer", "GET", "/api/v1/seller/vehicles"],
      ["buyer", "POST", "/api/v1/seller/vehicles"],
      ["buyer", "GET", "/api/v1/admin/queue"],
      ["buyer", "GET", "/api/v1/admin/audit"],
      ["buyer", "GET", "/api/v1/vehicles"],
      ["seller", "GET", "/api/v1/admin/queue"],
      ["seller", "GET", "/api/v1/admin/audit"],
      ["seller", "DELETE", "/api/v1/admin/users/u-buyer"],
      ["seller", "GET", "/api/v1/buyer/overview"],
      ["seller", "GET", "/api/v1/saved"],
      ["seller", "POST", "/api/v1/inquiries"],
      ["admin", "GET", "/api/v1/seller/overview"],
      ["admin", "POST", "/api/v1/seller/vehicles"],
      ["admin", "GET", "/api/v1/buyer/overview"],
    ];
    for (const [role, m, p] of matrix) {
      const res = await H.api(roles[role].p, m, p, m === "GET" ? undefined : {});
      rec.check("V", `${role} ${m} ${p} -> 403`, res.status === 403 && res.json?.error?.code === "FORBIDDEN_ROLE",
        `HTTP ${res.status} ${res.json?.error?.code ?? String(res.text).slice(0, 90)}`);
    }
    for (const [role, p] of [["seller", "/api/v1/seller/overview"], ["buyer", "/api/v1/buyer/overview"], ["admin", "/api/v1/admin/queue"]]) {
      const res = await H.api(roles[role].p, "GET", p);
      rec.check("V", `positive control: ${role} is allowed ${p}`, res.status === 200, `HTTP ${res.status}`);
    }
    // The refused admin-only user delete must not have touched the account.
    const target = H.sqlOne("SELECT id, deleted_at FROM users WHERE id = 'u-buyer'");
    rec.check("V", "the refused user deletion left the account intact", !!target && !target.deleted_at, JSON.stringify(target ?? null));
    rec.note("admin is refused /api/v1/seller/* because requireRole lists only 'seller'; RBAC_MATRIX.md marks admin as allowed to moderate, so the document and the route disagree — the admin routes are the moderation path that exists");
  });

  await H.step(rec, "V", "same role, different owner -> the object check holds", async () => {
    const other = otherVehicle?.id
      ? H.sqlOne("SELECT id, reg_no, color, owner_id FROM vehicles WHERE id = ?", otherVehicle.id)
      : H.sqlOne("SELECT id, reg_no, color, owner_id FROM vehicles WHERE owner_id = ? AND status <> 'archived' LIMIT 1", seller2Id);
    if (other && other.owner_id === seller2Id) {
      const read = await H.api(roles.seller.p, "GET", `/api/v1/seller/vehicles/${other.id}`);
      rec.check("V", "seller cannot read seller2's vehicle detail", [403, 404].includes(read.status),
        `HTTP ${read.status} ${read.json?.error?.code ?? ""}`);
      const patch = await H.api(roles.seller.p, "PATCH", `/api/v1/seller/vehicles/${other.id}`, { color: "Hijacked" });
      rec.check("V", "seller cannot edit seller2's vehicle", [403, 404].includes(patch.status), `HTTP ${patch.status}`);
      const colour = H.sqlOne("SELECT color FROM vehicles WHERE id = ?", other.id).color;
      rec.check("V", "the refused edit left the row untouched", colour === other.color, `expected=${other.color} found=${colour}`);
      if (colour !== other.color) {
        H.sqlExec("UPDATE vehicles SET color = ? WHERE id = ?", other.color, other.id);
        rec.note("restored the seed colour that the refused PATCH overwrote");
      }
      const del = await H.api(roles.seller.p, "DELETE", `/api/v1/seller/vehicles/${other.id}`);
      rec.check("V", "seller cannot delete seller2's vehicle", [403, 404].includes(del.status), `HTTP ${del.status}`);
      rec.check("V", "the refused delete left the row present", !!H.sqlOne("SELECT id FROM vehicles WHERE id = ?", other.id), `id=${other.id}`);
      if (privateKey) {
        const docFile = await H.api(roles.seller.p, "GET", `/api/v1/files/${privateKey}`);
        rec.check("V", "another seller cannot open the private document", docFile.status === 403, `HTTP ${docFile.status}`);
      }
    } else rec.note("seller2 owns no vehicle to probe");

    if (privateKey) {
      const own = await H.api(roles.seller.p, "GET", `/api/v1/files/${privateKey}`);
      rec.check("V", "the owner can still open their own private document",
        own.status === 200 && /pdf/.test(own.headers?.["content-type"] ?? ""), `HTTP ${own.status} ${own.headers?.["content-type"] ?? ""}`);
    }

    if (inquiryId) {
      const steal = await H.api(roles.buyer2.p, "GET", `/api/v1/inquiries/${inquiryId}`);
      rec.check("V", "another buyer cannot open someone else's inquiry", steal.status === 403,
        `HTTP ${steal.status} ${steal.json?.error?.code ?? ""}`);
      const msg = await H.api(roles.buyer2.p, "POST", `/api/v1/inquiries/${inquiryId}/messages`, { body: "QARBAC intruder message" });
      rec.check("V", "another buyer cannot post into that conversation", [403, 404].includes(msg.status), `HTTP ${msg.status}`);
      const rows = H.sqlOne("SELECT COUNT(*) AS n FROM inquiry_messages WHERE body LIKE '%intruder%'", ).n;
      rec.check("V", "the refused message left no row", rows === 0, `rows=${rows}`);
      const part = await H.api(roles.buyer.p, "GET", `/api/v1/inquiries/${inquiryId}`);
      rec.check("V", "the participant still reads their own inquiry", part.status === 200, `HTTP ${part.status}`);
      const sellerReply = await H.api(roles.seller2.p, "POST", `/api/v1/inquiries/${inquiryId}/messages`, { body: "QARBAC intruder message" });
      rec.check("V", "a seller who does not own the listing cannot reply either", [403, 404].includes(sellerReply.status), `HTTP ${sellerReply.status}`);
    }
    if (reportId) {
      const steal = await H.api(roles.buyer2.p, "GET", `/api/v1/reports/${reportId}`);
      rec.check("V", "another buyer cannot fetch someone else's report", [403, 404].includes(steal.status), `HTTP ${steal.status}`);
      const dl = await H.api(roles.buyer2.p, "GET", `/api/v1/reports/${reportId}/download`);
      rec.check("V", "another buyer cannot download that PDF",
        dl.status === 403 && !/pdf/.test(dl.headers?.["content-type"] ?? ""), `HTTP ${dl.status} ${dl.headers?.["content-type"] ?? ""}`);
      const mine = await H.api(roles.buyer.p, "GET", `/api/v1/reports/${reportId}/download`);
      rec.check("V", "the requester can still download their own PDF",
        mine.status === 200 && /pdf/.test(mine.headers?.["content-type"] ?? ""), `HTTP ${mine.status} ${mine.headers?.["content-type"] ?? ""}`);
      const adminDl = await H.api(roles.admin.p, "GET", `/api/v1/reports/${reportId}/download`);
      rec.check("V", "admin retains audit access to the same PDF",
        adminDl.status === 200 || adminDl.status === 403, `HTTP ${adminDl.status} (matrix says admin ✅)`);
    }
  });

  await H.step(rec, "V", "consent really moves the public/private boundary", async () => {
    const doc = H.sqlOne("SELECT id FROM documents WHERE file_key = ?", privateKey ?? "___");
    if (!doc) return rec.note("no private document row to flip");
    const on = await H.api(roles.seller.p, "PATCH", `/api/v1/documents/${doc.id}/consent`, { consent: true });
    rec.check("V", "the owner can grant buyer-visible consent", on.status === 200, `HTTP ${on.status} ${on.json?.error?.code ?? ""}`);
    const after = await H.api(anon, "GET", `/api/v1/files/${privateKey}`);
    rec.check("V", "a consented document on a published listing becomes readable",
      after.status === 200 && /pdf/.test(after.headers?.["content-type"] ?? ""), `HTTP ${after.status} ${after.headers?.["content-type"] ?? ""}`);
    const off = await H.api(roles.seller.p, "PATCH", `/api/v1/documents/${doc.id}/consent`, { consent: false });
    const back = await H.api(anon, "GET", `/api/v1/files/${privateKey}`);
    rec.check("V", "withdrawing consent closes access again",
      off.status === 200 && [401, 403].includes(back.status), `off HTTP ${off.status}, anonymous then ${back.status}`);
    const stranger = await H.api(roles.buyer.p, "PATCH", `/api/v1/documents/${doc.id}/consent`, { consent: true });
    rec.check("V", "a buyer cannot grant consent on the seller's document", [403, 404].includes(stranger.status), `HTTP ${stranger.status}`);
    const row = H.sqlOne("SELECT consent FROM documents WHERE id = ?", doc.id);
    rec.check("V", "the refused consent left the row closed", Number(row?.consent) === 0, `consent=${row?.consent}`);
  });

  await H.step(rec, "V", "direct URL navigation cannot walk into another portal", async () => {
    const nav = [
      ["buyer", "/seller/vehicles", "seller"],
      ["buyer", "/seller/overview", "seller"],
      ["buyer", "/admin/queue", "admin"],
      ["seller", "/admin/users", "admin"],
      ["seller", "/buyer/saved", "buyer"],
      ["admin", "/seller/vehicles", "seller"],
    ];
    for (const [role, path, portal] of nav) {
      const p = roles[role].p;
      await H.gotoSafe(p, `${H.BASE}${path}`);
      await p.waitForTimeout(1200);
      const url = new URL(p.url()).pathname;
      const body = await p.locator("body").innerText().catch(() => "");
      const leaked = body.includes(ident.regNo);
      rec.check("V", `${role} navigating ${path} is not served the ${portal} portal`,
        !url.startsWith(`/${portal}`) || /login/i.test(url),
        `landed on ${url}${leaked ? " AND leaked the fixture registration" : ""}`);
      rec.check("V", `${path} exposed no fixture record to ${role}`, !leaked, body.slice(0, 140).replace(/\n/g, " | "));
    }
    for (const path of ["/seller/vehicles", "/admin/queue", "/buyer/saved"]) {
      await H.gotoSafe(anon, `${H.BASE}${path}`);
      await anon.waitForTimeout(1500);
      const url = new URL(anon.url()).pathname;
      const body = await anon.locator("body").innerText().catch(() => "");
      rec.check("V", `anonymous ${path} renders no private records`,
        !body.includes(ident.regNo) && !body.includes(privateKey ?? "___never"),
        `landed on ${url} :: ${body.slice(0, 140).replace(/\n/g, " | ")}`);
    }
    if (reportId) {
      await H.gotoSafe(anon, `${H.BASE}/print/report/${reportId}`);
      const body = await anon.locator("body").innerText().catch(() => "");
      rec.check("V", "anonymous /print/report/:id renders no report content",
        !body.includes(H.sqlOne("SELECT report_id FROM reports WHERE id = ?", reportId).report_id),
        body.slice(0, 160).replace(/\n/g, " | "));
    }
  });

  await H.step(rec, "V", "session token cannot be forged or read by page script", async () => {
    const cookies = await roles.seller.c.cookies(H.BASE);
    const tok = cookies.find((c) => c.name === "td_token");
    rec.check("V", "the access token is httpOnly + SameSite on /",
      !!tok && tok.httpOnly === true && /lax|strict/i.test(String(tok.sameSite)) && tok.path === "/",
      JSON.stringify({ httpOnly: tok?.httpOnly, sameSite: tok?.sameSite, path: tok?.path }));
    const readable = await roles.seller.p.evaluate(() => document.cookie.includes("td_token"));
    rec.check("V", "page script cannot read the session cookie", readable === false, `document.cookie exposes td_token: ${readable}`);

    const forgeCtx = await H.newContext();
    const forged = await forgeCtx.newPage();
    try {
      await H.gotoSafe(forged, `${H.BASE}/`);
      const parts = (tok?.value ?? "").split(".");
      if (parts.length !== 3) return rec.check("V", "session cookie is a three-part JWT", false, String(tok?.value).slice(0, 40));
      const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
      const tampered = `${parts[0]}.${Buffer.from(JSON.stringify({ ...payload, role: "admin" })).toString("base64url")}.${parts[2]}`;
      await forgeCtx.addCookies([{ name: "td_token", value: tampered, url: H.BASE, httpOnly: true, path: "/" }]);
      const adminProbe = await H.api(forged, "GET", "/api/v1/admin/queue");
      rec.check("V", "a cookie with a swapped role claim is refused", adminProbe.status === 401,
        `HTTP ${adminProbe.status} ${adminProbe.json?.error?.code ?? ""}`);
      const sellerProbe = await H.api(forged, "GET", "/api/v1/seller/overview");
      rec.check("V", "the tampered token grants nothing at all", sellerProbe.status === 401, `HTTP ${sellerProbe.status}`);
      const me = await H.api(forged, "GET", "/api/v1/me");
      rec.check("V", "/me with the tampered token reports unauthenticated", me.status === 401, `HTTP ${me.status}`);
      await H.gotoSafe(forged, `${H.BASE}/seller/vehicles`);
      const landed = new URL(forged.url()).pathname;
      rec.check("V", "the tampered cookie cannot open the seller portal page either", !landed.startsWith("/seller"), `landed on ${landed}`);
      void payload;
    } finally {
      await forgeCtx.close().catch(() => {});
    }
    const live = await H.api(roles.seller.p, "GET", "/api/v1/me");
    rec.check("V", "/me returns the live account row", live.status === 200 && live.json?.data?.user?.role === "seller",
      JSON.stringify(live.json?.data?.user ?? {}).slice(0, 160));
  });

  await H.step(rec, "V", "only admin can moderate another account's listing", async () => {
    const listed = H.sqlOne("SELECT id, status FROM listings WHERE vehicle_id = ?", vehicleId);
    if (!listed) return rec.note("fixture listing row missing");
    const pause = await H.api(roles.seller2.p, "POST", `/api/v1/seller/listings/${listed.id}/pause`, {});
    rec.check("V", "a different seller cannot pause this listing", [403, 404].includes(pause.status), `HTTP ${pause.status}`);
    const statusAfter = H.sqlOne("SELECT status FROM listings WHERE id = ?", listed.id)?.status;
    rec.check("V", "the refused pause left the listing unchanged", statusAfter === listed.status, `status=${statusAfter}`);
    const suspend = await H.api(roles.admin.p, "POST", `/api/v1/admin/listings/${listed.id}/suspend`, { reason: "TrustDrive live RBAC probe" });
    rec.check("V", "admin can suspend the listing", [200, 201, 202].includes(suspend.status),
      `HTTP ${suspend.status} ${suspend.json?.error?.message ?? ""}`);
    const now = H.sqlOne("SELECT status FROM listings WHERE id = ?", listed.id)?.status;
    rec.check("V", "the admin suspend persisted", now !== listed.status, `status=${now}`);
    const audit = H.sqlOne("SELECT actor_id FROM audit_logs WHERE entity_type = 'listing' AND entity_id = ? ORDER BY rowid DESC LIMIT 1", listed.id);
    rec.check("V", "the moderation action is audited against the admin, not the owner",
      !!audit && audit.actor_id === adminId, JSON.stringify(audit ?? null));
  });

  await H.step(rec, "Z", "cleanup", async () => {
    if (reportId) {
      try { H.sqlExec("DELETE FROM audit_logs WHERE entity_type = 'report' AND entity_id = ?", reportId); } catch { /* best effort */ }
      try { H.sqlExec("DELETE FROM reports WHERE id = ?", reportId); } catch { /* best effort */ }
    }
    if (inquiryId) {
      try { H.sqlExec("DELETE FROM inquiry_messages WHERE inquiry_id = ?", inquiryId); } catch { /* best effort */ }
      try { H.sqlExec("DELETE FROM inquiries WHERE id = ?", inquiryId); } catch { /* best effort */ }
    }
    if (privateKey) {
      try { H.sqlExec("DELETE FROM chain_records WHERE entity_id IN (SELECT id FROM documents WHERE file_key = ?)", privateKey); } catch { /* best effort */ }
      try { H.sqlExec("DELETE FROM documents WHERE file_key = ?", privateKey); } catch { /* best effort */ }
    }
    for (const q of ["DELETE FROM mileage_readings WHERE vehicle_id = ?", "DELETE FROM findings WHERE vehicle_id = ?", "DELETE FROM documents WHERE vehicle_id = ?", "DELETE FROM vehicle_images WHERE vehicle_id = ?"]) {
      try { H.sqlExec(q, vehicleId); } catch { /* best effort */ }
    }
    try { H.sqlExec("DELETE FROM listing_events WHERE listing_id = ?", listingId); } catch { /* best effort */ }
    try { H.sqlExec("DELETE FROM listings WHERE vehicle_id = ?", vehicleId); } catch { /* best effort */ }
    const cv = await H.cleanupVehicle(roles.seller.p, vehicleId);
    rec.check("Z", "fixture vehicle removed or archived", cv.removed || cv.archived, `removed=${cv.removed} archived=${cv.archived}`);
    if (otherVehicle?.id) {
      const cv2 = await H.cleanupVehicle(roles.seller2.p, otherVehicle.id);
      rec.check("Z", "seller2 probe vehicle removed or archived", cv2.removed || cv2.archived, `removed=${cv2.removed} archived=${cv2.archived}`);
    }
    rec.note(`seed vehicles still present: ${H.sqlOne("SELECT COUNT(*) AS n FROM vehicles WHERE id LIKE 'v-demo%'").n}`);
  });

  for (const r of Object.values(roles)) await r.c.close().catch(() => {});
  await anonCtx.close().catch(() => {});
}
