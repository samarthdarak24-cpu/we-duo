import { addHistoryForVehicle, getHistoryView } from "@/lib/server/data";
import { getVehicle } from "@/lib/server/db";
import { created, fail, ok, requireRole } from "@/lib/server/http";
import { paginate } from "@/lib/server/pagination";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/vehicles/:id/history?category=&status=&page=&pageSize= → `{ items, page }`. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller", "admin");
  if (!guard.ok) return guard.response;
  if (!getVehicle(params.id)) return fail(404, "NOT_FOUND", "Vehicle not found");
  const url = new URL(req.url);
  const category = url.searchParams.get("category");
  const status = url.searchParams.get("status");
  let rows = getHistoryView(params.id);
  if (category && category !== "all") rows = rows.filter((h) => h.category === category);
  if (status && status !== "all") rows = rows.filter((h) => h.status === status);
  return ok(paginate(rows, url, { pageSize: 50 }));
}

/** POST /api/v1/vehicles/:id/history — seller-submitted event (status = pending). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as { category?: string; date?: string; km?: number; title?: string; description?: string } | null;
  if (!body) return fail(400, "VALIDATION_FAILED", "A JSON body is required.");
  const result = addHistoryForVehicle(guard.user.sub, params.id, {
    category: body.category ?? "service",
    date: body.date ?? "",
    km: body.km,
    title: body.title ?? "",
    description: body.description,
  });
  if (!result.ok) return fail(result.code === "FORBIDDEN" ? 403 : 400, result.code, result.message);
  return created(result);
}
