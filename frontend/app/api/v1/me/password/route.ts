import { changePassword } from "@/lib/server/data";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/me/password — change password after verifying the current one. */
export async function POST(req: Request) {
  const guard = requireRole(req);
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as { currentPassword?: string; newPassword?: string } | null;
  if (!body?.currentPassword || !body?.newPassword) {
    return fail(400, "VALIDATION_FAILED", "currentPassword and newPassword are required");
  }
  const result = changePassword(guard.user.sub, body.currentPassword, body.newPassword);
  if (!result.ok) return fail(result.code === "INVALID_CREDENTIALS" ? 401 : 400, result.code, result.message);
  return ok({ changed: true });
}
