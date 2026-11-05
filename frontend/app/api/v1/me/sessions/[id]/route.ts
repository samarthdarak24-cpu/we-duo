import { endSession } from "@/lib/server/accounts";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/v1/me/sessions/:id — revoke one session. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req);
  if (!guard.ok) return guard.response;
  if (params.id === guard.user.sid) return fail(400, "CURRENT_SESSION", "Use sign out to end the current session.");
  endSession(params.id, guard.user.sub);
  return ok({ revoked: params.id });
}
