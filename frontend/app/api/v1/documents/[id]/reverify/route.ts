import { reverifyDocument, startVerificationRun } from "@/lib/server/data";
import { runDocumentOcr } from "@/lib/server/document-ocr";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/documents/:id/reverify
 * Re-runs the real OCR/extraction first, then the deterministic verification
 * run so the checks see the freshly extracted fields.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  const reset = reverifyDocument(guard.user.sub, params.id, { runChecks: false });
  if (!reset.ok) return fail(reset.code === "NOT_FOUND" ? 404 : 403, reset.code, reset.message);
  const ocr = await runDocumentOcr(params.id);
  const run = startVerificationRun(guard.user.sub, reset.vehicleId);
  return ok({ ...reset, runId: run.runId, summary: run.summary, ocr });
}
