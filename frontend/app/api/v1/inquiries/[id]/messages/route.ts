import { sendInquiryMessage } from "@/lib/server/data";
import { created, fail, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/inquiries/:id/messages — reply from either party. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller");
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as
    | { body?: string; offerAmount?: number; scheduledAt?: string; attachments?: string[] }
    | null;
  if (!body) return fail(400, "VALIDATION_FAILED", "A JSON body is required.");
  const result = sendInquiryMessage(guard.user.sub, params.id, {
    body: body.body ?? "",
    offerAmount: body.offerAmount,
    scheduledAt: body.scheduledAt,
    attachments: body.attachments,
  });
  if (!result.ok) return fail(result.code === "NOT_FOUND" ? 404 : result.code === "FORBIDDEN" ? 403 : 400, result.code, result.message);
  return created(result);
}
