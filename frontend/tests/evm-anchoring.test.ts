import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BlockchainProvider,
  LocalChainProvider,
  anchorDocument,
  getAnchoringProvider,
  getAnchoringStatus,
  hashDocument,
  verifyAnchor,
} from "../lib/server/anchoring";
import {
  anchorDocumentHash,
  listAnchorRecords,
  verifyAnchorOnChain,
} from "../lib/server/evm/anchoring-service";

// ---------------------------------------------------------------------------
// Phase 10 — optional on-chain document anchoring.
//
// WHAT IS PROVEN HERE
//   The full adapter path against a LOCAL JSON-RPC stub (project/qa/evm-rpc-stub.mjs):
//   encode -> sign -> submit -> receipt -> readback -> compare, plus the
//   failure paths (not configured, invalid hash, reverted transaction,
//   unreachable endpoint, timeout, bad nonce, insufficient funds).
//
// WHAT IS NOT PROVEN HERE
//   Nothing about a real network. There is no funded testnet account, no public
//   RPC endpoint and no deployed DocumentHashRegistry in this environment, so
//   no genuine on-chain anchor is created or verified by this suite. The stub
//   is a local process, not a blockchain.
// ---------------------------------------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STUB_PATH = path.resolve(HERE, "..", "..", "project", "qa", "evm-rpc-stub.mjs");

/** Well-known throwaway test key. Never holds funds, never used off-testnet. */
const TEST_PRIVATE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const TEST_CONTRACT = "0x1234567890123456789012345678901234567890";
const CHAIN_KEYS = [
  "TD_CHAIN_RPC_URL",
  "TD_CHAIN_CONTRACT",
  "TD_CHAIN_PRIVATE_KEY",
  "TD_CHAIN_ID",
  "TD_CHAIN_CONFIRMATIONS",
  "TD_CHAIN_TIMEOUT_MS",
] as const;

let stub: ChildProcessWithoutNullStreams;
let baseUrl = "";
const savedEnv: Record<string, string | undefined> = {};

async function startStub(): Promise<{ proc: ChildProcessWithoutNullStreams; url: string }> {
  const proc = spawn(process.execPath, [STUB_PATH, "--port", "0"], {
    stdio: ["ignore", "pipe", "pipe"],
  }) as ChildProcessWithoutNullStreams;
  const url = await new Promise<string>((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => reject(new Error("stub did not report a port in time")), 15_000);
    // Surface stub stderr in the test output instead of letting the pipe fill.
    proc.stderr.on("data", (chunk) => process.stderr.write(`[evm-rpc-stub] ${String(chunk)}`));
    proc.stdout.on("data", (chunk) => {
      buffer += String(chunk);
      const match = buffer.match(/EVM_RPC_STUB_PORT=(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
    proc.on("error", reject);
    proc.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`stub exited early with code ${code}`));
    });
  });
  return { proc, url };
}

/** Ask the stub what it actually decoded and recorded. */
async function stubState(url = baseUrl): Promise<{
  records: { hash: string; metadata: string; index: number; txHash: string }[];
  transactions: { txHash: string; status: string; to: string; data: string }[];
}> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "td_stub_state", params: [] }),
  });
  const body = (await res.json()) as { result: { records: never[]; transactions: never[] } };
  return body.result;
}

/** A port nothing is listening on. */
async function closedPort(): Promise<number> {
  const net = await import("node:net");
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

beforeAll(async () => {
  const started = await startStub();
  stub = started.proc;
  baseUrl = started.url;
}, 30_000);

afterAll(() => {
  try {
    stub?.kill();
  } catch {
    /* best effort */
  }
});

beforeEach(() => {
  for (const key of CHAIN_KEYS) {
    if (!(key in savedEnv)) savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

function configure(overrides: Record<string, string> = {}) {
  process.env.TD_CHAIN_RPC_URL = baseUrl;
  process.env.TD_CHAIN_CONTRACT = TEST_CONTRACT;
  process.env.TD_CHAIN_PRIVATE_KEY = TEST_PRIVATE_KEY;
  process.env.TD_CHAIN_TIMEOUT_MS = "5000";
  for (const [key, value] of Object.entries(overrides)) {
    if (value === "") delete process.env[key];
    else process.env[key] = value;
  }
}

describe("Phase 10 — on-chain anchoring is honest when unconfigured", () => {
  it("refuses to anchor without RPC, contract and signer", async () => {
    const result = await anchorDocumentHash("a".repeat(64));
    expect(result.anchored).toBe(false);
    expect(result.errorCode).toBe("not_configured");
    expect(result.error).toMatch(/not configured/i);
    expect(result.txHash).toBeUndefined();
  });

  it("keeps the local SHA-256 chain as the default provider", async () => {
    const provider = getAnchoringProvider();
    expect(provider).toBeInstanceOf(LocalChainProvider);
    expect(provider.name).toBe("local-sha256-chain");

    const local = await new LocalChainProvider().anchor("a".repeat(64));
    expect(local.anchored).toBe(false);
    expect(local.error).toMatch(/integrity only/i);
    expect(local.error).toMatch(/not blockchain anchoring/i);

    const viaFacade = await anchorDocument("a".repeat(64));
    expect(viaFacade.anchored).toBe(false);
    expect(viaFacade.method).toBe("local-sha256-chain");
  });

  it("reports signerConfigured:false and never leaks the key when unconfigured", () => {
    const status = getAnchoringStatus();
    expect(status.provider).toBe("local-sha256-chain");
    expect(status.signerConfigured).toBe(false);
    expect(status.blockchainConfigured).toBe(false);
    expect(status.note).toMatch(/proves file integrity, not document authenticity/i);
    expect(JSON.stringify(status)).not.toContain(TEST_PRIVATE_KEY);
    expect(JSON.stringify(status)).not.toContain(TEST_PRIVATE_KEY.slice(2));
  });
});

describe("Phase 10 — anchoring against the local JSON-RPC stub", () => {
  it("rejects a hash that is not a SHA-256 digest", async () => {
    configure();
    const result = await anchorDocumentHash("not-a-sha256");
    expect(result.anchored).toBe(false);
    expect(result.errorCode).toBe("invalid_hash");
    expect(result.txHash).toBeUndefined();
  });

  it("anchors the document's own SHA-256 digest and confirms a real receipt", async () => {
    configure();
    // The very same digest the local chain / file storage produces.
    const digest = hashDocument(Buffer.from("trustdrive-evm-anchor-fixture"));

    const result = await anchorDocumentHash(digest, { documentId: "doc-1", version: 1 });

    expect(result.anchored).toBe(true);
    expect(result.method).toBe("blockchain");
    expect(result.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.chainId).toBe(31337);
    expect(result.blockNumber).toBeGreaterThan(0);
    expect(result.confirmations).toBeGreaterThanOrEqual(1);
    expect(result.contract).toBe(TEST_CONTRACT);
    expect(result.error).toBeUndefined();

    // The stub DECODED the raw signed transaction and recorded the digest.
    // The stub stores it as the ABI `bytes32` value (0x-prefixed); the document
    // digest is plain hex. They must be the same 32 bytes.
    const state = await stubState();
    expect(state.records.length).toBeGreaterThanOrEqual(1);
    const record = state.records[state.records.length - 1];
    expect(record.hash.toLowerCase().replace(/^0x/, "")).toBe(digest.toLowerCase());
    expect(record.txHash).toBe(result.txHash);
    expect(state.transactions.some((t) => t.txHash === result.txHash)).toBe(true);
  });

  it("records the anchor in the in-memory store for the persistence hook", async () => {
    configure();
    const digest = hashDocument("anchor-store-fixture");
    const result = await anchorDocumentHash(digest);
    expect(result.anchored).toBe(true);
    const records = listAnchorRecords();
    expect(records.some((r) => r.hashHex === digest && r.txHash === result.txHash)).toBe(true);
  });

  it("reads the digest back on-chain and matches the document's current hash", async () => {
    configure();
    const digest = hashDocument("verify-match-fixture");
    const anchored = await anchorDocumentHash(digest);
    expect(anchored.anchored).toBe(true);

    const verified = await verifyAnchorOnChain(digest, anchored.txHash!);
    expect(verified.verified).toBe(true);
    expect(verified.match).toBe(true);
    expect(verified.onChainHash).toBe(digest.toLowerCase());
    expect(verified.expectedHash).toBe(digest.toLowerCase());
    expect(verified.chainId).toBe(31337);

    const viaFacade = await verifyAnchor(digest, anchored.txHash!);
    expect(viaFacade.verified).toBe(true);
    expect(viaFacade.match).toBe(true);
  });

  it("does not verify a DIFFERENT hash, even with the anchor's transaction hash", async () => {
    configure();
    const digest = hashDocument("verify-match-target");
    const anchored = await anchorDocumentHash(digest);
    expect(anchored.anchored).toBe(true);

    const other = hashDocument("some-other-document");
    const verified = await verifyAnchorOnChain(other, anchored.txHash!);
    expect(verified.verified).toBe(false);
    expect(verified.match).toBe(false);
    expect(verified.onChainHash).not.toBe(other.toLowerCase());
  });

  it("selects the blockchain provider only when it is fully configured", async () => {
    configure();
    expect(getAnchoringProvider()).toBeInstanceOf(BlockchainProvider);
    expect(getAnchoringStatus().provider).toBe("blockchain");
    expect(getAnchoringStatus().signerConfigured).toBe(true);
    expect(JSON.stringify(getAnchoringStatus())).not.toContain(TEST_PRIVATE_KEY);
  });
});

describe("Phase 10 — failure paths never report a fake success", () => {
  it("reports a reverted transaction as not anchored", async () => {
    configure({ TD_CHAIN_RPC_URL: `${baseUrl}/?fail=revert` });
    const result = await anchorDocumentHash(hashDocument("revert-fixture"));
    expect(result.anchored).toBe(false);
    expect(result.errorCode).toBe("tx_reverted");
    expect(result.error).toMatch(/revert|status/i);
    expect(result.txHash).toBeUndefined();
  });

  it("reports an unreachable RPC endpoint as not anchored", async () => {
    const port = await closedPort();
    configure({ TD_CHAIN_RPC_URL: `http://127.0.0.1:${port}/` });
    const result = await anchorDocumentHash(hashDocument("unreachable-fixture"));
    expect(result.anchored).toBe(false);
    expect(result.errorCode).toBe("rpc_unreachable");
    expect(result.txHash).toBeUndefined();
  });

  it("times out when the endpoint never answers", async () => {
    configure({ TD_CHAIN_RPC_URL: `${baseUrl}/?down=1`, TD_CHAIN_TIMEOUT_MS: "800" });
    const result = await anchorDocumentHash(hashDocument("timeout-fixture"));
    expect(result.anchored).toBe(false);
    expect(result.errorCode).toBe("rpc_timeout");
    expect(result.txHash).toBeUndefined();
  });

  it("reports a rejected nonce distinctly", async () => {
    configure({ TD_CHAIN_RPC_URL: `${baseUrl}/?fail=nonce` });
    const result = await anchorDocumentHash(hashDocument("nonce-fixture"));
    expect(result.anchored).toBe(false);
    expect(result.errorCode).toBe("nonce_underpriced");
  });

  it("reports insufficient funds distinctly", async () => {
    configure({ TD_CHAIN_RPC_URL: `${baseUrl}/?fail=funds` });
    const result = await anchorDocumentHash(hashDocument("funds-fixture"));
    expect(result.anchored).toBe(false);
    expect(result.errorCode).toBe("insufficient_funds");
  });

  it("never exposes the private key in any payload", async () => {
    configure();
    const anchored = await anchorDocumentHash(hashDocument("secret-leak-fixture"));
    expect(anchored.anchored).toBe(true);
    const serialized = JSON.stringify(anchored);
    expect(serialized).not.toContain(TEST_PRIVATE_KEY);
    expect(serialized).not.toContain(TEST_PRIVATE_KEY.slice(2));

    const verified = await verifyAnchorOnChain(hashDocument("secret-leak-fixture"), anchored.txHash!);
    expect(JSON.stringify(verified)).not.toContain(TEST_PRIVATE_KEY);
    expect(JSON.stringify(verified)).not.toContain(TEST_PRIVATE_KEY.slice(2));
    expect(JSON.stringify(getAnchoringStatus())).not.toContain(TEST_PRIVATE_KEY);
  });
});
