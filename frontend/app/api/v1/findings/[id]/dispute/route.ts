import { createDisputeForFinding } from "@/lib/server/data";
import { created, fail, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/findings/:id/dispute — explanation + evidence, stays pending review. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as { explanation?: string; evidenceDocumentIds?: string[] } | null;
  if (!body) return fail(400, "VALIDATION_FAILED", "A JSON body is required.");
  const result = createDisputeForFinding(guard.user.sub, params.id, {
    explanation: body.explanation ?? "",
    evidenceDocumentIds: body.evidenceDocumentIds,
  });
  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404 : result.code === "FORBIDDEN" ? 403 : result.code === "DUPLICATE" ? 409 : 400;
    return fail(status, result.code, result.message);
  }
  return created(result);
}
