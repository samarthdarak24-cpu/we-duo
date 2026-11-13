import { getCompareVehicles } from "@/lib/server/data";
import { fail, getAuth, ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/compare — body { listingIds: [2..4] } → table + key differences.
 *
 * RBAC matrix §Marketplace: public read, and every signed-in role may compare.
 * The saved-flag is only computed for signed-in callers.
 */
export async function POST(req: Request) {
  const auth = getAuth(req);
  const body = (await req.json().catch(() => null)) as { listingIds?: string[]; ids?: string[]; vehicleIds?: string[] } | null;
  const ids = body?.listingIds ?? body?.ids ?? body?.vehicleIds ?? [];
  if (!Array.isArray(ids) || ids.length < 2 || ids.length > 4) {
    return fail(400, "VALIDATION_FAILED", "Select 2 to 4 vehicles to compare.");
  }
  const result = getCompareVehicles(ids, auth?.sub);
  if (result.rows.length < 2) return fail(404, "NOT_FOUND", "Could not resolve at least two vehicles.");
  return ok(result);
}
