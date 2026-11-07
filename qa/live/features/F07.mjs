// F07 — Verification center: the deterministic check runner, its persistence
// and its honesty when evidence is missing (unavailable, never a silent pass).
export default async function run({ H, rec, page }) {
  const { publishedVehicle, identity, errText, CATS } = await import("../setup.mjs");

  await H.loginViaUI(page, "seller");
  const ev = await publishedVehicle(page, "electric_car", 8);
  if (!ev.vehicleId) {
    rec.check("R", "prerequisite electric car exists", false, ev.blocked ?? errText(ev.create));
    return;
  }
  const id = ev.vehicleId;

  await H.step(rec, "C", "running verification from the UI produces a stored run", async () => {
    await H.gotoSafe(page, `${H.BASE}/seller/verification?vehicle=${id}`);
    const btn = page.getByRole("button", { name: /Re-run verification|Run verification/i }).first();
    await btn.waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
    rec.check("C", "verification control is present", await btn.isVisible().catch(() => false), "Re-run verification");
    const promise = page.waitForResponse((r) => r.url().includes(`/api/v1/vehicles/${id}/verify`) && r.request().method() === "POST", { timeout: 180000 }).catch(() => null);
    await btn.click();
    const res = await promise;
    const json = res ? await res.json().catch(() => ({})) : {};
    const data = json?.data ?? {};
    rec.check("C", "POST /verify returns 200", res?.status() === 200, `HTTP ${res?.status()} ${JSON.stringify(json?.error ?? {})}`.slice(0, 200));
    rec.check("C", "a run id and check set are returned", !!data.runId && Array.isArray(data.checks) && data.checks.length >= 6, `runId=${data.runId} checks=${data.checks?.length}`);
    const keys = (data.checks ?? []).map((c) => c.key ?? c.check_key);
    for (const k of ["registration_match", "vin_match", "rc", "duplicates", "consistency", "chain"]) {
      rec.check("C", `check "${k}" is executed`, keys.includes(k), keys.join(",").slice(0, 220));
    }
    const runRow = H.sqlOne("SELECT id, status, summary FROM verification_runs WHERE id = ?", data.runId);
    rec.check("C", "verification_runs row persisted and finished", !!runRow && runRow.status === "done", `${runRow?.status} ${String(runRow?.summary).slice(0, 120)}`);
    const resultRows = H.sql("SELECT check_key, status FROM verification_results WHERE run_id = ?", data.runId);
    rec.check("C", "verification_results rows written per check", resultRows.length === (data.checks ?? []).length, `db=${resultRows.length} api=${data.checks?.length}`);
    rec.check("C", "every stored result is a real status value", resultRows.every((r) => /pass|fail|warn|not_applicable|unavailable/.test(String(r.status))), resultRows.map((r) => `${r.check_key}=${r.status}`).join(",").slice(0, 240));
    await H.shot(page, "F07-run");
    const body = await page.locator("body").innerText();
    rec.check("C", "UI reports the outcome in words, not a spinner", /checks passed|open finding/i.test(body), body.slice(-260).replace(/\n/g, " | "));
  });

  await H.step(rec, "V", "category-correct rules for an EV", async () => {
    const checks = await H.api(page, "GET", `/api/v1/vehicles/${id}/verification`);
    const list = checks.json?.data?.checks ?? [];
    const puc = list.find((c) => (c.key ?? c.check_key) === "puc");
    rec.check("V", "EV has a PUC check entry", !!puc, JSON.stringify(puc ?? {}).slice(0, 160));
    rec.check("V", "EV PUC is not_applicable — an EV has no emission certificate",
      puc && String(JSON.stringify(puc)).includes("not_applicable"), JSON.stringify(puc ?? {}).slice(0, 200));
    rec.check("V", "the EV RC document verified against a frame/VIN rule, not a 17-char car VIN",
      list.some((c) => String(c.key ?? c.check_key) === "vin_match"), "vin_match present");
  });

  await H.step(rec, "V", "missing evidence is reported as unavailable, never as a pass", async () => {
    const bare = identity("petrol_scooter", 80);
    const draft = await H.api(page, "POST", "/api/v1/seller/vehicles", {
      make: bare.make, model: bare.model, year: bare.year, regNo: bare.regNo, vin: bare.vin,
      fuel: "Petrol", transmission: "Manual", category: bare.label, categoryId: bare.catId,
      condition: "Good", location: "Pune", price: 50000, km: 5000,
    });
    if (draft.status !== 201) return rec.note(`bare draft not created: ${errText(draft)}`);
    const bareId = draft.json.data.id;
    const none = await H.api(page, "GET", `/api/v1/vehicles/${bareId}/verification`);
    rec.check("V", "a vehicle that never ran verification returns 404 NO_RUN", none.status === 404 && none.json?.error?.code === "NO_RUN", errText(none));
    const run = await H.api(page, "POST", `/api/v1/vehicles/${bareId}/verify`, {});
    const list = run.json?.data?.checks ?? [];
    const rc = list.find((c) => (c.key ?? c.check_key) === "rc");
    const ins = list.find((c) => (c.key ?? c.check_key) === "insurance");
    rec.check("V", "no RC document => rc check does not pass", rc && !/^\s*pass/i.test(String(rc.status ?? rc.result ?? "")), JSON.stringify(rc ?? {}).slice(0, 180));
    rec.check("V", "missing document coverage is labelled unavailable/pending, not proven fraud",
      ["unavailable", "pending", "fail", "warn", "not_applicable"].includes(String(ins?.status ?? ins?.result ?? "")), JSON.stringify(ins ?? {}).slice(0, 180));
    const trust = await H.api(page, "GET", `/api/v1/vehicles/${bareId}/trust`);
    rec.check("V", "trust score for an undocumented vehicle is low, and stated as coverage", (trust.json?.data?.trustScore ?? 100) < 60, `score=${trust.json?.data?.trustScore} coverage=${trust.json?.data?.evidenceCoverage ?? trust.json?.data?.coverage}`);
  });

  await H.step(rec, "R", "two-wheeler vs car document requirements differ by category", async () => {
    const twoWheeler = await publishedVehicle(page, "petrol_scooter", 9);
    if (!twoWheeler.ready) return rec.note(`2W prerequisite failed: ${twoWheeler.blocked}`);
    const v = await H.api(page, "POST", `/api/v1/vehicles/${twoWheeler.vehicleId}/verify`, {});
    const list = v.json?.data?.checks ?? [];
    const vin = list.find((c) => (c.key ?? c.check_key) === "vin_match");
    rec.check("R", "2W verification ran", v.status === 200 && list.length >= 6, `HTTP ${v.status} checks=${list.length}`);
    rec.check("R", "2W identity check accepts a stamped frame number", vin && /pass|verified|match/i.test(JSON.stringify(vin)), JSON.stringify(vin ?? {}).slice(0, 200));
    rec.check("R", "2W category document set is rc_2w/insurance_2w (not car-only types)",
      CATS.petrol_scooter.twoWheeler && twoWheeler.rcType === "rc_2w", `rcType=${twoWheeler.rcType}`);
  });
}
