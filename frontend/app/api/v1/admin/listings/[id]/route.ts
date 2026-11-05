import { getAdminListingDetail } from "@/lib/server/data";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/admin/listings/:id — moderation detail for a listing. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "admin");
  if (!guard.ok) return guard.response;
  const detail = getAdminListingDetail(params.id);
  if (!detail) return fail(404, "NOT_FOUND", "Listing not found.");
  return ok(detail);
}
