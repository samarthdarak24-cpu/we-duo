import { getSellerVehicles, updateVehicleForOwner, archiveVehicleForOwner } from "@/lib/server/data";
import { getVehicle } from "@/lib/server/db";
import type { VehicleRow } from "@/lib/server/db";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/seller/vehicles/:id */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  const row = getSellerVehicles(guard.user.sub).find((v) => v.id === params.id);
  if (!row) return fail(404, "NOT_FOUND", "Vehicle not found");
  return ok(row);
}

/** PATCH /api/v1/seller/vehicles/:id — edit permitted fields. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as Partial<VehicleRow> | null;
  if (!body) return fail(400, "VALIDATION_FAILED", "A JSON body is required.");
  const result = updateVehicleForOwner(guard.user.sub, params.id, body);
  if (!result.ok) {
    const status = result.code === "NOT_FOUND" ? 404 : result.code === "FORBIDDEN" ? 403 : result.code.startsWith("DUPLICATE") ? 409 : 400;
    return fail(status, result.code, result.message, "existingId" in result ? { existingId: result.existingId } : undefined);
  }
  return ok(getVehicle(params.id));
}

/** DELETE /api/v1/seller/vehicles/:id — archive (soft delete). */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  const result = archiveVehicleForOwner(guard.user.sub, params.id);
  if (!result.ok) return fail(result.code === "NOT_FOUND" ? 404 : 403, result.code, result.message);
  return ok({ archived: true });
}
