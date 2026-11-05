import { getVehicleReport } from "@/lib/server/data";
import { getAuth, fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/vehicles/:id/report — consolidated report JSON. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  const report = getVehicleReport(params.id, auth?.sub);
  if (!report) return fail(404, "NOT_FOUND", "Vehicle not found");
  return ok(report);
}
