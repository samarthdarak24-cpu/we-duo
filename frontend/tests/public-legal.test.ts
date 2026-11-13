import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf-8");

/**
 * Spec §8.1 and AGENTS.md §1.5 / §2.6 / §2.8 regression guards:
 *  - footer must link to working legal pages (contact, privacy, terms)
 *  - no decorative buttons that look clickable but do nothing
 *  - marketing statistics must come from the database, not constants
 *  - no implied official government / registry integration
 */
describe("Public site honesty standards", () => {
  it("ships real privacy and terms routes", () => {
    expect(existsSync(path.join(ROOT, "app/privacy/page.tsx"))).toBe(true);
    expect(existsSync(path.join(ROOT, "app/terms/page.tsx"))).toBe(true);
  });

  it("footer links to contact, privacy and terms", () => {
    const footer = read("components/public/Footer.tsx");
    expect(footer).toContain('href="/privacy"');
    expect(footer).toContain('href="/terms"');
    expect(footer).toContain('href="/contact"');
  });

  it("footer has no dead cursor-pointer buttons", () => {
    const footer = read("components/public/Footer.tsx");
    // Every clickable-looking affordance must be a real <Link>.
    expect(footer).not.toMatch(/<span[^>]*cursor-pointer/);
  });

  it("marketing statistics are read from the database, never hardcoded", () => {
    const about = read("components/public/AboutSection.tsx");
    expect(about).toContain("getPublicPlatformStats");
    expect(about).not.toContain('value: "9+"');
    expect(about).not.toContain("Zero Undisclosed Accidents");
    expect(about).not.toContain('value: "100%"');
    const stats = read("lib/server/public-stats.ts");
    expect(stats).toContain("SELECT COUNT(*)");
  });

  it("public marketing copy does not claim a live government registry", () => {
    const files = [
      "components/public/AiIntelligenceSection.tsx",
      "components/public/TechnologySection.tsx",
      "components/public/ReportShowcaseSection.tsx",
      "components/public/HowItWorksSection.tsx",
      "components/public/ProblemSection.tsx",
      "app/technology/page.tsx",
    ];
    const banned = [
      "national transport registries",
      "national transport databases",
      "AUTHENTIC RTO",
      "RTO Verified",
      "Matched RTO Database",
      "national vehicle hash database",
      "99.2% Accuracy",
      "False Positive Rate",
    ];
    for (const f of files) {
      const src = read(f);
      for (const phrase of banned) {
        expect(src, `${f} still claims "${phrase}"`).not.toContain(phrase);
      }
    }
  });

  it("does not claim blockchain anchoring or that a hash proves authenticity", () => {
    for (const f of [
      "components/public/TechnologySection.tsx",
      "components/public/AiIntelligenceSection.tsx",
      "app/privacy/page.tsx",
      "app/terms/page.tsx",
    ]) {
      expect(read(f)).not.toContain("Hash Anchored");
    }
  });
});
