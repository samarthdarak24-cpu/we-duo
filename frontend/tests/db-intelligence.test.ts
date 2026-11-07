import { describe, it, expect } from "vitest";
import {
  addVehicleImage,
  claimJob,
  completeJob,
  countAuditLogs,
  countAccidents,
  createAccidentRecord,
  createAiAnalysis,
  createEvidence,
  createInspection,
  createInvestigation,
  enqueueJob,
  enqueueReview,
  failJob,
  getAiAnalysis,
  getAuditPage,
  getBuyerProfile,
  getEvidenceForVehicle,
  getInspections,
  getLatestTrustScore,
  getAccidentRecords,
  getSellerProfile,
  getTrustScoreHistory,
  getVehicleImages,
  listJobs,
  listReviewQueue,
  recordTrustScore,
  resolveReview,
  reviewInspection,
  setJobProgress,
  softDeleteVehicleImage,
  transact,
  updateInvestigation,
  upsertBuyerProfile,
  upsertSellerProfile,
  getInvestigation,
  listInvestigations,
} from "../lib/server/db-intelligence";
import { getDb, getSchemaUpgradeReport } from "../lib/server/db";
import { computeVehicleTrust, ensureTrustScoreSnapshot } from "../lib/server/data";
import { TRUST_VERSION } from "../lib/vehicle-categories";

// Phase 4 integration coverage: the intelligence entities must really exist in
// the shared database, enforce their constraints, and round-trip data.
describe("Phase 4 intelligence entities", () => {
  const vehicleId = "v-bmw";

  it("opens the shared connection with foreign keys enforced", () => {
    const conn = getDb();
    const fk = (conn.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys;
    expect(fk).toBe(1);
  });

  it("creates the nine Phase 4 tables", () => {
    const names = (
      getDb()
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as { name: string }[]
    ).map((r) => r.name);
    for (const t of [
      "seller_profiles",
      "buyer_profiles",
      "vehicle_images",
      "accident_records",
      "vehicle_inspections",
      "verification_evidence",
      "ai_analysis",
      "trust_scores",
      "background_jobs",
      "agent_investigations",
      "human_review_queue",
    ]) {
      expect(names, `missing table ${t}`).toContain(t);
    }
  });

  it("put real foreign keys on the pre-existing core tables", () => {
    const conn = getDb();
    const fkCount = (t: string) => (conn.prepare(`PRAGMA foreign_key_list(${t})`).all() as unknown[]).length;
    for (const t of ["vehicles", "documents", "listings", "inquiries", "history_events", "damage_records", "reports", "chain_records"]) {
      expect(fkCount(t), `${t} still has no foreign keys`).toBeGreaterThan(0);
    }
    // The rebuild must not lose the satellite indexes or immutability triggers.
    const objects = (conn.prepare("SELECT type, name FROM sqlite_master WHERE tbl_name='damage_records'").all() as { type: string; name: string }[]);
    expect(objects.some((o) => o.type === "trigger")).toBe(true);
    expect((conn.prepare("PRAGMA index_list('vehicles')").all() as unknown[]).length).toBeGreaterThan(1);
  });

  it("refuses to orphan a child row once constraints exist", () => {
    const insert = () =>
      getDb()
        .prepare("INSERT INTO documents (id, vehicle_id, type, file_name, sha256, status, uploaded_at) VALUES (?,?,?,?,?,?,?)")
        .run(`doc-orphan-${Date.now()}`, "v-not-real", "rc", "x.pdf", "0".repeat(64), "pending", new Date().toISOString());
    expect(insert).toThrow(/FOREIGN KEY constraint failed/);
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM documents WHERE vehicle_id = ?").get("v-not-real") as { n: number }).toEqual({ n: 0 });
  });

  it("reports no referential violations in the seeded database", () => {
    const report = getSchemaUpgradeReport() as { violations: string[]; skipped: string[]; rebuilt: string[] } | undefined;
    expect(report?.skipped ?? []).toEqual([]);
    const violations = getDb().prepare("PRAGMA foreign_key_check").all() as unknown[];
    expect(violations).toHaveLength(0);
    expect(report?.violations ?? []).toHaveLength(0);
  });

  it("rejects a child row whose parent does not exist", () => {
    expect(() => createAccidentRecord({ vehicleId: "v-does-not-exist", eventDate: "2024-01-01", severity: "minor", description: "x" })).toThrow();
  });

  it("enforces the severity CHECK constraint on accident records", () => {
    expect(() =>
      createAccidentRecord({ vehicleId, eventDate: "2024-01-01", severity: "catastrophic", description: "bad value" })
    ).toThrow();
  });

  it("round-trips seller and buyer profiles", () => {
    upsertSellerProfile("u-seller", { business_name: "TrustDrive Demo Motors", city: "Mumbai", verified_dealer: 1 });
    const seller = getSellerProfile("u-seller");
    expect(seller?.business_name).toBe("TrustDrive Demo Motors");
    upsertSellerProfile("u-seller", { city: "Pune" });
    expect(getSellerProfile("u-seller")?.city).toBe("Pune");

    upsertBuyerProfile("u-buyer", { budget_min: 500000, budget_max: 2500000, city: "Delhi" });
    const buyer = getBuyerProfile("u-buyer");
    expect(buyer?.budget_max).toBe(2500000);
  });

  it("soft-deletes a vehicle image without losing the row", () => {
    const before = getVehicleImages(vehicleId).length;
    const id = addVehicleImage({ vehicleId, fileKey: "vehicles/v-bmw/photos/test-front.webp", caption: "Test angle" });
    expect(getVehicleImages(vehicleId)).toHaveLength(before + 1);
    softDeleteVehicleImage(id);
    expect(getVehicleImages(vehicleId)).toHaveLength(before);
    const raw = getDb().prepare("SELECT deleted_at FROM vehicle_images WHERE id = ?").get(id) as { deleted_at: string | null };
    expect(raw.deleted_at).toBeTruthy();
  });

  it("records accidents, inspections and evidence", () => {
    const acc = createAccidentRecord({
      vehicleId,
      eventDate: "2023-04-18",
      severity: "moderate",
      description: "Rear-quarter impact, bumper replaced",
      damageZones: ["rear_bumper"],
      repairStatus: "repaired",
      estimatedCost: 62000,
    });
    expect(acc).toBeTruthy();
    expect(countAccidents(vehicleId)).toBeGreaterThan(0);
    expect(getAccidentRecords(vehicleId)[0].id).toBe(acc);

    const insp = createInspection({
      vehicleId,
      inspectionDate: "2026-01-12",
      odometerKm: 41250,
      structuralDamage: 0,
      passed: 1,
      score: 88,
      summary: "Chassis rails straight, no paint over primer.",
      findings: [{ zone: "rear_bumper", note: "Repainted panel" }],
    });
    reviewInspection(insp, "approved", "u-admin", "Signed off against photographs.");
    const rows = getInspections(vehicleId);
    expect(rows.find((r) => r.id === insp)?.status).toBe("approved");

    const ev = createEvidence({
      vehicleId,
      kind: "inspection",
      label: "Pre-purchase inspection 2026-01-12",
      source: "vehicle_inspections",
      inspectionId: insp,
      reliability: "high",
      disclosedToBuyer: true,
    });
    expect(ev).toBeTruthy();
    expect(getEvidenceForVehicle(vehicleId, true).some((e) => e.id === ev)).toBe(true);
  });

  it("stores AI analysis with method, model version and confidence", () => {
    const id = createAiAnalysis({
      vehicleId,
      kind: "odometer",
      title: "Mileage decrease between two records",
      explanation: "A 2023 service reading is lower than the 2022 reading.",
      method: "deterministic-rule",
      modelVersion: "odo-rules-1.0.0",
      severity: "high",
      anomalyType: "mileage_decrease",
      confidence: 0.98,
      reviewState: "pending_review",
    });
    const row = getAiAnalysis(vehicleId, "odometer").find((a) => a.id === id)!;
    expect(row.method).toBe("deterministic-rule");
    expect(row.confidence).toBe(0.98);
    expect(() =>
      createAiAnalysis({ vehicleId, kind: "odometer", title: "x", explanation: "y", method: "m", modelVersion: "v", confidence: 2 })
    ).toThrow();
  });

  it("keeps trust score history append-only", () => {
    recordTrustScore({
      vehicle_id: vehicleId,
      score: 74,
      band: "Moderate",
      version: "trust-v1",
      method: "weighted-evidence-coverage",
      weights_json: "{}",
      factors_json: "[]",
      positive_json: "[]",
      negative_json: "[]",
      unverified_json: "[]",
      missing_policy: "unknown_not_clean",
      evidence_coverage: 60,
    });
    expect(getLatestTrustScore(vehicleId)?.score).toBe(74);
    expect(getTrustScoreHistory(vehicleId).length).toBeGreaterThan(0);
    const before = getTrustScoreHistory(vehicleId).length;
    expect(() => getDb().prepare("UPDATE trust_scores SET score = 100 WHERE vehicle_id = ?").run(vehicleId)).toThrow();
    expect(getTrustScoreHistory(vehicleId)).toHaveLength(before);
  });

  it("persists a real, deduplicated trust snapshot through the data service", () => {
    const before = getTrustScoreHistory(vehicleId, 1000).length;
    const first = ensureTrustScoreSnapshot(vehicleId, "u-seller");
    expect(first.created).toBe(true);
    expect(first.trust.trustScore).toBe(computeVehicleTrust(vehicleId).trustScore);
    expect(getTrustScoreHistory(vehicleId, 1000)).toHaveLength(before + 1);

    const latest = getLatestTrustScore(vehicleId)!;
    expect(latest.score).toBe(first.trust.trustScore);
    expect(latest.band).toBe(first.trust.band);
    expect(latest.version).toBe(TRUST_VERSION);
    expect(latest.method).toBe("deterministic-weighted-evidence-coverage");
    expect(latest.computed_by).toBe("u-seller");
    expect(JSON.parse(latest.factors_json)).toEqual(first.trust.breakdown);

    // An unchanged re-computation must not append a second identical row.
    const second = ensureTrustScoreSnapshot(vehicleId, "u-seller");
    expect(second.created).toBe(false);
    expect(second.id).toBe(first.id);
    expect(getTrustScoreHistory(vehicleId, 1000)).toHaveLength(before + 1);
  });

  it("runs the job queue: enqueue, dedupe, claim, progress, succeed, retry, dead", () => {
    const key = `itest-${Date.now()}`;
    const first = enqueueJob({ type: "document.ocr", subjectId: "doc-x", idempotencyKey: key, maxAttempts: 2 });
    const second = enqueueJob({ type: "document.ocr", subjectId: "doc-x", idempotencyKey: key });
    expect(second.id).toBe(first.id);
    expect(second.deduplicated).toBe(true);

    const claimed = claimJob("itest-worker", "document.ocr");
    expect(claimed?.status).toBe("running");
    setJobProgress(claimed!.id, 45, "Extracting fields");
    completeJob(claimed!.id, { fields: 7 });
    expect(listJobs({ type: "document.ocr" }).find((j) => j.id === claimed!.id)?.status).toBe("succeeded");

    const failing = enqueueJob({ type: "itest.failing", maxAttempts: 1, idempotencyKey: `ifail-${Date.now()}` });
    const run1 = claimJob("itest-worker", "itest.failing");
    expect(run1?.id).toBe(failing.id);
    failJob(run1!.id, "boom");
    expect(listJobs({ type: "itest.failing" }).find((j) => j.id === failing.id)?.status).toBe("dead");
  });

  it("persists agent investigations and the human review queue", () => {
    const inv = createInvestigation({ vehicleId, question: "Is this BMW safe to consider buying?", graphVersion: "lg-1.0.0" });
    updateInvestigation(inv, { status: "completed", answer: "Evidence-backed summary.", citations_json: "[\"doc-1\"]" });
    expect(getInvestigation(inv)?.status).toBe("completed");
    expect(listInvestigations(vehicleId)[0].id).toBe(inv);

    const review = enqueueReview({ vehicleId, kind: "suspicious_fraud", reason: "Conflicting odometer sources" });
    resolveReview(review, "resolved", "u-admin", "Service invoice confirms the higher reading.");
    expect(listReviewQueue("open").find((r) => r.id === review)).toBeUndefined();
    expect(listReviewQueue("resolved").some((r) => r.id === review)).toBe(true);
  });

  it("rolls a transaction back when an inner statement fails", () => {
    const before = countAccidents(vehicleId);
    expect(() =>
      transact(() => {
        createAccidentRecord({ vehicleId, eventDate: "2025-02-02", severity: "minor", description: "rolled back" });
        throw new Error("abort");
      })
    ).toThrow("abort");
    expect(countAccidents(vehicleId)).toBe(before);
  });

  it("paginates audit reads", () => {
    const page1 = getAuditPage(2, 0);
    const page2 = getAuditPage(2, 2);
    expect(page1.length).toBeLessThanOrEqual(2);
    const ids = new Set([...page1, ...page2].map((r) => r.id as string));
    expect(ids.size).toBe(page1.length + page2.length);
    expect(countAuditLogs()).toBeGreaterThanOrEqual(0);
  });
});
