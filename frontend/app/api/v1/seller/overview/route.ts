import { getSellerOverview } from "@/lib/server/data";
import { ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  return ok(getSellerOverview(guard.user.sub));
}
