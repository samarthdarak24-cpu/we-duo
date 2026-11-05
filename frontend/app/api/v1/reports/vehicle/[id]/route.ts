import { createReportForVehicle } from "@/lib/server/data";
import { created, fail, requireRole } from "@/lib/server/http";
import { withIdempotency } from "@/lib/server/idempotency";
import { LIMITS, enforceRateLimit } from "@/lib/server/ratelimit";
import { signedDownloadPath } from "@/lib/server/signed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/reports/vehicle/:id — queue a PDF (body { type }).
 * The response includes a short-lived signed download link; the session-based
 * download endpoint remains available for the owner.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const limited = enforceRateLimit(req, "report-create", LIMITS.report);
  if (limited) return limited;
  return withIdempotency(req, `report-create:${params.id}`, async () => {
    const guard = requireRole(req, "buyer", "seller", "admin");
    if (!guard.ok) return guard.response;
    const body = (await req.json().catch(() => ({}))) as { type?: string };
    const result = createReportForVehicle(guard.user.sub, params.id, body.type);
    if (!result.ok) return fail(404, result.code, result.message);
    const reportId = (result as { id?: string }).id;
    return created({
      ...result,
      downloadUrl: reportId ? signedDownloadPath(`/api/v1/reports/${reportId}/download`, "report", reportId) : null,
      downloadExpiresIn: 900,
    });
  });
}
