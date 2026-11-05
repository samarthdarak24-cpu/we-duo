import { randomUUID } from "node:crypto";
import { createAudit, getUserById, softDeleteUser } from "@/lib/server/db";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/v1/admin/users/:id — admin soft delete (self-delete is blocked). */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "admin");
  if (!guard.ok) return guard.response;
  if (params.id === guard.user.sub) {
    return fail(400, "VALIDATION_FAILED", "Use DELETE /api/v1/users/me to delete your own account.");
  }
  const user = getUserById(params.id);
  if (!user) return fail(404, "NOT_FOUND", "User not found.");
  softDeleteUser(params.id);
  const at = new Date().toISOString();
  createAudit({
    id: randomUUID(),
    actor_id: guard.user.sub,
    action: "admin.user_soft_deleted",
    entity_type: "user",
    entity_id: params.id,
    before: JSON.stringify({ deleted_at: null }),
    after: JSON.stringify({ deleted_at: at }),
    ip: "",
    user_agent: req.headers.get("user-agent") ?? "",
    at,
  });
  return ok({ id: params.id, deleted: true, softDeleted: true, deletedAt: at });
}
