import { NextResponse } from "next/server";
import { fail, requireRole } from "@/lib/server/http";
import { callBackendAsUser, userBearer } from "@/lib/server/backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/v1/vehicles/[id]/damage/[damageId]/review */
export async function PATCH(req: Request, { params }: { params: { id: string; damageId: string } }) {
  const guard = requireRole(req, "seller", "admin");
  if (!guard.ok) return guard.response;
  const token = userBearer(req);
  if (!token) return fail(401, "UNAUTHENTICATED", "Session token missing.");

  const body = (await req.json().catch(() => null)) as
    | { status?: "verified" | "rejected"; component_id?: string; severity?: string; repair_status?: string }
    | null;
  if (!body || (body.status !== "verified" && body.status !== "rejected")) {
    return fail(422, "VALIDATION_FAILED", "status must be 'verified' or 'rejected'");
  }

  const result = await callBackendAsUser(
    `/api/v1/vehicles/${params.id}/damage/${params.damageId}/review`,
    token,
    body,
    { method: "PATCH" }
  );
  const status = result.status || 502;
  return NextResponse.json(result.data ?? { error: result.error ?? "Backend request failed." }, { status });
}
