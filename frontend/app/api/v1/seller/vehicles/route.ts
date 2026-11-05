import { createVehicleDraft, getSellerVehicles } from "@/lib/server/data";
import { paginate } from "@/lib/server/pagination";
import { created, fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/seller/vehicles?q=&status=&page=&pageSize= → `{ items, page }`. */
export async function GET(req: Request) {
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").toLowerCase();
  const status = url.searchParams.get("status");
  let rows = getSellerVehicles(guard.user.sub);
  if (q) rows = rows.filter((v) => `${v.make} ${v.model} ${v.regNo} ${v.variant}`.toLowerCase().includes(q));
  if (status && status !== "all") rows = rows.filter((v) => v.status === status);
  return ok(paginate(rows, url, { pageSize: 50 }));
}

/** POST /api/v1/seller/vehicles — create a draft (S3 step 1). */
export async function POST(req: Request) {
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  const b = (await req.json().catch(() => null)) as Parameters<typeof createVehicleDraft>[1] | null;
  if (!b) return fail(400, "VALIDATION_FAILED", "A JSON body is required.");
  const result = createVehicleDraft(guard.user.sub, b);
  if (!result.ok) {
    const status = result.code.startsWith("DUPLICATE") ? 409 : 400;
    return fail(status, result.code, result.message, "existingId" in result ? { existingId: result.existingId } : undefined);
  }
  return created(result);
}
