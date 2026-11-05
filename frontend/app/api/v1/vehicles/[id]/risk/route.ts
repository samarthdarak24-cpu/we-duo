import { getRiskAnalysis } from "@/lib/server/data";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/vehicles/:id/risk — gauge, findings, recommended action, rules. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller", "admin");
  if (!guard.ok) return guard.response;
  const risk = getRiskAnalysis(params.id);
  if (!risk) return fail(404, "NOT_FOUND", "Vehicle not found");
  return ok(risk);
}
