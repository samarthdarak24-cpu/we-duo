import { endAllSessions } from "@/lib/server/accounts";
import { getUserSessions } from "@/lib/server/db";
import { ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/me/sessions — active sessions (no token material). */
export async function GET(req: Request) {
  const guard = requireRole(req);
  if (!guard.ok) return guard.response;
  return ok(
    getUserSessions(guard.user.sub).map((s) => ({
      id: s.id,
      userAgent: s.user_agent,
      ip: s.ip,
      createdAt: s.created_at,
      lastSeenAt: s.last_seen_at,
      current: s.id === guard.user.sid,
    }))
  );
}

/** DELETE /api/v1/me/sessions — revoke every session including this one. */
export async function DELETE(req: Request) {
  const guard = requireRole(req);
  if (!guard.ok) return guard.response;
  endAllSessions(guard.user.sub);
  return ok({ revoked: true });
}
