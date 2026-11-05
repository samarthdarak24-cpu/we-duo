import { findingView } from "@/lib/server/data";
import { getFindings, getVehicle } from "@/lib/server/db";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/vehicles/:id/findings — sorted by severity. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller", "admin");
  if (!guard.ok) return guard.response;
  if (!getVehicle(params.id)) return fail(404, "NOT_FOUND", "Vehicle not found");
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  let rows = getFindings(params.id).map(findingView);
  if (status && status !== "all") rows = rows.filter((f) => f.status === status);
  return ok(rows);
}
