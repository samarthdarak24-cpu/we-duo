import { addVehicleClaim, getVehicleClaims } from "@/lib/server/evidence";
import { getVehicle } from "@/lib/server/db";
import { created, fail, ok, requireRole } from "@/lib/server/http";
import { LIMITS, enforceRateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/vehicles/:id/claims — seller-declared claims with status. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller", "admin");
  if (!guard.ok) return guard.response;
  if (!getVehicle(params.id)) return fail(404, "NOT_FOUND", "Vehicle not found");
  return ok({ items: getVehicleClaims(params.id) });
}

/** POST /api/v1/vehicles/:id/claims — owner submits a claim for verification. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const limited = enforceRateLimit(req, "claims", LIMITS.write);
  if (limited) return limited;
  const guard = requireRole(req, "seller", "admin");
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => ({}))) as { field?: string; value?: string; supersedesId?: string };
  const result = addVehicleClaim(guard.user.sub, params.id, body);
  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404 : result.code === "FORBIDDEN" ? 403 : 422;
    return fail(status, result.code, result.message);
  }
  return created(result);
}
