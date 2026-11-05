import { startVerificationRun } from "@/lib/server/data";
import { ensureVerificationCase } from "@/lib/server/evidence";
import { fail, ok, requireRole } from "@/lib/server/http";
import { withIdempotency } from "@/lib/server/idempotency";
import { LIMITS, enforceRateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/vehicles/:id/verify — queue and run the deterministic pipeline.
 * A verification case is opened (or refreshed) for the run so reviewers have a
 * durable id to reference from reports and the evidence graph.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const limited = enforceRateLimit(req, "verification-run", LIMITS.write);
  if (limited) return limited;
  return withIdempotency(req, `verify:${params.id}`, async () => {
    const guard = requireRole(req, "seller", "admin");
    if (!guard.ok) return guard.response;
    const result = startVerificationRun(guard.user.sub, params.id);
    if (!result.ok) return fail(result.code === "NOT_FOUND" ? 404 : 403, result.code, result.message);
    const verificationCase = ensureVerificationCase(guard.user.sub, guard.user.role, params.id);
    return ok({
      ...result,
      caseId: verificationCase.ok ? verificationCase.id : null,
      caseState: verificationCase.ok ? verificationCase.state : null,
    });
  });
}
