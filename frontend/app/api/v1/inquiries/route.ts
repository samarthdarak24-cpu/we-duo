import { createInquiryForBuyer, getInquiriesForBuyer, getInquiriesForSeller } from "@/lib/server/data";
import { created, fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/inquiries — role-aware list. */
export async function GET(req: Request) {
  const guard = requireRole(req, "buyer", "seller");
  if (!guard.ok) return guard.response;
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "0");
  const status = url.searchParams.get("status");
  let rows = guard.user.role === "seller" ? getInquiriesForSeller(guard.user.sub) : getInquiriesForBuyer(guard.user.sub);
  if (status && status !== "all") rows = rows.filter((r) => r.status === status);
  return ok(limit > 0 ? rows.slice(0, limit) : rows);
}

/** POST /api/v1/inquiries — body { listingId, message, type }. */
export async function POST(req: Request) {
  const guard = requireRole(req, "buyer");
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as { listingId?: string; message?: string; type?: string } | null;
  if (!body?.listingId) return fail(400, "VALIDATION_FAILED", "listingId is required");
  const result = createInquiryForBuyer(guard.user.sub, {
    listingId: body.listingId,
    message: body.message ?? "",
    type: body.type,
  });
  if (!result.ok) return fail(result.code === "NOT_FOUND" ? 404 : 400, result.code, result.message);
  return created(result);
}
