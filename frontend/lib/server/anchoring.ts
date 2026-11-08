// ---------------------------------------------------------------------------
// Blockchain anchoring interface (Phase 10).
//
// Two providers, one honest default:
//
//   * `LocalChainProvider`  — ALWAYS available. The local tamper-evident
//     SHA-256 chain (`chain_records`). It proves FILE INTEGRITY, never
//     document authenticity, and it is NOT blockchain anchoring. It stays the
//     default so the app behaves exactly as before.
//
//   * `BlockchainProvider`   — OPTIONAL. Only selected when the EVM adapter is
//     FULLY configured (RPC URL + contract address + signer key). It performs
//     a real encode -> sign -> submit -> receipt -> readback cycle through
//     `lib/server/evm/anchoring-service`. It reports `anchored: false` with an
//     explicit reason whenever anything is missing or fails.
//
// HONESTY: nothing here claims an on-chain anchor without a confirmed receipt
// (status 0x1) and, for verification, a digest read back on-chain. The local
// SHA-256 chain proves file integrity, not document authenticity.
// ---------------------------------------------------------------------------
import { createHash } from "node:crypto";
import {
  anchorDocumentHash,
  getChainConfig,
  getChainStatus,
  isChainConfigured,
  verifyAnchorOnChain,
} from "./evm/anchoring-service";

export interface AnchorResult {
  anchored: boolean;
  method: string;
  txHash?: string;
  network?: string;
  contract?: string;
  blockNumber?: number;
  chainId?: number;
  confirmations?: number;
  error?: string;
  errorCode?: string;
  persisted?: boolean;
  persistenceHookWired?: boolean;
}

export interface AnchorVerification {
  verified: boolean;
  method: string;
  chainId?: number;
  txHash?: string;
  onChainHash?: string;
  expectedHash?: string;
  match?: boolean;
  error?: string;
  errorCode?: string;
}

export interface AnchoringProvider {
  name: string;
  configured: boolean;
  anchor(hashHex: string, metadata?: Record<string, unknown>): Promise<AnchorResult>;
  verify(hashHex: string, txHash: string): Promise<AnchorVerification>;
}

/** Local SHA-256 chain. Always available. NOT blockchain anchoring. */
export class LocalChainProvider implements AnchoringProvider {
  name = "local-sha256-chain";
  configured = true;

  async anchor(hashHex: string): Promise<AnchorResult> {
    return {
      anchored: false,
      method: "local-sha256-chain",
      error: "Local hash chain proves file integrity only. Not blockchain anchoring.",
    };
  }

  async verify(hashHex: string, txHash: string): Promise<AnchorVerification> {
    return { verified: false, method: "local-sha256-chain" };
  }
}

/**
 * Optional blockchain anchoring (EVM testnet/mainnet).
 *
 * Delegates to `lib/server/evm/anchoring-service`, which performs the real
 * transaction cycle. `configured` is true only when RPC URL, contract address
 * and signer key are ALL present and well-formed.
 */
export class BlockchainProvider implements AnchoringProvider {
  name = "blockchain";
  configured: boolean;
  readonly rpcUrl: string | null;
  readonly contract: string | null;

  constructor() {
    const cfg = getChainConfig();
    this.rpcUrl = cfg.rpcUrl;
    this.contract = cfg.contract;
    this.configured = isChainConfigured(cfg);
  }

  async anchor(hashHex: string, metadata?: Record<string, unknown>): Promise<AnchorResult> {
    const outcome = await anchorDocumentHash(hashHex, metadata);
    return { ...outcome, method: outcome.method };
  }

  async verify(hashHex: string, txHash: string): Promise<AnchorVerification> {
    return await verifyAnchorOnChain(hashHex, txHash);
  }
}

let _provider: AnchoringProvider | null = null;
let _providerKey = "";

/**
 * The active provider.
 *
 * The blockchain provider is selected ONLY when it is fully configured, so the
 * default application behaviour is unchanged: the local SHA-256 chain stays
 * active and no on-chain claim is made. The cached instance is invalidated
 * when the environment configuration changes.
 */
export function getAnchoringProvider(): AnchoringProvider {
  const cfg = getChainConfig();
  const key = [cfg.rpcUrl ?? "", cfg.contract ?? "", cfg.privateKey ? "signer" : "", String(cfg.chainId ?? "")].join("|");
  if (_provider && _providerKey === key) return _provider;
  const bc = new BlockchainProvider();
  _provider = bc.configured ? bc : new LocalChainProvider();
  _providerKey = key;
  return _provider;
}

/**
 * Honest snapshot of the anchoring configuration. The signing key is never
 * included — only whether one is configured.
 */
export function getAnchoringStatus() {
  return getChainStatus();
}

export async function anchorDocument(
  hashHex: string,
  metadata?: Record<string, unknown>,
): Promise<AnchorResult> {
  return getAnchoringProvider().anchor(hashHex, metadata);
}

export async function verifyAnchor(hashHex: string, txHash: string): Promise<AnchorVerification> {
  return getAnchoringProvider().verify(hashHex, txHash);
}

export function hashDocument(data: Buffer | string): string {
  return createHash("sha256").update(typeof data === "string" ? Buffer.from(data) : data).digest("hex");
}
