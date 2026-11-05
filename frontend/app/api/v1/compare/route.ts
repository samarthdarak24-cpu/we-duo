import { getCompareVehicles } from "@/lib/server/data";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/compare — body { listingIds: [2..4] } → table + key differences. */
export async function POST(req: Request) {
  const guard = requireRole(req, "buyer");
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as { listingIds?: string[]; ids?: string[] } | null;
  const ids = body?.listingIds ?? body?.ids ?? [];
  if (!Array.isArray(ids) || ids.length < 2 || ids.length > 4) {
    return fail(400, "VALIDATION_FAILED", "Select 2 to 4 vehicles to compare.");
  }
  const result = getCompareVehicles(ids, guard.user.sub);
  if (result.rows.length < 2) return fail(404, "NOT_FOUND", "Could not resolve at least two vehicles.");
  return ok(result);
}
