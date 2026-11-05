import { randomUUID } from "node:crypto";
import { createAudit, getUserById, softDeleteUser } from "@/lib/server/db";
import { fail, getAuth, ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeUser(user: Record<string, unknown>) {
  const copy = { ...user };
  delete copy.password_hash;
  delete copy.kyc_doc_key;
  return copy;
}

/** GET /api/v1/users/me — the signed-in account (no secrets). */
export async function GET(req: Request) {
  const auth = getAuth(req);
  if (!auth) return fail(401, "UNAUTHENTICATED", "Authentication required.");
  const user = getUserById(auth.sub);
  if (!user) return fail(404, "NOT_FOUND", "Account not found.");
  return ok({ user: safeUser(user as unknown as Record<string, unknown>) });
}

/**
 * DELETE /api/v1/users/me — SOFT delete of the account.
 * Sessions are revoked immediately; the row is retained for audit/legal.
 */
export async function DELETE(req: Request) {
  const auth = getAuth(req);
  if (!auth) return fail(401, "UNAUTHENTICATED", "Authentication required.");
  softDeleteUser(auth.sub);
  const at = new Date().toISOString();
  createAudit({
    id: randomUUID(),
    actor_id: auth.sub,
    action: "user.self_deleted",
    entity_type: "user",
    entity_id: auth.sub,
    before: JSON.stringify({ deleted_at: null }),
    after: JSON.stringify({ deleted_at: at }),
    ip: "",
    user_agent: req.headers.get("user-agent") ?? "",
    at,
  });
  return ok({ id: auth.sub, deleted: true, softDeleted: true, deletedAt: at });
}
