// ---------------------------------------------------------------------------
// TrustDrive deterministic rules engine (design.md §9.6, §9.2, §9.7, §9.1).
// Trust/risk is computed here — never by an LLM. The LLM (later) only explains
// findings this engine already produced. All functions are pure and unit-tested.
// ---------------------------------------------------------------------------

export type Severity = "low" | "medium" | "high" | "critical";
export type TrustBand = "strong" | "moderate" | "caution" | "high_risk";

export interface FindingInput {
  code: string;
  severity: Severity;
  title: string;
  explanation: string;
  points?: number;
  status?: "open" | "explained" | "cleared";
}

/** Default penalty points per severity (§9.5 weights, representative subset). */
export const SEVERITY_POINTS: Record<Severity, number> = {
  low: 8,
  medium: 12,
  high: 25,
  critical: 40,
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Band per §9.6: 85–100 Strong · 65–84 Moderate · 40–64 Caution · <40 High risk. */
export function trustBand(score: number): TrustBand {
  if (score >= 85) return "strong";
  if (score >= 65) return "moderate";
  if (score >= 40) return "caution";
  return "high_risk";
}

export const BAND_LABEL: Record<TrustBand, string> = {
  strong: "Strong verification",
  moderate: "Moderate",
  caution: "Caution",
  high_risk: "High risk",
};

export const BAND_COLOR: Record<TrustBand, { color: string; bg: string }> = {
  strong: { color: "#16A34A", bg: "#E8F8EE" },
  moderate: { color: "#2563EB", bg: "#E8F0FF" },
  caution: { color: "#F59E0B", bg: "#FFF6E0" },
  high_risk: { color: "#DC2626", bg: "#FDECEC" },
};

export function riskScore(trustScore: number): number {
  return 100 - trustScore;
}

/**
 * Trust score = round(evidenceCoverage × 100) − Σ(points of open findings).
 * Coverage is the weighted share of verified required documents (§9.1).
 * Cleared findings do not deduct. Clamped to 0..100.
 */
export function computeTrustScore(
  coverage: number,
  findings: FindingInput[]
): { trustScore: number; riskScore: number; band: TrustBand; breakdown: { code: string; points: number }[] } {
  const open = findings.filter((f) => (f.status ?? "open") !== "cleared");
  const breakdown = open.map((f) => ({
    code: f.code,
    points: f.points ?? SEVERITY_POINTS[f.severity],
  }));
  const penalty = breakdown.reduce((s, b) => s + b.points, 0);
  const base = Math.round(clamp(coverage, 0, 1) * 100);
  const trustScore = clamp(base - penalty, 0, 100);
  return { trustScore, riskScore: 100 - trustScore, band: trustBand(trustScore), breakdown };
}

// ---- Document completeness (§9.1) -----------------------------------------
// Weights sum to 100 so a single missing low-weight doc yields a sensible %.
export const DOC_WEIGHTS: Record<string, number> = {
  rc: 30,
  insurance: 8,
  puc: 22,
  service: 20,
  ownership: 10,
  inspection: 10,
};

export interface DocInput {
  type: string;
  status: string;
}

export function computeCompleteness(docs: DocInput[]): number {
  const total = Object.values(DOC_WEIGHTS).reduce((s, w) => s + w, 0); // 100
  let got = 0;
  for (const d of docs) {
    const w = DOC_WEIGHTS[d.type];
    if (w && d.status === "verified") got += w;
  }
  return Math.round((got / total) * 100);
}

// ---- Mileage analysis (§9.2) ----------------------------------------------
export interface MileageReading {
  date: string; // ISO
  km: number;
  source?: string;
}

const DAY = 86400000;

export function analyzeMileage(readings: MileageReading[]): {
  findings: FindingInput[];
  flaggedDates: string[];
  latest: number | null;
  medianRate: number;
} {
  const sorted = [...readings].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const findings: FindingInput[] = [];
  const flagged = new Set<string>();

  const rates: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const dt = (new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime()) / DAY;
    if (dt > 0) rates.push((sorted[i].km - sorted[i - 1].km) / dt);
  }
  const sortedRates = [...rates].sort((a, b) => a - b);
  const medianRate =
    sortedRates.length === 0
      ? 0
      : sortedRates.length % 2
      ? sortedRates[(sortedRates.length - 1) / 2]
      : (sortedRates[sortedRates.length / 2 - 1] + sortedRates[sortedRates.length / 2]) / 2;

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const dt = (new Date(curr.date).getTime() - new Date(prev.date).getTime()) / DAY;
    const delta = curr.km - prev.km;

    // Rollback: odometer decreased between readings.
    if (delta < 0) {
      const severe = Math.abs(delta) > 5000;
      findings.push({
        code: "ODOMETER_ROLLBACK",
        severity: severe ? "critical" : "high",
        title: "Odometer rollback detected",
        explanation: `Reading fell from ${prev.km.toLocaleString("en-IN")} km (${prev.date.slice(0, 10)}) to ${curr.km.toLocaleString("en-IN")} km (${curr.date.slice(0, 10)}).`,
        points: severe ? 40 : 30,
      });
      flagged.add(curr.date);
      continue;
    }

    if (dt >= 30) {
      const rate = delta / dt;
      // Suspicious jump: >400 km/day, or >4× the vehicle's median rate.
      if (rate > 400 || (medianRate > 0 && rate > 4 * medianRate && delta > 5000)) {
        findings.push({
          code: "MILEAGE_JUMP",
          severity: "medium",
          title: "Mileage inconsistency detected",
          explanation: `+${delta.toLocaleString("en-IN")} km in ${Math.round(dt)} days (${Math.round(rate)} km/day) exceeds the expected rate.`,
          points: 12,
        });
        flagged.add(curr.date);
      }
    }
  }

  // Plausibility: average annual distance outside 1,000–40,000 km → Low note.
  if (sorted.length >= 2) {
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const years = (new Date(last.date).getTime() - new Date(first.date).getTime()) / (365 * DAY);
    if (years >= 1) {
      const annual = (last.km - first.km) / years;
      if (annual < 1000 || annual > 40000) {
        findings.push({
          code: "MILEAGE_IMPLAUSIBLE",
          severity: "low",
          title: "Mileage plausibility note",
          explanation: `Average ${Math.round(annual).toLocaleString("en-IN")} km/year is outside the typical 1,000–40,000 km range.`,
          points: 8,
        });
      }
    }
  }

  return {
    findings,
    flaggedDates: Array.from(flagged),
    latest: sorted.length ? sorted[sorted.length - 1].km : null,
    medianRate,
  };
}

// ---- Price estimate (§9.7) ------------------------------------------------
export interface PriceInput {
  base: number;
  ageYears: number;
  km: number;
  conditionScore: number; // 0..1
}

export function estimatePrice({ base, ageYears, km, conditionScore }: PriceInput): {
  low: number;
  estimate: number;
  high: number;
  confidence: "Low" | "Moderate" | "High";
} {
  const depreciation = Math.min(0.5, Math.max(0, ageYears) * 0.08);
  const kmPenalty = Math.min(0.2, (Math.max(0, km - 20000) / 20000) * 0.02);
  const conditionBonus = (conditionScore - 0.7) * 0.1;
  const factor = Math.max(0.2, 1 - depreciation - kmPenalty + conditionBonus);
  const estimate = Math.round((base * factor) / 1000) * 1000;
  return {
    low: Math.round((estimate * 0.93) / 1000) * 1000,
    estimate,
    high: Math.round((estimate * 1.07) / 1000) * 1000,
    confidence: "Moderate",
  };
}

// ---- State machines (design.md §10) --------------------------------------
export const LISTING_TRANSITIONS: Record<string, string[]> = {
  draft: ["pending_review", "published"],
  pending_review: ["published", "draft"],
  published: ["paused", "sold", "draft"],
  paused: ["published", "draft", "sold"],
  sold: [],
};

export function canTransitionListing(from: string, to: string): boolean {
  return (LISTING_TRANSITIONS[from] ?? []).includes(to);
}

export const DOCUMENT_TRANSITIONS: Record<string, string[]> = {
  uploaded: ["processing", "needs_correction"],
  processing: ["verified", "needs_correction", "suspicious", "unverified"],
  needs_correction: ["processing"],
  suspicious: ["processing", "verified"],
  unverified: ["processing"],
  verified: [],
};

export function canTransitionDocument(from: string, to: string): boolean {
  return (DOCUMENT_TRANSITIONS[from] ?? []).includes(to);
}

export const INQUIRY_TRANSITIONS: Record<string, string[]> = {
  open: ["replied", "pending", "resolved", "cancelled"],
  replied: ["pending", "resolved", "cancelled"],
  pending: ["replied", "resolved", "cancelled"],
  resolved: [],
  cancelled: [],
};

export function canTransitionInquiry(from: string, to: string): boolean {
  return (INQUIRY_TRANSITIONS[from] ?? []).includes(to);
}

export const REPORT_TRANSITIONS: Record<string, string[]> = {
  queued: ["processing", "failed"],
  processing: ["ready", "failed"],
  ready: [],
  failed: ["queued"],
};

export function canTransitionReport(from: string, to: string): boolean {
  return (REPORT_TRANSITIONS[from] ?? []).includes(to);
}

// ---- Listing publish gate (§9.7) -----------------------------------------
export interface PublishGateInput {
  photoCount: number;
  criticalVinMismatch: boolean;
  rcMissing: boolean;
  requiredFieldsMissing: boolean;
  askingPrice: number;
  insuranceExpired: boolean;
  mileageFindingOpen: boolean;
  documentsPending: boolean;
  inspectionPending: boolean;
}

export function publishGate(input: PublishGateInput): { blockers: string[]; warnings: string[] } {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (input.photoCount < 3) blockers.push("Add at least 3 vehicle photos.");
  if (input.criticalVinMismatch) blockers.push("Resolve the open VIN/registration mismatch finding.");
  if (input.rcMissing) blockers.push("Upload a verified Registration Certificate (RC).");
  if (input.requiredFieldsMissing) blockers.push("Complete all required vehicle fields.");
  if (!input.askingPrice || input.askingPrice <= 0) blockers.push("Set an asking price.");
  if (input.insuranceExpired) warnings.push("Insurance has expired — the listing will be labelled.");
  if (input.mileageFindingOpen) warnings.push("A mileage finding is open — shown on the public page.");
  if (input.documentsPending) warnings.push("Some documents are still pending verification.");
  if (input.inspectionPending) warnings.push("Inspection is pending.");
  return { blockers, warnings };
}

// ---- Deterministic compare summary (§4.4 B8) -----------------------------
export interface CompareInput {
  name: string;
  year: number;
  km: number;
  price: number;
  trustScore: number;
  coverage: number;
  findings: number;
  market: number;
}

export function keyDifferences(rows: CompareInput[]): string[] {
  if (rows.length < 2) return ["Select at least two vehicles to compare."];
  const out: string[] = [];
  const bestTrust = [...rows].sort((a, b) => b.trustScore - a.trustScore)[0];
  const worstTrust = [...rows].sort((a, b) => a.trustScore - b.trustScore)[0];
  if (bestTrust.trustScore !== worstTrust.trustScore) {
    out.push(`${bestTrust.name} has the strongest verification (${bestTrust.trustScore}/100 vs ${worstTrust.trustScore}/100).`);
  }
  const lowKm = [...rows].sort((a, b) => a.km - b.km)[0];
  const highKm = [...rows].sort((a, b) => b.km - a.km)[0];
  if (lowKm.km !== highKm.km) {
    out.push(`${highKm.name} has ${(highKm.km - lowKm.km).toLocaleString("en-IN")} km more than ${lowKm.name}.`);
  }
  const lowPrice = [...rows].sort((a, b) => a.price - b.price)[0];
  const highPrice = [...rows].sort((a, b) => b.price - a.price)[0];
  if (lowPrice.price !== highPrice.price) {
    out.push(`${lowPrice.name} is the lowest-priced at ₹${lowPrice.price.toLocaleString("en-IN")}.`);
  }
  const cleanest = [...rows].sort((a, b) => a.findings - b.findings)[0];
  if (cleanest.findings === 0) out.push(`${cleanest.name} has no open findings.`);
  const bestValue = [...rows].sort((a, b) => (a.price - a.market) - (b.price - b.market))[0];
  out.push(`${bestValue.name} is closest to (or furthest below) its estimated market value.`);
  return out.slice(0, 5);
}

// ---- Buyer recommended action (§9.8) -------------------------------------
export function recommendedAction(findings: { severity: string; code: string }[]): string {
  const order = ["critical", "high", "medium", "low"];
  const top = [...findings].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))[0];
  if (!top) return "No open findings. Review the verified documents and inspection report before purchase.";
  if (top.code.includes("ROLLBACK") || top.code.includes("MILEAGE")) {
    return "Request supporting odometer and repair records before purchase.";
  }
  if (top.code.includes("VIN") || top.code.includes("REG")) {
    return "Ask the seller for a corrected RC and matching insurance document before purchase.";
  }
  if (top.code.includes("INSURANCE")) return "Confirm the insurance has been renewed before purchase.";
  if (top.code.includes("DUPLICATE") || top.code.includes("MANIPULATION")) {
    return "Request the original invoice or document directly from the workshop.";
  }
  return "Review the evidence for this finding and request the source document before purchase.";
}

export function coverageLabel(coverage: number): "insufficient" | "limited" | "adequate" {
  if (coverage < 25) return "insufficient";
  if (coverage < 50) return "limited";
  return "adequate";
}

