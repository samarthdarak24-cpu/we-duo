import { getDb } from "@/lib/server/db";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller");
  if (!guard.ok) return guard.response;
  const row = getDb().prepare("SELECT * FROM listings WHERE id = ?").get(params.id) as
    | { id: string; vehicle_id: string; status: string; views: number; saves: number; inquiries: number }
    | undefined;
  if (!row) return fail(404, "NOT_FOUND", "Listing not found");
  return ok({ views: row.views, saves: row.saves, inquiries: row.inquiries, status: row.status });
}
