import { getDocument, getListingByVehicle, getVehicle } from "@/lib/server/db";
import { getDocumentExtractions } from "@/lib/server/evidence";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/documents/:id/extractions
 * OCR/parsed fields with method, page and confidence. Buyer access follows the
 * same consent rule as the file itself.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller", "admin");
  if (!guard.ok) return guard.response;
  const doc = getDocument(params.id);
  if (!doc) return fail(404, "NOT_FOUND", "Document not found");
  const vehicle = getVehicle(doc.vehicle_id);
  const listing = getListingByVehicle(doc.vehicle_id);
  const isOwner = vehicle?.owner_id === guard.user.sub;
  const isBuyerView = guard.user.role === "buyer" && doc.consent === 1 && listing?.status === "published";
  if (guard.user.role !== "admin" && !isOwner && !isBuyerView) {
    return fail(403, "FORBIDDEN", "This document has not been shared with you.");
  }
  return ok({
    documentId: doc.id,
    vehicleId: doc.vehicle_id,
    method: doc.extracted ? "recorded-extraction" : "none",
    items: getDocumentExtractions(params.id),
    note: "Fields are recorded by the ingestion adapter. A text layer is never reported as OCR.",
  });
}
