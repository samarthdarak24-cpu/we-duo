import { suspendListingForAdmin } from "@/lib/server/data";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/admin/listings/:id/suspend — body { reason }. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "admin");
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const result = suspendListingForAdmin(guard.user.sub, params.id, body.reason ?? "Suspended pending admin review.");
  if (!result.ok) return fail(404, result.code, result.message);
  return ok(result);
}
