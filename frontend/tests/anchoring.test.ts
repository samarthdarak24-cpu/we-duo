// Blockchain anchoring provider tests — verifies honest BLOCKED behavior.
//
// No real EVM signer/RPC/testnet funds are available locally, so these tests
// only assert that anchoring is NOT claimed when credentials are absent, and
// that the local SHA-256 chain remains the only integrity claim.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  anchorDocument,
  getAnchoringProvider,
  getAnchoringStatus,
  hashDocument,
  type AnchorResult,
} from "../lib/server/anchoring";
import { LocalChainProvider } from "../lib/server/anchoring";
import { BlockchainProvider } from "../lib/server/anchoring";

const HASH = hashDocument("test-document-bytes");

function unconfigure() {
  delete process.env.TD_CHAIN_RPC_URL;
  delete process.env.TD_CHAIN_CONTRACT;
}

describe("Blockchain anchoring — honest BLOCKED status", () => {
  const original = { ...process.env };

  beforeEach(() => {
    unconfigure();
  });

  afterEach(() => {
    process.env = original;
  });

  it("reports local SHA-256 chain, not blockchain, when unconfigured", () => {
    const status = getAnchoringStatus();
    expect(status.provider).toBe("local-sha256-chain");
    expect(status.note).toContain("not document authenticity");
    expect(status.note).toContain("Blockchain anchoring NOT IMPLEMENTED");
    expect(status.note).toContain("no on-chain anchor exists");
  });

  it("BlockchainProvider is not configured without RPC + contract", () => {
    const bc = new BlockchainProvider();
    expect(bc.configured).toBe(false);
    expect(bc.rpcUrl).toBeNull();
    expect(bc.contract).toBeNull();
  });

  it("LocalChainProvider is always available but never claims anchoring", () => {
    const local = new LocalChainProvider();
    expect(local.configured).toBe(true);
    expect(local.name).toBe("local-sha256-chain");
  });

  it("anchorDocument returns anchored:false with an honest error when unconfigured", async () => {
    const result: AnchorResult = await anchorDocument(HASH);
    expect(result.anchored).toBe(false);
    expect(result.method).toBe("local-sha256-chain");
    expect(result.error).toContain("Not blockchain anchoring");
  });

  it("hashDocument produces a real SHA-256", () => {
    expect(hashDocument("")).toHaveLength(64);
    expect(hashDocument("a")).not.toBe(hashDocument("b"));
    expect(hashDocument("test-document-bytes")).toBe(HASH);
  });

  it("verifies nothing on-chain when unconfigured", async () => {
    const provider = getAnchoringProvider();
    const verified = await provider.verify(HASH, "0xdeadbeef");
    expect(verified.verified).toBe(false);
    expect(verified.method).toBe("local-sha256-chain");
  });

  it("getAnchoringProvider falls back to LocalChainProvider when blockchain unconfigured", () => {
    const provider = getAnchoringProvider();
    expect(provider.name).toBe("local-sha256-chain");
    expect(provider.configured).toBe(true);
  });
});
