// Vehicle History Passport projection: real rows only, honest statuses, and a
// mileage timeline that treats a decrease as a warning rather than proof.
import { beforeAll, describe, expect, it } from "vitest";

const STATUSES = [
  "VERIFIED",
  "PENDING",
  "SUSPICIOUS",
  "UNVERIFIED",
  "NEEDS_REVIEW",
  "UNAVAILABLE",
] as const;

let vehiclePassport: typeof import("../lib/server/category-service").vehiclePassport;
let restrictPassportToDocuments: typeof import("../lib/server/category-service").restrictPassportToDocuments;
type Passport = NonNullable<ReturnType<typeof vehiclePassport>>;

function passport(id: string): Passport {
  const result = vehiclePassport(id);
  expect(result).not.toBeNull();
  return result!;
}

beforeAll(async () => {
  // Import the DB module first so getDb() migrates and seeds the throwaway
  // database (including the six multi-category demo vehicles).
  const db = await import("../lib/server/db");
  db.getDb();
  const service = await import("../lib/server/category-service");
  vehiclePassport = service.vehiclePassport;
  restrictPassportToDocuments = service.restrictPassportToDocuments;
});

describe("Vehicle History Passport", () => {
  it("returns a chronological, status-normalised evidence timeline", () => {
    const p = passport("v-demo-ebike");
    expect(p.timeline.length).toBeGreaterThan(5);

    const types = new Set(p.timeline.map((entry) => entry.type));
    for (const type of ["document", "history", "mileage", "damage", "finding", "battery"]) {
      expect(types.has(type), `timeline should include ${type}`).toBe(true);
    }

    for (const entry of p.timeline) {
      expect(STATUSES).toContain(entry.status);
      expect(entry.id).toBeTruthy();
      expect(entry.title).toBeTruthy();
      expect(entry.evidenceRefs.length).toBeGreaterThan(0);
    }

    const dated = p.timeline.filter((entry) => entry.date);
    for (let i = 1; i < dated.length; i++) {
      const previous = new Date(dated[i - 1].date!).getTime();
      const current = new Date(dated[i].date!).getTime();
      expect(current).toBeGreaterThanOrEqual(previous);
    }
  });

  it("explains a decreasing odometer reading with previous/current values and a review action", () => {
    const p = passport("v-demo-ebike");
    const rollback = p.mileageAnalysis.anomalies.find((a) => a.type === "ROLLBACK");
    expect(rollback).toBeTruthy();
    expect(rollback!.previous.km).toBe(15200);
    expect(rollback!.current.km).toBe(14100);
    expect(rollback!.differenceKm).toBe(-1100);
    expect(rollback!.status).toBe("NEEDS_REVIEW");
    expect(rollback!.reviewable).toBe(true);
    expect(rollback!.explanation).toMatch(/not proof of tampering/i);
    expect(rollback!.recommendedAction).toMatch(/service invoice|photograph/i);
    expect(rollback!.method).toBe("chronological-odometer-delta");
    expect(p.mileageAnalysis.consistency).toBe("attention");
  });

  it("builds a deterministic assessment with positives, risks, missing data and limitations", () => {
    const p = passport("v-demo-escooter");
    expect(p.assessment.method).toBe("deterministic-evidence-assessment");
    expect(p.assessment.version).toMatch(/^trust-/);
    expect(STATUSES).toContain(p.assessment.status);
    expect(p.assessment.summary).toMatch(/unverified/i);
    expect(p.assessment.limitations.join(" ")).toMatch(/no LLM/i);
    expect(p.assessment.limitations.join(" ")).toMatch(/SHA-256 proves file integrity/i);
    expect(p.assessment.missingInformation.length).toBeGreaterThan(0);
    for (const missing of p.assessment.missingInformation) {
      expect(STATUSES).toContain(missing.status);
      expect(missing.detail).toBeTruthy();
    }
    // The demo scooter has no theft check: that must be reported as coverage
    // gap, not silently treated as a clean result.
    const theft = p.assessment.missingInformation.find((m) => m.code === "theft_coverage");
    expect(theft).toBeTruthy();
    expect(["UNAVAILABLE", "UNVERIFIED"]).toContain(theft!.status);
  });

  it("keeps battery health separate from distance and labels it with its source", () => {
    const p = passport("v-demo-escooter");
    expect(p.battery.applicable).toBe(true);
    expect(p.battery.sohIsOdometer).toBe(false);
    expect(p.battery.records.some((record) => record.sohPercent === 87)).toBe(true);
    expect(p.distance.readings.every((reading) => reading.km > 0)).toBe(true);

    const batteryEntries = p.timeline.filter((entry) => entry.type === "battery");
    expect(batteryEntries.length).toBeGreaterThan(0);
    expect(batteryEntries.some((entry) => /State of Health/i.test(entry.description))).toBe(true);
  });

  it("treats absent damage records as unverified coverage, never a clean bill of health", () => {
    const p = passport("v-demo-scooter");
    const damageGap = p.assessment.missingInformation.find((m) => m.code === "damage_history");
    expect(damageGap).toBeTruthy();
    expect(damageGap!.detail).toMatch(/not proof the vehicle is damage-free/i);
    expect(damageGap!.status).toBe("UNAVAILABLE");
  });

  it("returns null for an unknown vehicle instead of a fabricated passport", () => {
    expect(vehiclePassport("does-not-exist")).toBeNull();
  });

  it("hides non-consented document evidence from a restricted viewer", () => {
    const full = passport("v-demo-escooter");
    const allowed = full.documents[0];
    const restricted = restrictPassportToDocuments(full, new Set([allowed.id]));

    expect(restricted.documents).toHaveLength(1);
    expect(restricted.documents[0].id).toBe(allowed.id);
    expect(
      restricted.timeline
        .filter((entry) => entry.type === "document")
        .every((entry) => entry.id === `document:${allowed.id}`)
    ).toBe(true);
    const leakedRefs = [
      ...restricted.timeline.flatMap((entry) => entry.evidenceRefs),
      ...restricted.assessment.evidenceRefs,
      ...restricted.assessment.riskIndicators.flatMap((indicator) => indicator.evidenceRefs),
    ].filter(
      (ref) =>
        ref.startsWith("document:") && ref.slice("document:".length) !== allowed.id
    );
    expect(leakedRefs).toEqual([]);
    expect(
      restricted.evidenceGraph.nodes
        .filter((node) => node.node_type === "document")
        .every((node) => node.entity_id === allowed.id)
    ).toBe(true);
    expect(restricted.evidenceGraph.hiddenDocuments).toBe(full.documents.length - 1);
  });
});
