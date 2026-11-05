import { bumpActivity, createSaved, deleteSaved, getListing, getListingByVehicle, getSavedRow, getVehicle } from "@/lib/server/db";
import { created, fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/vehicles/:id/save — toggle/save vehicle. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer");
  if (!guard.ok) return guard.response;
  const vehicle = getVehicle(params.id);
  if (!vehicle) return fail(404, "NOT_FOUND", "Vehicle not found.");

  let listing = getListingByVehicle(params.id);
  const listingId = listing?.id || `l-${params.id}`;
  const existing = getSavedRow(guard.user.sub, listingId);
  if (existing) {
    return ok({ saved: true, alreadySaved: true });
  }

  const now = new Date().toISOString();
  createSaved({
    id: `sv-${Date.now()}`,
    buyer_id: guard.user.sub,
    listing_id: listingId,
    price_at_save: vehicle.asking_price ?? 0,
    list_name: "All",
    created_at: now,
  });
  bumpActivity(guard.user.sub, "saved");
  return created({ saved: true, listingId });
}

/** DELETE /api/v1/vehicles/:id/save — unsave vehicle. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer");
  if (!guard.ok) return guard.response;
  const listing = getListingByVehicle(params.id);
  const listingId = listing?.id || `l-${params.id}`;
  deleteSaved(guard.user.sub, listingId);
  return ok({ unsaved: true, listingId });
}
