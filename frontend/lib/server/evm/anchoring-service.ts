// ---------------------------------------------------------------------------
// Optional on-chain document anchoring (Phase 10).
//
// WHAT THIS DOES
//   Anchors a document's EXISTING SHA-256 digest (the same digest stored in
//   `documents.sha256` and in the local tamper-evident chain) to an EVM
//   contract, waits for a CONFIRMED receipt, and can read the digest back
//   on-chain to compare it with the document's CURRENT digest.
//
// WHAT THIS DOES NOT DO
//   It does not make a document authentic. A digest on a public chain proves
//   "these bytes were submitted by the relayer at time T" — nothing more.
//   It does not claim a blockchain exists when none is configured or reachable.
//
// HONESTY CONTRACT (enforced below, not just documented)
//   * `anchored: true` is returned ONLY after a receipt with `status === '0x1'`
//     was actually observed AND the required confirmations are reached.
//   * `verified: true` is returned ONLY after the digest was READ BACK on-chain
//     via `eth_call` and compared with the document's current digest.
//   * The signing key is never logged, never returned and never allowed into
//     an error message (see `scrubSecret`).
//   * With no RPC / contract / signer configured the result is an honest
//     `anchored: false` with an explicit reason — never a fake success.
//
// NOT PROVEN HERE
//   There is no funded EVM testnet account, no public RPC endpoint and no
//   deployed registry in this environment. The automated tests exercise the
//   encode -> sign -> submit -> receipt -> readback -> compare path against a
//   LOCAL JSON-RPC stub (qa/evm-rpc-stub.mjs). No real network anchor has been
//   produced or verified by this code.
// ---------------------------------------------------------------------------
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import {
  EvmNetworkError,
  EvmRpcClient,
  EvmRpcError,
  EvmTimeoutError,
  hexToBigInt,
  type EvmReceipt,
} from "./client";
import {
  decodeAnchoredEvent,
  decodeGetDocHash,
  decodeGetHash,
  encodeAnchor,
  encodeGetDocHash,
  encodeGetHash,
  isAddress,
  isSha256Hex,
} from "./registry-contract";

export type AnchorErrorCode =
  | "not_configured"
  | "invalid_hash"
  | "invalid_tx_hash"
  | "invalid_contract"
  | "invalid_private_key"
  | "chain_id_mismatch"
  | "rpc_unreachable"
  | "rpc_timeout"
  | "rpc_error"
  | "tx_reverted"
  | "nonce_underpriced"
  | "insufficient_funds"
  | "insufficient_confirmations"
  | "receipt_timeout"
  | "readback_failed"
  | "unknown";

export interface ChainConfig {
  rpcUrl: string | null;
  contract: string | null;
  /** Present only in memory. Never returned in any payload. */
  privateKey: string | null;
  chainId: number | null;
  confirmations: number;
  timeoutMs: number;
}

export interface AnchorOutcome {
  anchored: boolean;
  method: "blockchain";
  chainId?: number;
  txHash?: string;
  blockNumber?: number;
  contract?: string;
  network?: string;
  confirmations?: number;
  error?: string;
  errorCode?: AnchorErrorCode;
  /** True when the parent wired a DB persistence hook and it succeeded. */
  persisted?: boolean;
  /** True when a persistence hook is wired (independent of its outcome). */
  persistenceHookWired?: boolean;
}

export interface AnchorVerification {
  verified: boolean;
  method: "blockchain";
  chainId?: number;
  txHash?: string;
  onChainHash?: string;
  expectedHash?: string;
  match: boolean;
  error?: string;
  errorCode?: AnchorErrorCode;
}

export interface AnchorRecord {
  /** The document's SHA-256 digest (the same value the local chain stores). */
  hashHex: string;
  chainId: number;
  txHash: string;
  blockNumber: number;
  contract: string;
  network: string;
  confirmations: number;
  anchoredAt: string;
}

/** Persistence hook the parent agent wires to the relational DB. */
export type AnchorRecorder = (record: AnchorRecord) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PRIVATE_KEY_HEX = /^0x[0-9a-fA-F]{64}$/;

export function getChainConfig(): ChainConfig {
  const rpcUrl = process.env.TD_CHAIN_RPC_URL?.trim() || null;
  const contract = process.env.TD_CHAIN_CONTRACT?.trim() || null;
  const privateKey = process.env.TD_CHAIN_PRIVATE_KEY?.trim() || null;

  let chainId: number | null = null;
  const chainIdRaw = process.env.TD_CHAIN_ID?.trim();
  if (chainIdRaw) {
    const parsed = Number(chainIdRaw);
    if (Number.isInteger(parsed) && parsed > 0) chainId = parsed;
  }

  const confirmationsRaw = Number(process.env.TD_CHAIN_CONFIRMATIONS ?? "1");
  const confirmations = Number.isFinite(confirmationsRaw) && confirmationsRaw >= 1 ? Math.floor(confirmationsRaw) : 1;

  const timeoutRaw = Number(process.env.TD_CHAIN_TIMEOUT_MS ?? "15000");
  const timeoutMs = Number.isFinite(timeoutRaw) && timeoutRaw >= 500 ? Math.floor(timeoutRaw) : 15_000;

  return { rpcUrl, contract, privateKey, chainId, confirmations, timeoutMs };
}

/** True when RPC URL, contract address and a well-formed signer key are all present. */
export function isChainConfigured(cfg: ChainConfig): boolean {
  return Boolean(cfg.rpcUrl && isAddress(cfg.contract) && cfg.privateKey && PRIVATE_KEY_HEX.test(cfg.privateKey));
}

/** Redact an RPC URL: scheme + host only. Provider API keys live in the path. */
export function redactRpcUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "[invalid-url]";
  }
}

/** Best-effort human name for a chain id. Unknown ids are reported verbatim. */
export function chainName(chainId: number): string {
  switch (chainId) {
    case 1:
      return "ethereum";
    case 10:
      return "optimism";
    case 137:
      return "polygon";
    case 8453:
      return "base";
    case 42161:
      return "arbitrum";
    case 11155111:
      return "sepolia";
    case 80001:
      return "amoy";
    case 31337:
      return "local";
    default:
      return `chain-${chainId}`;
  }
}

/**
 * Remove the signing key (and any explicit secret) from a message before it
 * reaches a payload, a log line or an exception.
 */
export function scrubSecret(message: string, cfg: ChainConfig = getChainConfig()): string {
  let out = message;
  const secret = cfg.privateKey;
  if (secret) {
    out = out.split(secret).join("[redacted-private-key]");
    out = out.split(secret.toLowerCase()).join("[redacted-private-key]");
    out = out.split(secret.slice(2).toLowerCase()).join("[redacted-private-key]");
  }
  return out;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

type AnchorStore = { records: AnchorRecord[] };

const g = globalThis as unknown as { __tdAnchorRecords?: AnchorStore };
function store(): AnchorStore {
  if (!g.__tdAnchorRecords) g.__tdAnchorRecords = { records: [] };
  return g.__tdAnchorRecords;
}

let recorder: AnchorRecorder | null = null;

/**
 * Register the persistence hook. The parent agent wires this to the relational
 * DB (e.g. a `document_anchors` table with `document_id`, `hash_hex`,
 * `chain_id`, `tx_hash`, `block_number`, `contract`, `network`, `anchored_at`).
 * Until then the records live in this process only.
 */
export function setAnchorRecorder(fn: AnchorRecorder | null): void {
  recorder = fn;
}

/** True when a persistence hook is registered. */
export function hasAnchorRecorder(): boolean {
  return recorder !== null;
}

/** In-process record of every anchor that was confirmed on-chain. */
export function listAnchorRecords(): AnchorRecord[] {
  return [...store().records];
}

/**
 * Record a confirmed anchor. Always stores in-process; additionally calls the
 * registered hook. Returns true only when the hook ran successfully.
 */
export async function recordAnchor(record: AnchorRecord): Promise<boolean> {
  store().records.push(record);
  if (!recorder) return false;
  try {
    await recorder(record);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

const METADATA_KEYS = ["documentId", "docId", "vehicleId", "type", "version", "uploadedAt"] as const;

/**
 * Build the on-chain metadata string.
 *
 * The contract stores a free-form string; it MUST NOT contain document
 * content, file names, owner names, document URLs or any other personal data.
 * Only a short, whitelisted, truncated label is kept.
 */
export function buildOnChainMetadata(metadata?: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of METADATA_KEYS) {
    const value = metadata?.[key];
    if (value === undefined || value === null) continue;
    const text = String(value).slice(0, 64);
    if (!text) continue;
    parts.push(`${key}=${text}`);
  }
  return parts.join("|").slice(0, 240);
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

class AnchorFailure extends Error {
  readonly code: AnchorErrorCode;

  constructor(code: AnchorErrorCode, message: string) {
    super(message);
    this.name = "AnchorFailure";
    this.code = code;
  }
}

/** Map a thrown error onto an honest, specific failure code + message. */
export function classifyFailure(err: unknown, cfg: ChainConfig): { code: AnchorErrorCode; message: string } {
  if (err instanceof AnchorFailure) {
    return { code: err.code, message: scrubSecret(err.message, cfg) };
  }
  if (err instanceof EvmTimeoutError) {
    return { code: "rpc_timeout", message: scrubSecret(err.message, cfg) };
  }
  if (err instanceof EvmNetworkError) {
    return { code: "rpc_unreachable", message: scrubSecret(err.message, cfg) };
  }
  if (err instanceof EvmRpcError) {
    const text = `${err.message} ${String(err.data ?? "")}`.toLowerCase();
    if (text.includes("replacement transaction underpriced") || text.includes("nonce too low") || text.includes("nonce")) {
      return { code: "nonce_underpriced", message: scrubSecret(`Transaction nonce rejected by the node: ${err.message}`, cfg) };
    }
    if (text.includes("insufficient funds") || text.includes("gas required exceeds")) {
      return {
        code: "insufficient_funds",
        message: scrubSecret(`Signer cannot pay for the transaction: ${err.message}`, cfg),
      };
    }
    if (text.includes("execution reverted") || text.includes("revert")) {
      return { code: "tx_reverted", message: scrubSecret(`Contract call reverted: ${err.message}`, cfg) };
    }
    return { code: "rpc_error", message: scrubSecret(`RPC error: ${err.message}`, cfg) };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { code: "unknown", message: scrubSecret(message, cfg) };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll for the receipt until it appears or the timeout elapses. */
async function waitForReceipt(
  client: EvmRpcClient,
  txHash: string,
  timeoutMs: number,
): Promise<EvmReceipt | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const receipt = await client.getTransactionReceipt(txHash);
    if (receipt) return receipt;
    if (Date.now() >= deadline) return null;
    await sleep(200);
  }
}

/** Last chain id observed over RPC (so a sync status call can report it). */
let observedChainId: number | null = null;
export function getObservedChainId(): number | null {
  return observedChainId;
}

// ---------------------------------------------------------------------------
// Anchor
// ---------------------------------------------------------------------------

/**
 * Anchor a document digest on-chain.
 *
 * @param hashHex  The document's existing SHA-256 digest (64 hex chars).
 * @param metadata Minimal, non-sensitive label fields.
 */
export async function anchorDocumentHash(
  hashHex: string,
  metadata?: Record<string, unknown>,
): Promise<AnchorOutcome> {
  const cfg = getChainConfig();

  if (!cfg.rpcUrl || !cfg.contract || !cfg.privateKey) {
    return {
      anchored: false,
      method: "blockchain",
      errorCode: "not_configured",
      error:
        "Blockchain anchoring is not configured: TD_CHAIN_RPC_URL, TD_CHAIN_CONTRACT and TD_CHAIN_PRIVATE_KEY are all required.",
    };
  }
  if (!isAddress(cfg.contract)) {
    return {
      anchored: false,
      method: "blockchain",
      errorCode: "invalid_contract",
      error: "TD_CHAIN_CONTRACT is not a valid EVM contract address.",
    };
  }
  if (!PRIVATE_KEY_HEX.test(cfg.privateKey)) {
    return {
      anchored: false,
      method: "blockchain",
      errorCode: "invalid_private_key",
      error: "TD_CHAIN_PRIVATE_KEY is not a valid 32-byte hex private key.",
    };
  }
  if (!isSha256Hex(hashHex)) {
    return {
      anchored: false,
      method: "blockchain",
      errorCode: "invalid_hash",
      error: "Invalid document hash: expected a 64-character hexadecimal SHA-256 digest.",
    };
  }

  const digest = hashHex.trim().toLowerCase();
  const client = new EvmRpcClient({ url: cfg.rpcUrl, timeoutMs: cfg.timeoutMs });

  try {
    const rpcChainId = await client.chainId();
    if (cfg.chainId && cfg.chainId !== rpcChainId) {
      throw new AnchorFailure(
        "chain_id_mismatch",
        `Configured TD_CHAIN_ID ${cfg.chainId} does not match the RPC endpoint's chain id ${rpcChainId}.`,
      );
    }
    const chainId = cfg.chainId ?? rpcChainId;
    observedChainId = chainId;

    const account = privateKeyToAccount(cfg.privateKey as Hex);
    const data = encodeAnchor(digest, buildOnChainMetadata(metadata));
    const contract = cfg.contract as Hex;

    const nonce = await client.getTransactionCount(account.address, "pending");
    const gas = await client.estimateGas({ from: account.address, to: contract, data });
    const gasPrice = await client.gasPrice();
    let maxPriorityFeePerGas: bigint;
    try {
      maxPriorityFeePerGas = await client.maxPriorityFeePerGas();
    } catch {
      maxPriorityFeePerGas = gasPrice;
    }
    if (maxPriorityFeePerGas > gasPrice) maxPriorityFeePerGas = gasPrice;
    const maxFeePerGas = gasPrice * 2n;

    const serialized = await account.signTransaction({
      type: "eip1559",
      chainId,
      nonce: Number(nonce),
      to: contract,
      data,
      value: 0n,
      gas,
      maxFeePerGas,
      maxPriorityFeePerGas,
    });

    const txHash = await client.sendRawTransaction(serialized);

    const receipt = await waitForReceipt(client, txHash, cfg.timeoutMs);
    if (!receipt) {
      throw new AnchorFailure(
        "receipt_timeout",
        `Timed out after ${cfg.timeoutMs}ms waiting for the receipt of transaction ${txHash}.`,
      );
    }
    if (receipt.status !== "0x1") {
      throw new AnchorFailure(
        "tx_reverted",
        `Transaction ${txHash} was mined with receipt status ${receipt.status ?? "unknown"}. No anchor was recorded on-chain.`,
      );
    }

    const receiptBlock = hexToBigInt(receipt.blockNumber) ?? 0n;
    const latest = await client.blockNumber();
    const confirmations = latest >= receiptBlock ? latest - receiptBlock + 1n : 1n;
    if (confirmations < BigInt(cfg.confirmations)) {
      throw new AnchorFailure(
        "insufficient_confirmations",
        `Transaction ${txHash} has ${confirmations} confirmation(s); ${cfg.confirmations} required.`,
      );
    }

    const record: AnchorRecord = {
      hashHex: digest,
      chainId,
      txHash,
      blockNumber: Number(receiptBlock),
      contract: cfg.contract,
      network: chainName(chainId),
      confirmations: Number(confirmations),
      anchoredAt: new Date().toISOString(),
    };
    const persisted = await recordAnchor(record);

    return {
      anchored: true,
      method: "blockchain",
      chainId,
      txHash,
      blockNumber: Number(receiptBlock),
      contract: cfg.contract,
      network: chainName(chainId),
      confirmations: Number(confirmations),
      persisted,
      persistenceHookWired: hasAnchorRecorder(),
    };
  } catch (err) {
    const { code, message } = classifyFailure(err, cfg);
    return { anchored: false, method: "blockchain", errorCode: code, error: message };
  }
}

// ---------------------------------------------------------------------------
// Verify
// ---------------------------------------------------------------------------

/**
 * Verify that a document's CURRENT digest is the one recorded on-chain.
 *
 * A receipt alone is NOT enough: the digest is read back with `eth_call` and
 * compared. `verified` is true only when the readback succeeded and matched.
 */
export async function verifyAnchorOnChain(hashHex: string, txHash: string): Promise<AnchorVerification> {
  const cfg = getChainConfig();
  const expected = typeof hashHex === "string" ? hashHex.trim().toLowerCase() : "";

  if (!cfg.rpcUrl || !cfg.contract || !cfg.privateKey) {
    return {
      verified: false,
      method: "blockchain",
      match: false,
      errorCode: "not_configured",
      error:
        "Blockchain anchoring is not configured: TD_CHAIN_RPC_URL, TD_CHAIN_CONTRACT and TD_CHAIN_PRIVATE_KEY are all required.",
    };
  }
  if (!isSha256Hex(hashHex)) {
    return {
      verified: false,
      method: "blockchain",
      match: false,
      errorCode: "invalid_hash",
      error: "Invalid document hash: expected a 64-character hexadecimal SHA-256 digest.",
    };
  }
  if (typeof txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(txHash.trim())) {
    return {
      verified: false,
      method: "blockchain",
      match: false,
      errorCode: "invalid_tx_hash",
      error: "Invalid transaction hash: expected a 32-byte hex transaction hash.",
    };
  }

  const digest = expected;
  const tx = txHash.trim();
  const client = new EvmRpcClient({ url: cfg.rpcUrl, timeoutMs: cfg.timeoutMs });

  try {
    const chainId = cfg.chainId ?? (await client.chainId());
    observedChainId = chainId;

    const receipt = await client.getTransactionReceipt(tx);
    if (!receipt) {
      throw new AnchorFailure(
        "readback_failed",
        `No receipt found for transaction ${tx} on chain ${chainId}.`,
      );
    }
    if (receipt.status !== "0x1") {
      throw new AnchorFailure(
        "tx_reverted",
        `Transaction ${tx} was mined with receipt status ${receipt.status ?? "unknown"}.`,
      );
    }

    const contract = cfg.contract as Hex;
    let onChainHash: string | null = null;

    try {
      const raw = await client.ethCall({ to: contract, data: encodeGetDocHash(digest) }, "latest");
      onChainHash = decodeGetDocHash(raw).hash;
    } catch {
      // The digest under test may not be the one that was anchored by this
      // transaction. Fall back to the record index carried by the receipt's
      // Anchored event, so we still read a real value back from the chain.
      const event = decodeAnchoredEvent(receipt.logs);
      if (!event) {
        throw new AnchorFailure(
          "readback_failed",
          `Could not read the digest back on-chain for transaction ${tx}: the contract call failed and the receipt carries no Anchored event.`,
        );
      }
      const raw = await client.ethCall({ to: contract, data: encodeGetHash(event.index) }, "latest");
      onChainHash = decodeGetHash(raw);
    }

    const match = onChainHash.toLowerCase() === digest;
    return {
      verified: match,
      method: "blockchain",
      chainId,
      txHash: tx,
      onChainHash,
      expectedHash: digest,
      match,
      ...(match
        ? {}
        : {
            errorCode: "readback_failed" as AnchorErrorCode,
            error: `On-chain digest ${onChainHash} does not match the document's current digest ${digest}.`,
          }),
    };
  } catch (err) {
    const { code, message } = classifyFailure(err, cfg);
    return {
      verified: false,
      method: "blockchain",
      match: false,
      expectedHash: digest,
      txHash: tx,
      errorCode: code,
      error: message,
    };
  }
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export interface ChainStatus {
  provider: "local-sha256-chain" | "blockchain";
  configured: boolean;
  blockchainConfigured: boolean;
  signerConfigured: boolean;
  chainId: number | null;
  contract: string | null;
  rpcUrl: string | null;
  note: string;
}

/** Note shown while the local SHA-256 chain is the only active provider. */
export const LOCAL_CHAIN_NOTE =
  "The local SHA-256 chain proves file integrity, not document authenticity. " +
  "Blockchain anchoring NOT IMPLEMENTED in this deployment: no RPC endpoint, contract address " +
  "or signer key is configured, so no on-chain anchor exists. " +
  "No on-chain anchor exists for a document unless a real transaction receipt with status 0x1 " +
  "was confirmed on the configured chain and the digest was read back from the chain.";

/** Note shown while the configured blockchain adapter is the active provider. */
export const BLOCKCHAIN_NOTE =
  "Local SHA-256 chain proves file integrity, not document authenticity. " +
  "The blockchain anchoring adapter is configured and active, but no on-chain anchor exists " +
  "for a document unless a real transaction receipt with status 0x1 was confirmed on the " +
  "configured chain and the digest was read back from the chain.";

/** Honest, sync status snapshot. Never includes the signing key. */
export function getChainStatus(): ChainStatus {
  const cfg = getChainConfig();
  const blockchainConfigured = isChainConfigured(cfg);
  return {
    provider: blockchainConfigured ? "blockchain" : "local-sha256-chain",
    configured: true,
    blockchainConfigured,
    signerConfigured: Boolean(cfg.privateKey && PRIVATE_KEY_HEX.test(cfg.privateKey)),
    chainId: cfg.chainId ?? observedChainId,
    contract: cfg.contract,
    rpcUrl: redactRpcUrl(cfg.rpcUrl),
    note: blockchainConfigured ? BLOCKCHAIN_NOTE : LOCAL_CHAIN_NOTE,
  };
}
