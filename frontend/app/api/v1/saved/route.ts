import { getSavedVehicles } from "@/lib/server/data";
import { ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/saved — buyer shortlist with price/availability badges. */
export async function GET(req: Request) {
  const guard = requireRole(req, "buyer");
  if (!guard.ok) return guard.response;
  return ok(getSavedVehicles(guard.user.sub));
}
