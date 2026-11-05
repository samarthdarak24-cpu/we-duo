import { getVehicleDetail } from "@/lib/server/data";
import { getAuth, fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/marketplace/listings/:id — public detail, consent-filtered. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  // Accept either a listing id or a vehicle id.
  const byListing = params.id.startsWith("l-") ? params.id : null;
  const vehicleId = byListing ? null : params.id;
  const { getListing } = await import("@/lib/server/db");
  const listing = byListing ? getListing(byListing) : null;
  const id = listing?.vehicle_id ?? vehicleId ?? params.id;
  const detail = getVehicleDetail(id, auth?.sub);
  if (!detail) return fail(404, "NOT_FOUND", "Listing not found");
  return ok(detail);
}
