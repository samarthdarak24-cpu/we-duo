import { reverifyDocument } from "@/lib/server/data";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/documents/:id/reverify */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  const result = reverifyDocument(guard.user.sub, params.id);
  if (!result.ok) return fail(result.code === "NOT_FOUND" ? 404 : 403, result.code, result.message);
  return ok(result);
}
