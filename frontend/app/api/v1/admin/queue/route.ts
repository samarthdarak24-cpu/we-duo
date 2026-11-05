import { getAdminQueue } from "@/lib/server/data";
import { ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/admin/queue — disputes, pending listings, document checks. */
export async function GET(req: Request) {
  const guard = requireRole(req, "admin");
  if (!guard.ok) return guard.response;
  return ok(getAdminQueue());
}
