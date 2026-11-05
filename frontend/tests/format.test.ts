import { describe, it, expect } from "vitest";
import { formatINR, formatINRCompact, formatKm, timeAgo } from "../lib/format";

describe("Indian rupee formatting", () => {
  it("groups with Indian lakh/crore separators", () => {
    expect(formatINR(2600000)).toBe("₹ 26,00,000");
  });
  it("compacts to L / Cr for tight spaces", () => {
    expect(formatINRCompact(100000)).toBe("₹1L");
    expect(formatINRCompact(2600000)).toBe("₹26L");
    expect(formatINRCompact(120000000)).toBe("₹12Cr");
    expect(formatINRCompact(5000)).toBe("₹ 5,000");
  });
});

describe("Kilometre formatting", () => {
  it("groups and appends km", () => {
    expect(formatKm(45000)).toBe("45,000 km");
  });
});

describe("Relative time", () => {
  it("reports hours and days ago", () => {
    expect(timeAgo(new Date(Date.now() - 2 * 3600 * 1000).toISOString())).toBe("2h ago");
    expect(timeAgo(new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString())).toBe("3d ago");
  });
});
