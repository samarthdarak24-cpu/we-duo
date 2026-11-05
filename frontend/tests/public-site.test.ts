import { describe, it, expect } from "vitest";
import { articles } from "../components/public/ResourcesSection";

describe("TrustDrive Public Website Standards", () => {
  it("includes all 6 required editorial knowledge categories", () => {
    const categories = new Set(articles.map((a) => a.category));
    expect(categories.has("Used-Car Buying Guides")).toBe(true);
    expect(categories.has("Vehicle Inspection")).toBe(true);
    expect(categories.has("Odometer Fraud Awareness")).toBe(true);
    expect(categories.has("Document Verification")).toBe(true);
    expect(categories.has("Automotive Technology")).toBe(true);
    expect(categories.has("Vehicle Maintenance")).toBe(true);
  });

  it("ensures all article slugs are valid URL identifiers", () => {
    articles.forEach((art) => {
      expect(art.slug).toMatch(/^[a-z0-9-]+$/);
      expect(art.title.length).toBeGreaterThan(10);
      expect(art.excerpt.length).toBeGreaterThan(20);
    });
  });

  it("enforces platform honesty guidelines in content", () => {
    articles.forEach((art) => {
      // Must not make unconditional perfection claims
      expect(art.title).not.toContain("Accident Free Guarantee");
      expect(art.title).not.toContain("Tamper-Proof");
    });
  });
});
