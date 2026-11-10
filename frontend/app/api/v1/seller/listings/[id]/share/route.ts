import { createListingShareForActor, revokeListingSharesForActor } from "@/lib/server/data";
import { appBaseUrl, created, fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/seller/listings/:id/share — mint a revocable share link + QR. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  const result = await createListingShareForActor(guard.user.sub, params.id, appBaseUrl(req));
  if (!result.ok) {
    return fail(result.code === "NOT_FOUND" ? 404 : 403, result.code, result.message);
  }
  return created(result);
}

/** DELETE /api/v1/seller/listings/:id/share — revoke every active share token. */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  const result = revokeListingSharesForActor(guard.user.sub, params.id);
  if (!result.ok) {
    return fail(result.code === "NOT_FOUND" ? 404 : 403, result.code, result.message);
  }
  return ok(result);
}
