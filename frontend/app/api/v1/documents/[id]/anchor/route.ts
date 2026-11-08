import { randomUUID } from "node:crypto";
import { anchorDocument, getAnchoringStatus } from "@/lib/server/anchoring";
import { wireAnchorPersistence } from "@/lib/server/anchor-store";
import { createAudit, getDocument, getVehicle } from "@/lib/server/db";
import { fail, getAuth, ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/documents/:id/anchor — OPTIONAL on-chain anchoring.
 *
 * Anchors the document's EXISTING SHA-256 digest (the same digest the local
 * chain stores) in the optional EVM registry. It publishes nothing but a hash
 * and a short metadata string.
 *
 * Rules this endpoint enforces:
 *  - the caller owns the document (or is an admin);
 *  - the caller must pass `consent: true` explicitly, because publishing a
 *    digest on a public chain is a stronger disclosure than sharing a document
 *    with buyers;
 *  - without a configured RPC endpoint, contract and signer the request is
 *    REFUSED with an honest explanation. The local SHA-256 chain remains the
 *    only integrity proof, and it proves file integrity — not authenticity;
 *  - a transaction that reverts, times out or is otherwise not confirmed is
 *    reported as NOT anchored. Nothing here ever reports a fake success.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  if (!auth) return fail(401, "UNAUTHENTICATED", "Authentication required.");

  const doc = getDocument(params.id);
  if (!doc) return fail(404, "NOT_FOUND", "Document not found.");

  const vehicle = getVehicle(doc.vehicle_id);
  if (auth.role !== "admin" && vehicle?.owner_id !== auth.sub) {
    return fail(403, "FORBIDDEN", "This document is private.");
  }

  const body = (await req.json().catch(() => null)) as { consent?: boolean } | null;
  if (body?.consent !== true) {
    return fail(
      400,
      "VALIDATION_FAILED",
      "consent (true) is required: anchoring publishes the document digest on a public chain."
    );
  }

  const status = getAnchoringStatus();
  if (!status.blockchainConfigured) {
    return fail(
      503,
      "NOT_CONFIGURED",
      "On-chain anchoring is not configured on this deployment. The local SHA-256 chain proves file integrity, not document authenticity, and no blockchain anchor is claimed."
    );
  }

  if (!doc.sha256) {
    return fail(422, "NO_DIGEST", "This document has no stored digest to anchor.");
  }

  // Persist the confirmed anchor in the shared database.
  wireAnchorPersistence();

  const result = await anchorDocument(doc.sha256, {
    documentId: doc.id,
    vehicleId: doc.vehicle_id,
    type: doc.type,
    version: doc.version ?? 1,
  });

  const at = new Date().toISOString();
  createAudit({
    id: randomUUID(),
    actor_id: auth.sub,
    action: result.anchored ? "document.anchored_onchain" : "document.anchor_failed",
    entity_type: "document",
    entity_id: doc.id,
    before: JSON.stringify({ anchored: false }),
    after: JSON.stringify({
      anchored: result.anchored,
      txHash: result.txHash ?? null,
      chainId: result.chainId ?? null,
      network: result.network ?? null,
      error: result.error ?? null,
    }),
    ip: "",
    user_agent: req.headers.get("user-agent") ?? "",
    at,
  });

  if (!result.anchored) {
    return fail(502, "ANCHOR_FAILED", result.error ?? "The anchor transaction was not confirmed.");
  }

  return ok({
    anchored: true,
    method: result.method,
    txHash: result.txHash,
    chainId: result.chainId,
    network: result.network,
    contract: result.contract,
    blockNumber: result.blockNumber,
    confirmations: result.confirmations,
    persisted: result.persisted,
    note: "A confirmed transaction stores the document digest on-chain. It does not prove who produced the document.",
  });
}
