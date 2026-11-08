import { NextResponse } from "next/server";
import { fail, requireRole } from "@/lib/server/http";
import { callBackendAsUser, userBearer } from "@/lib/server/backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/vehicles/[id]/documents/[docId]/ocr */
export async function POST(req: Request, { params }: { params: { id: string; docId: string } }) {
  const guard = requireRole(req, "seller", "admin");
  if (!guard.ok) return guard.response;
  const token = userBearer(req);
  if (!token) return fail(401, "UNAUTHENTICATED", "Session token missing.");

  // The default RapidOCR engine answers in ~5 s. When an operator explicitly
  // forces PaddleOCR (TD_OCR_PROVIDER=paddleocr) the first CPU inference can
  // take ~96 s, so give the real result time to arrive instead of returning a
  // false "unavailable" from the shared 90 s default.
  const result = await callBackendAsUser(
    `/api/v1/vehicles/${params.id}/documents/${params.docId}/ocr`,
    token,
    {},
    { method: "POST", timeout: 150_000 }
  );
  const status = result.status || 502;
  // 409 carries {available:false, reason}; forward it as-is.
  return NextResponse.json(result.data ?? { error: result.error ?? "Backend request failed." }, { status });
}

/** PATCH /api/v1/vehicles/[id]/documents/[docId]/ocr */
export async function PATCH(req: Request, { params }: { params: { id: string; docId: string } }) {
  const guard = requireRole(req, "seller", "admin");
  if (!guard.ok) return guard.response;
  const token = userBearer(req);
  if (!token) return fail(401, "UNAUTHENTICATED", "Session token missing.");

  const body = (await req.json().catch(() => null)) as { fields?: Record<string, unknown> } | null;
  if (!body || typeof body.fields !== "object" || body.fields === null) {
    return fail(422, "VALIDATION_FAILED", "fields object is required");
  }

  const result = await callBackendAsUser(
    `/api/v1/vehicles/${params.id}/documents/${params.docId}/ocr`,
    token,
    body,
    { method: "PATCH" }
  );
  const status = result.status || 502;
  return NextResponse.json(result.data ?? { error: result.error ?? "Backend request failed." }, { status });
}
