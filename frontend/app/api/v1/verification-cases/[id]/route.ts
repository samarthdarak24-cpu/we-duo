import { getVerificationCaseById } from "@/lib/server/evidence";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/verification-cases/:id — case, run, checks and findings. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "seller", "buyer", "admin");
  if (!guard.ok) return guard.response;
  const result = getVerificationCaseById(params.id);
  if (!result) return fail(404, "NOT_FOUND", "Verification case not found");
  return ok(result);
}
