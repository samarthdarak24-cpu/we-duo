import { getSavedVehicles } from "@/lib/server/data";
import { bumpActivity, createSaved, deleteSaved, getListing, getListingByVehicle, getSavedRow } from "@/lib/server/db";
import { created, fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/saved — buyer shortlist with price/availability badges. */
export async function GET(req: Request) {
  const guard = requireRole(req, "buyer");
  if (!guard.ok) return guard.response;
  return ok(getSavedVehicles(guard.user.sub));
}

/** POST /api/v1/saved — save vehicle / listing to buyer shortlist. */
export async function POST(req: Request) {
  const guard = requireRole(req, "buyer");
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as { listingId?: string; vehicleId?: string } | null;
  const vehicleId = body?.vehicleId;
  let listingId = body?.listingId;
  if (!listingId && vehicleId) {
    const l = getListingByVehicle(vehicleId);
    listingId = l?.id;
  }
  if (!listingId) {
    return fail(400, "VALIDATION_FAILED", "A valid listingId or vehicleId is required.");
  }
  const existing = getSavedRow(guard.user.sub, listingId);
  if (existing) return ok({ saved: true, alreadySaved: true });

  const listing = getListing(listingId);
  const now = new Date().toISOString();
  createSaved({
    id: `sv-${Date.now()}`,
    buyer_id: guard.user.sub,
    listing_id: listingId,
    price_at_save: listing?.asking_price ?? 0,
    list_name: "All",
    created_at: now,
  });
  bumpActivity(guard.user.sub, "saved");
  return created({ saved: true, listingId });
}

/** DELETE /api/v1/saved — remove from buyer shortlist. */
export async function DELETE(req: Request) {
  const guard = requireRole(req, "buyer");
  if (!guard.ok) return guard.response;
  const url = new URL(req.url);
  const body = (await req.json().catch(() => null)) as { listingId?: string; vehicleId?: string } | null;
  let listingId = url.searchParams.get("listingId") || body?.listingId;
  const vehicleId = url.searchParams.get("vehicleId") || body?.vehicleId;
  if (!listingId && vehicleId) {
    const l = getListingByVehicle(vehicleId);
    listingId = l?.id;
  }
  if (!listingId) return fail(400, "VALIDATION_FAILED", "listingId or vehicleId is required.");
  deleteSaved(guard.user.sub, listingId);
  return ok({ unsaved: true, listingId });
}
