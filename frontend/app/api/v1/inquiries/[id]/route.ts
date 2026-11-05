import { getInquiryThread } from "@/lib/server/data";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/inquiries/:id — thread (either party). */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller", "admin");
  if (!guard.ok) return guard.response;
  const thread = getInquiryThread(params.id);
  if (!thread) return fail(404, "NOT_FOUND", "Inquiry not found");
  if (guard.user.role !== "admin" && thread.buyerId !== guard.user.sub && thread.sellerId !== guard.user.sub) {
    return fail(403, "FORBIDDEN", "You are not part of this inquiry.");
  }
  return ok(thread);
}
