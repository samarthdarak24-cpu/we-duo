import { addMileageForVehicle, getMileageView } from "@/lib/server/data";
import { getVehicle } from "@/lib/server/db";
import { crossModalMileage } from "@/lib/server/evidence";
import { created, fail, ok, requireRole } from "@/lib/server/http";
import { LIMITS, enforceRateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/vehicles/:id/mileage?from=&to= */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller", "admin");
  if (!guard.ok) return guard.response;
  if (!getVehicle(params.id)) return fail(404, "NOT_FOUND", "Vehicle not found");
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const view = getMileageView(params.id);
  const readings = view.readings.filter((r) => (!from || r.date >= from) && (!to || r.date <= to));
  return ok({ ...view, readings, crossModal: crossModalMileage(params.id) });
}

/** POST /api/v1/vehicles/:id/mileage — seller-submitted reading (flagged if a rollback). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const limited = enforceRateLimit(req, "mileage-write", LIMITS.write);
  if (limited) return limited;
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as { date?: string; km?: number; source?: string; documentId?: string } | null;
  if (!body) return fail(400, "VALIDATION_FAILED", "A JSON body is required.");
  const result = addMileageForVehicle(guard.user.sub, params.id, {
    date: body.date ?? (body as any).readingDate ?? new Date().toISOString(),
    km: Number(body.km ?? (body as any).reading ?? 0),
    source: body.source,
    documentId: body.documentId,
  });
  if (!result.ok) return fail(result.code === "FORBIDDEN" ? 403 : 400, result.code, result.message);
  return created(result);
}
