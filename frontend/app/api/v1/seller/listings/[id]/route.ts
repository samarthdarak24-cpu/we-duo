import { getSellerListingForActor, updateListingForActor } from "@/lib/server/data";
import { evaluateSavedSearchAlerts } from "@/lib/server/alerts";
import { fail, ok, requireRole } from "@/lib/server/http";
import { LIMITS, enforceRateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/seller/listings/:id — detail with trust, gate, photos and history. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  const result = getSellerListingForActor(guard.user.sub, params.id);
  if (!result.ok) return fail(result.code === "NOT_FOUND" ? 404 : 403, result.code, result.message);
  return ok(result);
}

/** PATCH /api/v1/seller/listings/:id — edit draft/published copy and price. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const limited = enforceRateLimit(req, "listing-update", LIMITS.write);
  if (limited) return limited;
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as
    | { headline?: string; description?: string; condition?: string; location?: string; price?: number }
    | null;
  if (!body) return fail(400, "VALIDATION_FAILED", "A JSON body is required.");
  const result = updateListingForActor(guard.user.sub, params.id, body);
  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404 : result.code === "FORBIDDEN" ? 403 : result.code === "INVALID_TRANSITION" ? 409 : 400;
    return fail(status, result.code, result.message);
  }
  if (typeof body.price === "number") evaluateSavedSearchAlerts(undefined, params.id);
  return ok(result);
}
