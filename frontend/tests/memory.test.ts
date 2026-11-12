import { describe, expect, it } from "vitest";
import { checkOcrHeadroom, memorySnapshot } from "@/lib/server/memory";

describe("container memory guard", () => {
  it("reports a real memory source and finite values", () => {
    const snapshot = memorySnapshot();
    expect(["cgroup-v2", "cgroup-v1", "host", "unknown"]).toContain(snapshot.source);
    if (snapshot.availableBytes !== null) {
      expect(Number.isFinite(snapshot.availableBytes)).toBe(true);
      expect(snapshot.availableBytes).toBeGreaterThanOrEqual(0);
    }
  });

  it("refuses OCR when the required headroom cannot fit", () => {
    // 1 TB is larger than any host this test can run on, so the guard must
    // refuse regardless of whether cgroup data or host free memory is used.
    const result = checkOcrHeadroom(1024 ** 4);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("OCR needs about");
    expect(result.reason).toContain("stays pending");
    expect(result.requiredBytes).toBe(1024 ** 4);
  });
});
