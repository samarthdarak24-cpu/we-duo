import { NextResponse } from "next/server";
import { fail, requireRole } from "@/lib/server/http";
import { callBackendAsUser, userBearer } from "@/lib/server/backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/vehicles/[vehicleId]/photos/[photoId]/detect */
export async function POST(req: Request, { params }: { params: { id: string; photoId: string } }) {
  const guard = requireRole(req, "seller", "admin");
  if (!guard.ok) return guard.response;
  const token = userBearer(req);
  if (!token) return fail(401, "UNAUTHENTICATED", "Session token missing.");

  const result = await callBackendAsUser(
    `/api/v1/vehicles/${params.id}/photos/${params.photoId}/detect`,
    token,
    {}
  );
  const status = result.status || 502;
  // Forward the upstream body + status verbatim (409 carries {available:false, reason}).
  return NextResponse.json(result.data ?? { error: result.error ?? "Backend request failed." }, { status });
}
