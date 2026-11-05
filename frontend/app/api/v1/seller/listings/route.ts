import { createListingForVehicle, getSellerListings } from "@/lib/server/data";
import { paginate } from "@/lib/server/pagination";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/seller/listings?status=&page=&pageSize=
 * Paginated envelope: `{ items, page: { page, pageSize, total, totalPages, hasNext, hasPrev } }`.
 */
export async function GET(req: Request) {
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  let rows = getSellerListings(guard.user.sub);
  if (status && status !== "all") rows = rows.filter((r) => r.listing?.status === status);
  return ok(paginate(rows, url, { pageSize: 50 }));
}

/** POST /api/v1/seller/listings — create or update a listing draft. */
export async function POST(req: Request) {
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as
    | { vehicleId?: string; headline?: string; description?: string; condition?: string; location?: string; price?: number }
    | null;
  if (!body?.vehicleId) return fail(400, "VALIDATION_FAILED", "vehicleId is required");
  const result = createListingForVehicle(guard.user.sub, body.vehicleId, body);
  if (!result.ok) return fail(result.code === "FORBIDDEN" ? 403 : 400, result.code, result.message);
  return ok(result);
}
