import { getDb, getVehicle } from "@/lib/server/db";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  // RBAC matrix: sellers see their own listing counts; buyers never do; admin may audit.
  const guard = requireRole(req, "seller", "admin");
  if (!guard.ok) return guard.response;
  const row = getDb().prepare("SELECT * FROM listings WHERE id = ?").get(params.id) as
    | { id: string; vehicle_id: string; status: string; views: number; saves: number; inquiries: number }
    | undefined;
  if (!row) return fail(404, "NOT_FOUND", "Listing not found");
  const vehicle = getVehicle(row.vehicle_id);
  if (guard.user.role !== "admin" && vehicle?.owner_id !== guard.user.sub) {
    return fail(403, "FORBIDDEN", "You do not own this listing.");
  }
  return ok({ views: row.views, saves: row.saves, inquiries: row.inquiries, status: row.status });
}
