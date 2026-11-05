import { getReports } from "@/lib/server/data";
import { ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/reports — the caller's reports. */
export async function GET(req: Request) {
  const guard = requireRole(req);
  if (!guard.ok) return guard.response;
  return ok(getReports(guard.user.sub));
}
