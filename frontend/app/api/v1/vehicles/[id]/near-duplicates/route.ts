import { getVehicle } from "@/lib/server/db";
import { nearDuplicateDocuments } from "@/lib/server/evidence";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/vehicles/:id/near-duplicates — review candidates, never a verdict. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller", "admin");
  if (!guard.ok) return guard.response;
  if (!getVehicle(params.id)) return fail(404, "NOT_FOUND", "Vehicle not found");
  return ok(nearDuplicateDocuments(params.id));
}
