import { getVerificationCaseById } from "@/lib/server/evidence";
import { getVehicle } from "@/lib/server/db";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/verification-cases/:id — case, run, checks and findings. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "seller", "buyer", "admin");
  if (!guard.ok) return guard.response;
  const result = getVerificationCaseById(params.id);
  if (!result) return fail(404, "NOT_FOUND", "Verification case not found");
  // Mirror the page guard: findings and evidence IDs belong to the vehicle's
  // owner (or an admin). Role alone must not expose another seller's case.
  const vehicle = result.vehicle;
  const ownerId = vehicle ? getVehicle(vehicle.id)?.owner_id : undefined;
  if (!vehicle || (ownerId !== guard.user.sub && guard.user.role !== "admin")) {
    return fail(403, "FORBIDDEN", "This case belongs to another account.");
  }
  return ok(result);
}
