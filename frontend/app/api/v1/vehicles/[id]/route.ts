import { getVehicleReport } from "@/lib/server/data";
import { deleteVehicle, getVehicle, updateVehicle } from "@/lib/server/db";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller", "admin");
  if (!guard.ok) return guard.response;
  const v = getVehicle(params.id);
  if (!v) return fail(404, "NOT_FOUND", "Vehicle not found");
  // A buyer inspects any published listing, but a seller only ever sees the
  // full verification report for vehicles they own (RBAC_MATRIX §"View full
  // vehicle report"). Without this a seller could read a competitor's entire
  // evidence set through this endpoint.
  if (guard.user.role === "seller" && v.owner_id !== guard.user.sub) {
    return fail(403, "FORBIDDEN", "You do not own this vehicle.");
  }
  const report = getVehicleReport(params.id, guard.user.sub);
  if (!report) return fail(404, "NOT_FOUND", "Vehicle not found");
  return ok(report);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "seller", "admin");
  if (!guard.ok) return guard.response;
  const v = getVehicle(params.id);
  if (!v) return fail(404, "NOT_FOUND", "Vehicle not found");
  if (guard.user.role !== "admin" && v.owner_id !== guard.user.sub) {
    return fail(403, "FORBIDDEN", "You do not own this vehicle.");
  }
  const body = (await req.json().catch(() => null)) as Record<string, any> | null;
  if (!body) return fail(400, "VALIDATION_FAILED", "A JSON payload is required.");

  updateVehicle(params.id, body);
  return ok({ id: params.id, updated: true });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "seller", "admin");
  if (!guard.ok) return guard.response;
  const v = getVehicle(params.id);
  if (!v) return fail(404, "NOT_FOUND", "Vehicle not found");
  if (guard.user.role !== "admin" && v.owner_id !== guard.user.sub) {
    return fail(403, "FORBIDDEN", "You do not own this vehicle.");
  }
  deleteVehicle(params.id);
  return ok({ id: params.id, deleted: true });
}
