import { explainFinding } from "@/lib/server/ai";
import { getListingByVehicle, getVehicle } from "@/lib/server/db";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/vehicles/:id/ai/explain — evidence-grounded finding narrative. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller", "admin");
  if (!guard.ok) return guard.response;
  const v = getVehicle(params.id);
  if (!v) return fail(404, "NOT_FOUND", "Vehicle not found.");
  const listing = getListingByVehicle(params.id);
  const allowed = guard.user.role === "admin" || v.owner_id === guard.user.sub || listing?.status === "published";
  if (!allowed) return fail(403, "FORBIDDEN", "This vehicle is not available to you.");
  const body = (await req.json().catch(() => ({}))) as { findingId?: string };
  const result = explainFinding(params.id, body.findingId);
  if (!result.ok) return fail(404, result.code, result.message);
  return ok(result.explanation);
}
