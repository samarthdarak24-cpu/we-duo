import { describe, it, expect } from "vitest";
import {
  trustBand,
  computeTrustScore,
  computeCompleteness,
  analyzeMileage,
  estimatePrice,
  riskScore,
  type FindingInput,
} from "../lib/server/engine";

const low: FindingInput = { code: "X", severity: "low", title: "t", explanation: "e", points: 8 };

describe("trustBand (§9.6 boundaries)", () => {
  it("maps each boundary correctly", () => {
    expect(trustBand(100)).toBe("strong");
    expect(trustBand(85)).toBe("strong");
    expect(trustBand(84)).toBe("moderate");
    expect(trustBand(65)).toBe("moderate");
    expect(trustBand(64)).toBe("caution");
    expect(trustBand(40)).toBe("caution");
    expect(trustBand(39)).toBe("high_risk");
    expect(trustBand(0)).toBe("high_risk");
  });
});

describe("computeTrustScore", () => {
  it("92 = 100% coverage − 8 low finding (reference BMW)", () => {
    const r = computeTrustScore(1, [low]);
    expect(r.trustScore).toBe(92);
    expect(r.band).toBe("strong");
    expect(r.riskScore).toBe(8);
  });

  it("ignores cleared findings", () => {
    const r = computeTrustScore(1, [{ ...low, status: "cleared" }]);
    expect(r.trustScore).toBe(100);
  });

  it("uses coverage as the base and clamps at 0", () => {
    expect(computeTrustScore(0.92, []).trustScore).toBe(92);
    const r = computeTrustScore(0.5, [
      { code: "A", severity: "critical", title: "t", explanation: "e" },
      { code: "B", severity: "critical", title: "t", explanation: "e" },
    ]);
    expect(r.trustScore).toBe(0);
  });

  it("risk = 100 − trust", () => {
    expect(riskScore(62)).toBe(38);
  });
});

describe("computeCompleteness (§9.1 weights)", () => {
  it("returns 100 when all required docs verified", () => {
    const docs = ["rc", "insurance", "puc", "service", "ownership", "inspection"].map((type) => ({
      type,
      status: "verified",
    }));
    expect(computeCompleteness(docs)).toBe(100);
  });

  it("returns 92 when only insurance is pending (reference seller)", () => {
    const docs = ["rc", "insurance", "puc", "service", "ownership", "inspection"].map((type) => ({
      type,
      status: type === "insurance" ? "pending" : "verified",
    }));
    expect(computeCompleteness(docs)).toBe(92);
  });

  it("counts a duplicated document type once and never exceeds 100", () => {
    const docs = [
      ...["rc", "insurance", "puc", "service", "ownership", "inspection"].map((type) => ({
        type,
        status: "verified",
      })),
      { type: "rc", status: "verified" },
      { type: "puc", status: "verified" },
    ];
    expect(computeCompleteness(docs)).toBe(100);
  });

  it("a pending duplicate never overrides a verified version", () => {
    const docs = [
      { type: "rc", status: "pending" },
      { type: "rc", status: "verified" },
      ...["insurance", "puc", "service", "ownership", "inspection"].map((type) => ({
        type,
        status: "verified",
      })),
    ];
    expect(computeCompleteness(docs)).toBe(100);
  });
});

describe("analyzeMileage (§9.2)", () => {
  it("detects an odometer rollback", () => {
    const r = analyzeMileage([
      { date: "2022-01-01", km: 60000 },
      { date: "2023-01-01", km: 52000 },
    ]);
    expect(r.findings.some((f) => f.code === "ODOMETER_ROLLBACK")).toBe(true);
    expect(r.flaggedDates.length).toBeGreaterThan(0);
  });

  it("flags a suspicious jump", () => {
    const r = analyzeMileage([
      { date: "2022-01-01", km: 20000 },
      { date: "2022-03-01", km: 60000 }, // +40,000 in ~59 days ≈ 678 km/day
    ]);
    expect(r.findings.some((f) => f.code === "MILEAGE_JUMP")).toBe(true);
  });

  it("returns no findings for a plausible history", () => {
    const r = analyzeMileage([
      { date: "2021-01-01", km: 8000 },
      { date: "2022-01-01", km: 24000 },
      { date: "2023-01-01", km: 42000 },
    ]);
    expect(r.findings.length).toBe(0);
    expect(r.latest).toBe(42000);
  });
});

describe("estimatePrice (§9.7)", () => {
  it("produces low < estimate < high", () => {
    const p = estimatePrice({ base: 3400000, ageYears: 3, km: 42000, conditionScore: 0.85 });
    expect(p.low).toBeLessThan(p.estimate);
    expect(p.estimate).toBeLessThan(p.high);
  });

  it("prices higher-mileage cars lower", () => {
    const a = estimatePrice({ base: 3400000, ageYears: 3, km: 20000, conditionScore: 0.85 });
    const b = estimatePrice({ base: 3400000, ageYears: 3, km: 90000, conditionScore: 0.85 });
    expect(b.estimate).toBeLessThan(a.estimate);
  });
});
