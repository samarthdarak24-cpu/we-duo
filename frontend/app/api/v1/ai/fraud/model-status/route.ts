import { NextResponse } from "next/server";
import { fail, requireRole } from "@/lib/server/http";
import { callBackendAsUser, userBearer } from "@/lib/server/backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/ai/fraud/model-status — honest, read-only capability report. */
export async function GET(req: Request) {
  const guard = requireRole(req);
  if (!guard.ok) return guard.response;
  const token = userBearer(req);
  if (!token) return fail(401, "UNAUTHENTICATED", "Session token missing.");

  const result = await callBackendAsUser("/api/v1/ai/fraud/model-status", token, undefined, { method: "GET" });
  const status = result.status || 502;
  return NextResponse.json(result.data ?? { error: result.error ?? "Backend request failed." }, { status });
}
