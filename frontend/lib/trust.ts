export type TrustBand = "strong" | "moderate" | "caution" | "high_risk";

export interface TrustBandInfo {
  band: TrustBand;
  label: string;
  color: string;
  bg: string;
}

/**
 * Deterministic trust band (Section 9.6 / 16).
 * 85–100 Strong verification · 65–84 Moderate · 40–64 Caution · <40 High risk
 */
export function trustBand(score: number): TrustBandInfo {
  if (score >= 85)
    return { band: "strong", label: "Strong verification", color: "var(--success)", bg: "var(--success-bg)" };
  if (score >= 65)
    return { band: "moderate", label: "Moderate", color: "var(--primary)", bg: "var(--info-bg)" };
  if (score >= 40)
    return { band: "caution", label: "Caution", color: "var(--warning)", bg: "var(--warning-bg)" };
  return { band: "high_risk", label: "High risk", color: "var(--danger)", bg: "var(--danger-bg)" };
}

/** risk_score = 100 - trust_score (Section 9.6). */
export function riskScore(trustScore: number): number {
  return 100 - trustScore;
}

export function riskLabel(risk: number): { label: string; color: string } {
  if (risk <= 15) return { label: "Low risk", color: "var(--success)" };
  if (risk <= 35) return { label: "Elevated risk", color: "var(--warning)" };
  if (risk <= 60) return { label: "High risk", color: "var(--danger)" };
  return { label: "Critical risk", color: "var(--danger)" };
}
