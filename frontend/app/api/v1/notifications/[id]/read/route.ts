import { markNotificationRead } from "@/lib/server/db";
import { ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/v1/notifications/:id/read */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req);
  if (!guard.ok) return guard.response;
  markNotificationRead(guard.user.sub, params.id);
  return ok({ read: true });
}
