import { randomUUID } from "node:crypto";
import { createAudit, getDocument, getVehicle, softDeleteDocument } from "@/lib/server/db";
import { fail, getAuth, ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/documents/:id — owner or admin only. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  if (!auth) return fail(401, "UNAUTHENTICATED", "Authentication required.");
  const doc = getDocument(params.id);
  if (!doc) return fail(404, "NOT_FOUND", "Document not found.");
  const vehicle = getVehicle(doc.vehicle_id);
  if (auth.role !== "admin" && vehicle?.owner_id !== auth.sub) {
    return fail(403, "FORBIDDEN", "This document is private.");
  }
  return ok({ document: doc });
}

/**
 * DELETE /api/v1/documents/:id — SOFT delete.
 * The row, its hash and its audit trail remain; it is hidden from reads.
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  if (!auth) return fail(401, "UNAUTHENTICATED", "Authentication required.");
  const doc = getDocument(params.id);
  if (!doc) return fail(404, "NOT_FOUND", "Document not found.");
  const vehicle = getVehicle(doc.vehicle_id);
  if (auth.role !== "admin" && vehicle?.owner_id !== auth.sub) {
    return fail(403, "FORBIDDEN", "You do not own this document.");
  }
  softDeleteDocument(params.id);
  const at = new Date().toISOString();
  createAudit({
    id: randomUUID(),
    actor_id: auth.sub,
    action: "document.soft_deleted",
    entity_type: "document",
    entity_id: params.id,
    before: JSON.stringify({ deleted_at: null }),
    after: JSON.stringify({ deleted_at: at }),
    ip: "",
    user_agent: req.headers.get("user-agent") ?? "",
    at,
  });
  return ok({ id: params.id, deleted: true, softDeleted: true, deletedAt: at });
}
