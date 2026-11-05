import { createNotification, getUserById, updateUser } from "@/lib/server/db";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/v1/admin/kyc/:userId — approve or reject a seller's KYC submission. */
export async function PATCH(req: Request, { params }: { params: { userId: string } }) {
  const guard = requireRole(req, "admin");
  if (!guard.ok) return guard.response;
  const target = getUserById(params.userId);
  if (!target || target.role !== "seller") return fail(404, "NOT_FOUND", "Seller not found.");
  const body = (await req.json().catch(() => ({}))) as { status?: string; note?: string };
  if (body.status !== "verified" && body.status !== "rejected") {
    return fail(400, "VALIDATION_FAILED", "status must be verified or rejected.");
  }
  updateUser(target.id, { kyc_status: body.status });
  createNotification({
    id: `n-${Date.now()}`,
    user_id: target.id,
    type: "kyc",
    title: body.status === "verified" ? "Seller KYC verified" : "Seller KYC needs attention",
    body: body.note || (body.status === "verified" ? "Your business identity is now verified." : "Please re-upload a clearer KYC document."),
    data: JSON.stringify({ status: body.status }),
    read: 0,
    created_at: new Date().toISOString(),
  });
  return ok({ userId: target.id, kycStatus: body.status });
}
