import { getUsersByRole } from "@/lib/server/db";
import { ok, requireRole } from "@/lib/server/http";
import { paginate } from "@/lib/server/pagination";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/users?role=&q=&page=&pageSize=
 *
 * Paginated account list for the admin portal (the page renders the same rows
 * server-side). Soft-deleted accounts are excluded by `getUsersByRole`.
 * RBAC is enforced here rather than only by the page shell.
 */
export async function GET(req: Request) {
  const guard = requireRole(req, "admin");
  if (!guard.ok) return guard.response;
  const url = new URL(req.url);
  const role = url.searchParams.get("role");
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  const roles = role && ["seller", "buyer", "admin"].includes(role) ? [role] : ["seller", "buyer", "admin"];
  let rows = roles.flatMap((r) =>
    getUsersByRole(r).map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      kycStatus: u.kyc_status,
      createdAt: u.created_at,
    }))
  );
  if (q) {
    rows = rows.filter((u) =>
      `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(q)
    );
  }
  rows.sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
  return ok(paginate(rows, url, { pageSize: 50 }));
}
