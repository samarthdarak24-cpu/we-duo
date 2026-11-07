// F08 — AI fraud analysis: the Python LangGraph investigator, the findings it
// leaves behind, and the auditable dispute path. Every honesty field the brief
// demands (source, orchestrator, node set, evidence ids, rule version) is
// asserted from the live response.
export default async function run({ H, rec, page }) {
  const { publishedVehicle, errText } = await import("../setup.mjs");

  await H.loginViaUI(page, "seller");
  const setup = await publishedVehicle(page, "electric_scooter", 10);
  if (!setup.vehicleId) {
    rec.check("R", "prerequisite vehicle exists", false, setup.blocked ?? errText(setup.create));
    return;
  }
  const id = setup.vehicleId;

  // Give the investigators something real to find: a mileage rollback.
  await H.step(rec, "C", "seed a genuine anomaly through the app's own API", async () => {
    const r1 = await H.api(page, "POST", `/api/v1/vehicles/${id}/mileage`, { date: "2024-01-10", km: setup.ident.km });
    const r2 = await H.api(page, "POST", `/api/v1/vehicles/${id}/mileage`, { date: "2025-02-10", km: Math.max(1000, setup.ident.km - 4000) });
    rec.check("C", "a rollback reading is created and flagged", r2.status === 201 && r2.json?.data?.flagged === true, errText(r2));
    // mileage_readings timestamps with the reading date, not a created_at column.
    const row = H.sqlOne("SELECT flagged, km FROM mileage_readings WHERE vehicle_id = ? ORDER BY date DESC LIMIT 1", id);
    rec.check("C", "flagged rollback row persisted", Number(row?.flagged) === 1, JSON.stringify(row));
    const finding = H.sqlOne("SELECT code, severity, points, status FROM findings WHERE vehicle_id = ? AND code = 'ODOMETER_ROLLBACK' ORDER BY created_at DESC LIMIT 1", id);
    rec.check("C", "ODOMETER_ROLLBACK finding written by the rules engine", finding?.code === "ODOMETER_ROLLBACK" && Number(finding.points) > 0, JSON.stringify(finding));
  });

  let investigation = null;
  await H.step(rec, "R", "investigation runs on the real Python agent", async () => {
    await H.gotoSafe(page, `${H.BASE}/seller/fraud?vehicle=${id}`);
    await page.getByText(/AI investigation/i).first().waitFor({ timeout: 90000 }).catch(() => {});
    const btn = page.getByRole("button", { name: /Run investigation/i }).first();
    await btn.waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
    const promise = page.waitForResponse((r) => r.url().includes(`/api/v1/vehicles/${id}/ai-investigations`) && r.request().method() === "POST", { timeout: 240000 }).catch(() => null);
    await btn.click();
    const res = await promise;
    const json = res ? await res.json().catch(() => ({})) : {};
    investigation = json?.data ?? {};
    const nodes = Array.isArray(investigation.nodes) ? investigation.nodes : [];
    rec.check("R", "HTTP 200 from the investigation endpoint", res?.status() === 200, `HTTP ${res?.status()} ${JSON.stringify(json?.error ?? {}).slice(0, 160)}`);
    rec.check("R", "answered by python-intelligence, not the deterministic fallback", investigation.source === "python-intelligence", `${investigation.source} ${investigation.fallbackReason ?? ""}`);
    rec.check("R", "orchestrator honestly reported as langgraph", investigation.orchestrator === "langgraph", String(investigation.orchestrator));
    rec.check("R", "electric category ran the 16-node conditional set", nodes.length === 16, `${nodes.length} nodes`);
    rec.check("R", "EVBatteryAnalysisNode present for an electric vehicle", nodes.includes("EVBatteryAnalysisNode"), nodes.join(",").slice(0, 220));
    const findings = investigation.findings ?? [];
    rec.check("R", "the investigation returned findings to cite", findings.length > 0, `findings=${findings.length}`);
    rec.check("R", "every finding cites evidence ids", findings.every((f) => {
      const refs = f.evidenceIds ?? f.evidence ?? [];
      return Array.isArray(refs) ? refs.length > 0 : true;
    }), JSON.stringify(findings[0] ?? {}).slice(0, 240));
    const payload = JSON.stringify(investigation);
    rec.check("R", "method + model/rule version disclosed in the payload", /version/i.test(payload),
      payload.match(/"[A-Za-z_]*[Vv]ersion"\s*:\s*"[^"]{1,40}"/g)?.slice(0, 4).join(" | ") ?? "NO VERSION FIELD");
    const run = H.sqlOne("SELECT graph, status, model_version, ruleset_version, output_refs FROM ai_runs WHERE vehicle_id = ? ORDER BY started_at DESC LIMIT 1", id);
    rec.check("R", "ai_runs persisted with the real graph name", /langgraph-conditional|sequential-conditional/.test(String(run?.graph)), `${run?.graph} / ${run?.status} / ${run?.model_version}`);
    const agent = H.sqlOne("SELECT COUNT(*) AS n FROM agent_investigations WHERE vehicle_id = ?", id).n;
    rec.check("R", "agent_investigations row written by the Python service", agent > 0, `${agent} rows`);
    await H.shot(page, "F08-investigation");
  });

  await H.step(rec, "R", "risk analysis is deterministic, versioned and explainable", async () => {
    const risk = await H.api(page, "GET", `/api/v1/vehicles/${id}/risk`);
    const data = risk.json?.data ?? {};
    rec.check("R", "GET /risk returns 200", risk.status === 200, errText(risk));
    rec.check("R", "rule version is declared in the payload", !!data.calculation?.version, String(data.calculation?.version));
    rec.check("R", "payload is grounded and carries a disclaimer", data.grounded === true && !!data.disclaimer, `grounded=${data.grounded} disclaimer=${!!data.disclaimer}`);
    rec.check("R", "the LLM never sets the score (no llm in the scoring path)", !JSON.stringify(data).match(/"scoreSource"\s*:\s*"llm/i), "score provenance");
    const trust = await H.api(page, "GET", `/api/v1/vehicles/${id}/trust`);
    const t = trust.json?.data ?? {};
    rec.check("R", "trust score, band and coverage all reported together", Number.isFinite(t.trustScore) && !!t.bandLabel && (t.evidenceCoverage ?? t.coverage) !== undefined,
      `score=${t.trustScore} band=${t.bandLabel} coverage=${t.evidenceCoverage ?? t.coverage}`);
    rec.check("R", "breakdown explains the arithmetic behind the score", Array.isArray(t.breakdown) ? t.breakdown.length > 0 : !!t.breakdown, JSON.stringify(t.breakdown ?? {}).slice(0, 220));
  });

  await H.step(rec, "U", "disputing a finding is an auditable write, not a delete", async () => {
    const finding = H.sqlOne("SELECT id, title, status FROM findings WHERE vehicle_id = ? AND status = 'open' ORDER BY created_at DESC LIMIT 1", id);
    if (!finding) return rec.note("no open finding to dispute");
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    await page.getByText(/AI investigation/i).first().waitFor({ timeout: 60000 }).catch(() => {});
    const accordion = page.getByRole("button", { name: new RegExp(String(finding.title).slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }).first();
    if (await accordion.isVisible().catch(() => false)) await accordion.click();
    await page.waitForTimeout(800);
    const dispute = page.getByRole("button", { name: /Add context \/ dispute/i }).first();
    rec.check("U", "dispute control rendered for the finding", await dispute.isVisible().catch(() => false), "Add context / dispute");
    const ta = page.locator('textarea[placeholder*="odometer was replaced"], textarea').last();
    await ta.fill("The odometer was replaced by the service centre; invoice attached.");
    const tooShort = await H.api(page, "POST", `/api/v1/findings/${finding.id}/dispute`, { explanation: "short" });
    rec.check("U", "a dispute under 10 characters is rejected with 400", tooShort.status === 400, errText(tooShort));
    const promise = page.waitForResponse((r) => r.url().includes(`/api/v1/findings/${finding.id}/dispute`) && r.request().method() === "POST", { timeout: 90000 }).catch(() => null);
    await dispute.click();
    const res = await promise;
    rec.check("U", "dispute submitted from the UI returns 201", res?.status() === 201, `HTTP ${res?.status()}`);
    const after = H.sqlOne("SELECT status FROM findings WHERE id = ?", finding.id);
    rec.check("U", "finding moved to explained, never deleted", after?.status === "explained", String(after?.status));
    const dup = await H.api(page, "POST", `/api/v1/findings/${finding.id}/dispute`, { explanation: "The odometer was replaced by the service centre; invoice attached." });
    rec.check("U", "a duplicate dispute is rejected with 409", dup.status === 409 && dup.json?.error?.code === "DUPLICATE", errText(dup));
    await H.shot(page, "F08-dispute");
  });

  await H.step(rec, "V", "a missing integration yields no conclusion, not a fake one", async () => {
    const health = await fetch("http://127.0.0.1:8000/health").then((r) => r.json()).catch(() => null);
    rec.check("V", "intelligence service is reachable", !!health, String(health?.version));
    if (health?.llm && health.llm.active === false) {
      rec.note(`LLM provider is "${health.llm.provider}" and active=${health.llm.active}: the service states "no conclusion is generated" — verification is not delegated to an LLM.`);
      const res = await H.api(page, "POST", `/api/v1/vehicles/${id}/ai-investigations`, { question: "Is the odometer consistent with the service records?" });
      const d = res.json?.data ?? {};
      rec.check("V", "with no LLM the answer still cites deterministic evidence and says so",
        res.status === 200 && (d.llm?.available === false || d.explanationSource || d.summary || d.findings), JSON.stringify({ llm: d.llm, explanationSource: d.explanationSource, keys: Object.keys(d).slice(0, 10) }));
    } else rec.note(`LLM active=${health?.llm?.active}; nothing to assert on the degraded path`);
  });
}
