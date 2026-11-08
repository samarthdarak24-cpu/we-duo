// ---------------------------------------------------------------------------
// Persistence for optional on-chain document anchors (Phase 10).
//
// The EVM anchoring service is transport-only: it signs, submits and confirms
// a transaction, then hands the confirmed record to a recorder. This module is
// that recorder — it writes the confirmed anchor into the shared relational
// database (`document_anchors`) so a chain id and transaction hash survive a
// restart and can be shown next to the document.
//
// It never invents an anchor: only a record that came back from a confirmed
// receipt is written. A failed or reverted transaction writes nothing.
// ---------------------------------------------------------------------------
import { createHash } from "node:crypto";
import { getDb, insertAnchorRecord, listAnchorRecords, getAnchorByHash } from "./db";
import { setAnchorRecorder, type AnchorRecord } from "./evm/anchoring-service";

let wired = false;

/**
 * Register the database recorder with the anchoring service. Idempotent: the
 * hook is installed at most once per process.
 */
export function wireAnchorPersistence(): void {
  if (wired) return;
  wired = true;
  setAnchorRecorder((record: AnchorRecord) => {
    persistAnchor(record);
  });
}

/** Write one confirmed anchor. Returns the stored row id. */
export function persistAnchor(record: AnchorRecord, documentId?: string, vehicleId?: string): string {
  const id = `anch-${createHash("sha256")
    .update(`${record.hashHex}:${record.txHash}`)
    .digest("hex")
    .slice(0, 16)}`;
  insertAnchorRecord({
    id,
    document_id: documentId ?? null,
    vehicle_id: vehicleId ?? null,
    hash_hex: record.hashHex,
    chain_id: String(record.chainId),
    tx_hash: record.txHash,
    block_number: record.blockNumber,
    contract: record.contract,
    network: record.network,
    confirmations: record.confirmations,
    anchored_at: record.anchoredAt,
  });
  return id;
}

export function anchorsForHash(hashHex: string) {
  return getAnchorByHash(hashHex);
}

export function recentAnchors(limit = 50) {
  return listAnchorRecords(limit);
}

/** Ensure the table exists even when the app boots without an anchoring call. */
export function ensureAnchorSchema(): void {
  getDb();
}
