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
  const { getListing, getVehicle, recordListingView } = await import("@/lib/server/db");
  const listing = byListing ? getListing(byListing) : null;
  const id = listing?.vehicle_id ?? vehicleId ?? params.id;
  const detail = getVehicleDetail(id, auth?.sub);
  if (!detail) return fail(404, "NOT_FOUND", "Listing not found");
  // A seller opening their own page is not a buyer view, so it must not inflate
  // the listing statistics shown in the Seller overview.
  const row = listing ?? getListing(`l-${id}`);
  const ownerId = getVehicle(id)?.owner_id;
  if (row && row.status === "published" && auth?.sub !== ownerId) recordListingView(row.id);
  return ok(detail);
}
