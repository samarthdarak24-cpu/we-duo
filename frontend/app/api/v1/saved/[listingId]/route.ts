import { saveListingForBuyer, unsaveListingForBuyer } from "@/lib/server/data";
import { created, fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/saved/:listingId */
export async function POST(req: Request, { params }: { params: { listingId: string } }) {
  const guard = requireRole(req, "buyer");
  if (!guard.ok) return guard.response;
  const result = saveListingForBuyer(guard.user.sub, params.listingId);
  if (!result.ok) return fail(404, result.code, result.message);
  return created(result);
}

/** DELETE /api/v1/saved/:listingId */
export async function DELETE(req: Request, { params }: { params: { listingId: string } }) {
  const guard = requireRole(req, "buyer");
  if (!guard.ok) return guard.response;
  return ok(unsaveListingForBuyer(guard.user.sub, params.listingId));
}
