import { getTheft } from "@/lib/server/db";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/vehicles/:id/theft — source, timestamp, availability. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller", "admin");
  if (!guard.ok) return guard.response;
  const row = getTheft(params.id);
  if (!row) return fail(404, "NOT_FOUND", "No theft check recorded");
  const details = JSON.parse(row.details || "{}") as Record<string, unknown>;
  return ok({
    status: row.status,
    source: row.source,
    checkedAt: row.checked_at,
    available: row.status !== "unavailable",
    note:
      row.status === "no_record"
        ? "No theft record found in supported sources. This does not guarantee the vehicle is not stolen."
        : row.status === "unavailable"
        ? "The theft source was unavailable; this check could not be completed."
        : "A theft record was found in a supported source — investigate before purchase.",
    details,
  });
}
