import { resolveDisputeForAdmin } from "@/lib/server/data";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/admin/disputes/:id/resolve — body { decision, note }. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "admin");
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as { decision?: string; note?: string } | null;
  if (body?.decision !== "resolved" && body?.decision !== "rejected") {
    return fail(400, "VALIDATION_FAILED", "decision must be 'resolved' or 'rejected'");
  }
  const result = resolveDisputeForAdmin(guard.user.sub, params.id, { decision: body.decision, note: body.note ?? "" });
  if (!result.ok) return fail(result.code === "NOT_FOUND" ? 404 : 400, result.code, result.message);
  return ok(result);
}
