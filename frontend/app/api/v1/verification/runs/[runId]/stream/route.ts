import { getResults, getRun, getVehicle } from "@/lib/server/db";
import { fail, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/verification/runs/:runId/stream — Server-Sent Events progress.
 * The demo pipeline is deterministic and completes synchronously, so this emits
 * the current snapshot and closes. A production worker would keep the stream open.
 */
export async function GET(req: Request, { params }: { params: { runId: string } }) {
  const guard = requireRole(req, "seller", "buyer", "admin");
  if (!guard.ok) return guard.response;
  const run = getRun(params.runId);
  if (!run) return fail(404, "NOT_FOUND", "Run not found");
  // The stream carries the same check results as the role-gated verification
  // endpoint, so enforce the same owner/admin visibility here.
  const ownerId = getVehicle(run.vehicle_id)?.owner_id;
  if (ownerId !== guard.user.sub && guard.user.role !== "admin") {
    return fail(403, "FORBIDDEN", "This run belongs to another account.");
  }
  const results = getResults(run.id);
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`event: snapshot\ndata: ${JSON.stringify({ run, results })}\n\n`));
      controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ status: run.status })}\n\n`));
      controller.close();
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
