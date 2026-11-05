import { getAdminDisputeDetail } from "@/lib/server/data";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/admin/disputes/:id — dispute, finding, vehicle and evidence context. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "admin");
  if (!guard.ok) return guard.response;
  const detail = getAdminDisputeDetail(params.id);
  if (!detail) return fail(404, "NOT_FOUND", "Dispute not found.");
  return ok(detail);
}
