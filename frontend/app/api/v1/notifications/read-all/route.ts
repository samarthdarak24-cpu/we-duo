import { markAllNotificationsRead } from "@/lib/server/db";
import { ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/notifications/read-all */
export async function POST(req: Request) {
  const guard = requireRole(req);
  if (!guard.ok) return guard.response;
  markAllNotificationsRead(guard.user.sub);
  return ok({ read: true });
}
