// ---------------------------------------------------------------------------
// viem binding for `DocumentHashRegistry` (frontend/contracts/DocumentHashRegistry.sol).
//
// THE HASH IS NOT RE-DERIVED HERE.
// ----------------------------------
// The value anchored on-chain is the document's EXISTING SHA-256 hex digest —
// the very same digest stored in `documents.sha256` and in the local hash chain
// (`chain_records.record_hash` payloads). This module only converts that hex
// digest into the `bytes32` ABI type; it never hashes anything else, never
// re-hashes file bytes and never substitutes a different digest.
//
// The contract itself has never been compiled in this repository (no `solc`
// available here). The ABI below is hand-written to match the Solidity source.
// ---------------------------------------------------------------------------
import {
  decodeAbiParameters,
  decodeFunctionResult,
  encodeFunctionData,
  keccak256,
  parseAbi,
  parseAbiParameters,
  toBytes,
  type Abi,
  type Hex,
} from "viem";

/** Hand-written ABI — must stay in sync with DocumentHashRegistry.sol. */
export const REGISTRY_ABI = parseAbi([
  "function anchor(bytes32 docHash, string metadata)",
  "function getHash(uint256 index) view returns (bytes32)",
  "function getDocHash(bytes32 docHash) view returns (bytes32, string, uint64)",
  "function count() view returns (uint256)",
  "function indexOf(bytes32 docHash) view returns (uint256)",
  "event Anchored(bytes32 indexed docHash, uint256 indexed index, string metadata, uint64 timestamp)",
]) as unknown as Abi;

/** Signature of the `Anchored` event; topic0 = keccak256 of this string. */
export const ANCHORED_EVENT_SIGNATURE = "Anchored(bytes32,uint256,string,uint64)";
export const ANCHORED_EVENT_TOPIC = keccak256(toBytes(ANCHORED_EVENT_SIGNATURE));

const SHA256_HEX = /^[0-9a-fA-F]{64}$/;
const ADDRESS_HEX = /^0x[0-9a-fA-F]{40}$/;

/** True when `value` is a 64-character hexadecimal SHA-256 digest. */
export function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX.test(value.trim());
}

/** True when `value` looks like a 20-byte EVM address. */
export function isAddress(value: unknown): value is string {
  return typeof value === "string" && ADDRESS_HEX.test(value.trim());
}

/**
 * Convert the document's SHA-256 hex digest into the `bytes32` ABI type.
 * The bytes placed on-chain are exactly the digest bytes of the document.
 */
export function sha256ToBytes32(hashHex: string): Hex {
  if (!isSha256Hex(hashHex)) {
    throw new Error("Invalid SHA-256 digest: expected 64 hexadecimal characters.");
  }
  return `0x${hashHex.trim().toLowerCase()}` as Hex;
}

/** Convert a `bytes32` read back from the chain into a 64-char hex digest. */
export function bytes32ToSha256(value: string): string {
  const raw = value.startsWith("0x") ? value.slice(2) : value;
  if (!SHA256_HEX.test(raw)) {
    throw new Error("On-chain value is not a 32-byte digest.");
  }
  return raw.toLowerCase();
}

/** Calldata for `anchor(bytes32 docHash, string metadata)`. */
export function encodeAnchor(hashHex: string, metadata: string): Hex {
  return encodeFunctionData({
    abi: REGISTRY_ABI,
    functionName: "anchor",
    args: [sha256ToBytes32(hashHex), metadata],
  });
}

/** Calldata for `getHash(uint256 index)` (1-based index, as in the contract). */
export function encodeGetHash(index: bigint | number): Hex {
  return encodeFunctionData({
    abi: REGISTRY_ABI,
    functionName: "getHash",
    args: [BigInt(index)],
  });
}

/** Calldata for `getDocHash(bytes32 docHash)`. */
export function encodeGetDocHash(hashHex: string): Hex {
  return encodeFunctionData({
    abi: REGISTRY_ABI,
    functionName: "getDocHash",
    args: [sha256ToBytes32(hashHex)],
  });
}

/** Decode the `getHash(uint256)` return value into a hex digest. */
export function decodeGetHash(data: Hex | string): string {
  // NOTE: viem returns a single-output result directly (not wrapped in an array).
  const hash = decodeFunctionResult({ abi: REGISTRY_ABI, functionName: "getHash", data: data as Hex });
  return bytes32ToSha256(hash as string);
}

/** Decode the `getDocHash(bytes32)` return value. */
export function decodeGetDocHash(data: Hex | string): { hash: string; metadata: string; timestamp: bigint } {
  const decoded = decodeFunctionResult({
    abi: REGISTRY_ABI,
    functionName: "getDocHash",
    data: data as Hex,
  }) as readonly [string, string, bigint];
  const [hash, metadata, timestamp] = decoded;
  return {
    hash: bytes32ToSha256(hash),
    metadata,
    timestamp: BigInt(timestamp),
  };
}

/** Decode the `count()` return value. */
export function decodeCount(data: Hex | string): bigint {
  const count = decodeFunctionResult({ abi: REGISTRY_ABI, functionName: "count", data: data as Hex });
  return BigInt(count as bigint);
}

export interface AnchoredEvent {
  docHash: string;
  index: bigint;
  metadata: string;
  timestamp: bigint;
}

/**
 * Extract the `Anchored` event from a receipt so the record index can be read
 * back with `getHash(index)` when `getDocHash` is unavailable for the hash
 * under test.
 */
export function decodeAnchoredEvent(logs: { topics: string[]; data: string }[] | undefined): AnchoredEvent | null {
  if (!logs?.length) return null;
  for (const log of logs) {
    if (!log.topics?.length) continue;
    if (log.topics[0].toLowerCase() !== ANCHORED_EVENT_TOPIC.toLowerCase()) continue;
    const docHash = bytes32ToSha256(log.topics[1] ?? "");
    const index = BigInt(log.topics[2] ?? "0x0");
    const [metadata, timestamp] = decodeAbiParameters(parseAbiParameters("string, uint64"), log.data as Hex);
    return { docHash, index, metadata, timestamp };
  }
  return null;
}
