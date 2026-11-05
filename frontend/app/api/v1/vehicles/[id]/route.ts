import { getVehicleReport } from "@/lib/server/data";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller");
  if (!guard.ok) return guard.response;
  const report = getVehicleReport(params.id);
  if (!report) return fail(404, "NOT_FOUND", "Vehicle not found");
  return ok(report);
}
