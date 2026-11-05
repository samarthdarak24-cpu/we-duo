// ---------------------------------------------------------------------------
// Tamper-evident hash chain (design.md §1.2 #9, §30). Records are immutable;
// each record's hash incorporates the previous hash. "Tamper-evident", never
// "tamper-proof". A DB edit breaks verification.
// ---------------------------------------------------------------------------
import { createHash } from "node:crypto";

/** Deterministic JSON: recursively sort object keys, stable stringify. */
export function canonical(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === "object") {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = norm((v as Record<string, unknown>)[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return JSON.stringify(norm(value));
}

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export interface ChainRecord {
  seq: number;
  payload: unknown;
  prevHash: string;
  recordHash: string;
}

export const GENESIS = "0".repeat(64);

export function recordHash(payload: unknown, prevHash: string): string {
  return sha256(`${prevHash}:${canonical(payload)}`);
}

/** Build a chain from an ordered list of payloads. */
export function buildChain(payloads: unknown[]): ChainRecord[] {
  let prev = GENESIS;
  return payloads.map((payload, i) => {
    const hash = recordHash(payload, prev);
    const rec: ChainRecord = { seq: i + 1, payload, prevHash: prev, recordHash: hash };
    prev = hash;
    return rec;
  });
}

/** Verify integrity + linkage. Returns the first broken seq if any. */
export function verifyChain(records: ChainRecord[]): { intact: boolean; brokenAt?: number } {
  let prev = GENESIS;
  for (const r of records) {
    if (r.prevHash !== prev) return { intact: false, brokenAt: r.seq };
    if (r.recordHash !== recordHash(r.payload, prev)) return { intact: false, brokenAt: r.seq };
    prev = r.recordHash;
  }
  return { intact: true };
}
