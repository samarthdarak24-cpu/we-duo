import { getReportForActor } from "@/lib/server/data";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/reports/:id — report metadata for the requester, owner or admin. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller", "admin");
  if (!guard.ok) return guard.response;
  const result = getReportForActor(guard.user.sub, params.id);
  if (!result.ok) return fail(result.code === "NOT_FOUND" ? 404 : 403, result.code, result.message);
  return ok(result);
}
