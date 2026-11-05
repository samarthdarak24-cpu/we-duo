import { reportSuspiciousListing } from "@/lib/server/data";
import { created, fail, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/listings/:id/report-suspicious */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer");
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as { reason?: string } | null;
  if (!body?.reason || body.reason.trim().length < 10) {
    return fail(400, "VALIDATION_FAILED", "Describe the concern (at least 10 characters).");
  }
  const result = reportSuspiciousListing(guard.user.sub, params.id, body.reason.trim());
  if (!result.ok) return fail(404, result.code, result.message);
  return created(result);
}
