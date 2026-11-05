import { setDocumentConsent } from "@/lib/server/data";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/v1/documents/:id/consent — "Share with buyers" toggle. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as { consent?: boolean } | null;
  if (typeof body?.consent !== "boolean") return fail(400, "VALIDATION_FAILED", "consent (boolean) is required");
  const result = setDocumentConsent(guard.user.sub, params.id, body.consent);
  if (!result.ok) return fail(result.code === "NOT_FOUND" ? 404 : 403, result.code, result.message);
  return ok(result);
}
