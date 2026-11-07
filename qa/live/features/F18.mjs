// F18 — Reports / PDF. A report must be created by a real click, stored as a
// real row, and the bytes served by the download route must be a genuine PDF
// whose recorded hash matches the ledger. Demo content stays labelled demo.
export default async function run({ H, rec, page }) {
  const { publishedVehicle, errText } = await import("../setup.mjs");

  await H.loginViaUI(page, "seller");
  const setup = await publishedVehicle(page, "passenger_car", 33);
  if (!setup.ready) {
    rec.check("R", "prerequisite published vehicle", false, setup.blocked ?? errText(setup.create));
    return;
  }
  const { vehicleId, ident } = setup;
  let reportRowId = null;

  await H.step(rec, "C", "seller generates a PDF from the reports page", async () => {
    await H.gotoSafe(page, `${H.BASE}/seller/reports`);
    await H.waitForHydration(page, "select");
    const vehicleSel = page.getByLabel("Vehicle").first();
    await vehicleSel.waitFor({ state: "visible", timeout: 60000 });
    await vehicleSel.selectOption(vehicleId);
    await page.getByLabel("Report type").first().selectOption("Vehicle verification");
    const gp = page.waitForResponse(
      (r) => r.url().includes(`/api/v1/reports/vehicle/${vehicleId}`) && r.request().method() === "POST",
      { timeout: 120000 }
    ).catch(() => null);
    await page.getByRole("button", { name: /Generate PDF/i }).first().click();
    const res = await gp;
    const json = res ? await res.json().catch(() => ({})) : {};
    reportRowId = json?.data?.id ?? null;
    rec.check("C", "POST /reports/vehicle/:id returns 201", res?.status() === 201, `HTTP ${res?.status()} ${JSON.stringify(json?.error ?? {})}`.slice(0, 200));
    rec.check("C", "response carries a report id and a download url",
      !!json?.data?.reportId && !!json?.data?.downloadUrl, `${json?.data?.reportId} ${String(json?.data?.downloadUrl).slice(0, 60)}`);
    const row = H.sqlOne("SELECT * FROM reports WHERE id = ?", reportRowId ?? "");
    rec.check("C", "reports row inserted with the chosen type", !!row && row.type === "Vehicle verification", `${row?.type}/${row?.status}`);
    rec.check("C", "row is marked ready with generated_at and file_key",
      row?.status === "ready" && !!row?.generated_at && !!row?.file_key, `status=${row?.status} file_key=${row?.file_key}`);
    rec.check("C", "report id follows the documented RPT-<year>-NNNN shape", /^RPT-\d{4}-\d{4}$/.test(String(row?.report_id)), String(row?.report_id));
    const body = await page.locator("body").innerText();
    rec.check("C", "UI confirms the report with its id, not a generic success", body.includes("Report ready") && body.includes(String(row?.report_id)), body.slice(0, 260).replace(/\n/g, " | "));
    rec.check("C", "the reports table lists the new row", body.includes(ident.regNo), ident.regNo);
    await H.shot(page, "F18-generated");
  });

  await H.step(rec, "R", "downloaded bytes are a real PDF and the hash is recorded", async () => {
    const got = await page.evaluate(async (path) => {
      const res = await fetch(path, { credentials: "same-origin" });
      const buf = new Uint8Array(await res.arrayBuffer());
      return {
        status: res.status,
        type: res.headers.get("content-type"),
        disposition: res.headers.get("content-disposition"),
        sha: res.headers.get("x-report-sha256"),
        cache: res.headers.get("cache-control"),
        head: String.fromCharCode(...buf.slice(0, 8)),
        tail: String.fromCharCode(...buf.slice(-6)).trim(),
        bytes: buf.length,
      };
    }, `/api/v1/reports/${reportRowId}/download`);
    rec.check("R", "GET /reports/:id/download returns 200 application/pdf", got.status === 200 && /application\/pdf/.test(String(got.type)), JSON.stringify(got).slice(0, 240));
    rec.check("R", "payload is a genuine PDF document", got.head.startsWith("%PDF-") && got.bytes > 2000 && /EOF/.test(got.tail), `head=${got.head} bytes=${got.bytes}`);
    rec.check("R", "attachment filename is the report id", /\.pdf"?$/.test(String(got.disposition)) && String(got.disposition).includes("RPT-"), String(got.disposition));
    rec.check("R", "download is not cacheable", got.cache === "no-store", String(got.cache));
    const row = H.sqlOne("SELECT pdf_hash FROM reports WHERE id = ?", reportRowId);
    rec.check("R", "X-Report-SHA256 equals the hash stored in SQLite",
      /^[0-9a-f]{64}$/.test(String(got.sha)) && got.sha === row?.pdf_hash, `header=${String(got.sha).slice(0, 16)} db=${String(row?.pdf_hash).slice(0, 16)}`);
    const audit = H.sqlOne("SELECT action, after FROM audit_logs WHERE entity_type = 'report' AND entity_id = ? ORDER BY at DESC LIMIT 1", reportRowId);
    rec.check("R", "every download is audit-logged with the byte count", !!audit && /report\.download/.test(audit.action) && /bytes/.test(audit.after), `${audit?.action} ${String(audit?.after).slice(0, 120)}`);
  });

  await H.step(rec, "R", "report metadata endpoint reflects the same ledger", async () => {
    const meta = await H.api(page, "GET", `/api/v1/reports/${reportRowId}`);
    const d = meta.json?.data ?? {};
    rec.check("R", "GET /reports/:id returns report, vehicle, trust and chain",
      meta.status === 200 && !!d.report && !!d.vehicle && !!d.trust && !!d.chain, `HTTP ${meta.status} keys=${Object.keys(d).join(",")}`);
    rec.check("R", "reported trust score equals the computed one",
      d.trust?.trustScore === (await H.api(page, "GET", `/api/v1/vehicles/${vehicleId}/trust`)).json?.data?.trustScore,
      `report=${d.trust?.trustScore}`);
    rec.check("R", "chain integrity is reported as intact for a real record", d.chain?.intact === true, JSON.stringify(d.chain ?? {}).slice(0, 180));
    rec.note(`snapshotHash in metadata: ${JSON.stringify(d.report?.snapshotHash)} — reports.snapshot is never populated by the app (honest limitation)`);
    const list = await H.api(page, "GET", "/api/v1/reports");
    const mine = (list.json?.data ?? []).filter((r) => r.vehicleId === vehicleId || r.vehicle_id === vehicleId);
    rec.check("R", "the owning seller sees the report in their list", list.status === 200 && mine.length >= 1, `${mine.length} rows`);
  });

  await H.step(rec, "V", "report type is stored, unknown type rejected", async () => {
    const other = await H.api(page, "POST", `/api/v1/reports/vehicle/${vehicleId}`, { type: "Vehicle condition" });
    rec.check("V", "a second report type is accepted and persisted distinctly",
      other.status === 201 && H.sqlOne("SELECT type FROM reports WHERE id = ?", other.json?.data?.id ?? "")?.type === "Vehicle condition",
      `HTTP ${other.status}`);
    const bad = await H.api(page, "POST", `/api/v1/reports/vehicle/${vehicleId}`, { type: "Quantum Aura Scan" });
    rec.check("V", "an invented report type is rejected, never silently accepted",
      [400, 404].includes(bad.status) && bad.json?.error?.code === "VALIDATION_FAILED", `HTTP ${bad.status} ${bad.json?.error?.code}`);
    const ghost = await H.api(page, "POST", "/api/v1/reports/vehicle/v-does-not-exist", { type: "Vehicle verification" });
    rec.check("V", "report for an unknown vehicle yields 404 NOT_FOUND", ghost.status === 404 && ghost.json?.error?.code === "NOT_FOUND", `HTTP ${ghost.status} ${ghost.json?.error?.code}`);
    const two = H.sql("SELECT pdf_hash FROM reports WHERE vehicle_id = ?", vehicleId).filter((r) => r.pdf_hash);
    if (two.length >= 2) {
      rec.note(`byte-identical PDFs across types: ${new Set(two.map((r) => r.pdf_hash)).size === 1} — the report body is currently one fixed template (documented limitation, no per-type sections)`);
    }
  });

  await H.step(rec, "V", "a not-ready report never returns a fake PDF", async () => {
    const pending = H.sqlOne("SELECT id, status FROM reports WHERE status IN ('queued','processing') LIMIT 1");
    if (!pending) return rec.note("no queued/processing report row in the ledger to probe");
    const res = await H.api(page, "GET", `/api/v1/reports/${pending.id}/download`);
    rec.check("V", "pending report download is refused with 409 REPORT_NOT_READY",
      res.status === 409 && res.json?.error?.code === "REPORT_NOT_READY", `HTTP ${res.status} ${res.json?.error?.code} (${pending.status})`);
    rec.check("V", "the refusal is JSON, not PDF bytes", !/pdf/i.test(res.headers["content-type"] ?? ""), String(res.headers["content-type"]));
  });

  await H.step(rec, "V", "another account cannot read this report", async () => {
    const buyerCtx = await H.newContext();
    const buyer = await buyerCtx.newPage();
    try {
      await H.loginViaUI(buyer, "buyer2");
      const cross = await H.api(buyer, "GET", `/api/v1/reports/${reportRowId}/download`);
      rec.check("V", "cross-account download is 403 FORBIDDEN", cross.status === 403 && cross.json?.error?.code === "FORBIDDEN", `HTTP ${cross.status} ${cross.json?.error?.code}`);
      const list = await H.api(buyer, "GET", "/api/v1/reports");
      const leaked = (list.json?.data ?? []).filter((r) => (r.vehicleId ?? r.vehicle_id) === vehicleId);
      rec.check("V", "the report never appears in another user's list", leaked.length === 0, `${leaked.length} leaked rows`);
      const anon = await H.api(buyer, "GET", `/api/v1/reports/${reportRowId}`);
      rec.note(`buyer read of the seller's report metadata: HTTP ${anon.status} ${anon.json?.error?.code ?? ""}`);
    } finally {
      await buyerCtx.close().catch(() => {});
    }
  });

  await H.step(rec, "R", "print view and labelled demo sample", async () => {
    await H.gotoSafe(page, `${H.BASE}/print/report/${reportRowId}`);
    const body = await page.locator("body").innerText();
    rec.check("R", "print report renders real vehicle identity", body.includes(ident.regNo) && /Vehicle verification report/i.test(body), body.slice(0, 200).replace(/\n/g, " | "));
    rec.check("R", "print report includes evidence, audit chain and scan sections",
      /Evidence documents/i.test(body) && /Audit chain/i.test(body) && /Scan to verify/i.test(body), "section headings");
    await H.shot(page, "F18-print-report");

    const anon = await H.newContext();
    const anonPage = await anon.newPage();
    try {
      // about:blank has no base URL, so a relative fetch cannot be resolved.
      await H.gotoSafe(anonPage, `${H.BASE}/`);
      const sample = await anonPage.evaluate(async () => {
        const res = await fetch("/api/v1/public/sample-report");
        const buf = new Uint8Array(await res.arrayBuffer());
        return { status: res.status, demo: res.headers.get("x-trustdrive-demo-data"), type: res.headers.get("content-type"), head: String.fromCharCode(...buf.slice(0, 5)), bytes: buf.length };
      });
      rec.check("R", "public sample PDF is served and explicitly labelled demo data",
        sample.status === 200 && sample.head === "%PDF-" && !!sample.demo, JSON.stringify(sample).slice(0, 220));
    } finally {
      await anon.close().catch(() => {});
    }
  });

  await H.step(rec, "Z", "cleanup QA report rows", async () => {
    for (const q of ["DELETE FROM audit_logs WHERE entity_type = 'report' AND entity_id IN (SELECT id FROM reports WHERE vehicle_id = ?)", "DELETE FROM reports WHERE vehicle_id = ?"]) {
      try { H.sqlExec(q, vehicleId); } catch { /* constrained */ }
    }
    const left = H.sqlOne("SELECT COUNT(*) AS n FROM reports WHERE vehicle_id = ?", vehicleId).n;
    rec.check("Z", "QA report rows removed, seed reports untouched", left === 0, `rows=${left}`);
    const seed = H.sqlOne("SELECT COUNT(*) AS n FROM reports").n;
    rec.check("Z", "report table still holds its seeded history", seed > 0, `total=${seed}`);
    const cv = await H.cleanupVehicle(page, vehicleId);
    rec.check("Z", "test vehicle removed or archived", cv.removed || cv.archived, `removed=${cv.removed} archived=${cv.archived}`);
  });
}
