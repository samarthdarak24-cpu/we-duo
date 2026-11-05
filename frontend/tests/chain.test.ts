import { describe, it, expect } from "vitest";
import { buildChain, verifyChain, canonical, sha256 } from "../lib/server/chain";

describe("hash chain (§30, tamper-evident)", () => {
  const payloads = [
    { id: "h1", category: "registration", km: 0 },
    { id: "h2", category: "service", km: 18000 },
    { id: "h3", category: "inspection", km: 42000 },
  ];

  it("builds a linked chain that verifies intact", () => {
    const chain = buildChain(payloads);
    expect(chain).toHaveLength(3);
    expect(chain[0].prevHash).toBe("0".repeat(64));
    expect(chain[1].prevHash).toBe(chain[0].recordHash);
    expect(verifyChain(chain)).toEqual({ intact: true });
  });

  it("detects tampering of a payload", () => {
    const chain = buildChain(payloads);
    chain[1].payload = { ...(chain[1].payload as object), km: 1 };
    const r = verifyChain(chain);
    expect(r.intact).toBe(false);
    expect(r.brokenAt).toBe(2);
  });

  it("detects a broken link", () => {
    const chain = buildChain(payloads);
    chain[2].prevHash = "deadbeef";
    expect(verifyChain(chain).intact).toBe(false);
  });

  it("canonicalises object key order deterministically", () => {
    expect(canonical({ b: 1, a: 2 })).toBe(canonical({ a: 2, b: 1 }));
    expect(sha256("abc")).toHaveLength(64);
  });
});
