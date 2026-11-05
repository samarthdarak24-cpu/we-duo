import { addDamageForVehicle, getDamageView, hotspotsFor } from "@/lib/server/data";
import { getVehicle } from "@/lib/server/db";
import { created, fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/vehicles/:id/damage — records + clickable 3D zones. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller", "admin");
  if (!guard.ok) return guard.response;
  if (!getVehicle(params.id)) return fail(404, "NOT_FOUND", "Vehicle not found");
  return ok({ hotspots: hotspotsFor(params.id), records: getDamageView(params.id) });
}

/** POST /api/v1/vehicles/:id/damage — add a pending damage record. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as
    | { zoneId?: string; description?: string; severity?: string; repairStatus?: string; repairDetails?: string; inspectionDate?: string }
    | null;
  if (!body) return fail(400, "VALIDATION_FAILED", "A JSON body is required.");
  const result = addDamageForVehicle(guard.user.sub, params.id, {
    zoneId: body.zoneId ?? (body as any).componentId ?? "",
    description: body.description ?? "",
    severity: body.severity ?? "Minor",
    repairStatus: body.repairStatus ?? "Not repaired",
    repairDetails: body.repairDetails,
    inspectionDate: body.inspectionDate,
  });
  if (!result.ok) return fail(result.code === "FORBIDDEN" ? 403 : 400, result.code, result.message);
  return created(result);
}
