import { setInquiryStatusForActor } from "@/lib/server/data";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/v1/inquiries/:id/status — resolve / cancel / pending / replied. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller");
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as { status?: string } | null;
  if (!body?.status) return fail(400, "VALIDATION_FAILED", "status is required");
  const result = setInquiryStatusForActor(guard.user.sub, params.id, body.status);
  if (!result.ok) return fail(result.code === "NOT_FOUND" ? 404 : result.code === "FORBIDDEN" ? 403 : 400, result.code, result.message);
  return ok(result);
}
