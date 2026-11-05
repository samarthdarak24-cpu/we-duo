import { requestHistoryCorrection } from "@/lib/server/data";
import { fail, created, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/history/:id/correction — creates a new pending event. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as { title?: string; description?: string; km?: number } | null;
  if (!body) return fail(400, "VALIDATION_FAILED", "A JSON body is required.");
  const result = requestHistoryCorrection(guard.user.sub, params.id, {
    title: body.title,
    description: body.description ?? "",
    km: body.km,
  });
  if (!result.ok) return fail(result.code === "NOT_FOUND" ? 404 : result.code === "FORBIDDEN" ? 403 : 400, result.code, result.message);
  return created(result);
}
