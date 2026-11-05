import { getRun, getResults } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/verification/runs/:runId/stream — Server-Sent Events progress.
 * The demo pipeline is deterministic and completes synchronously, so this emits
 * the current snapshot and closes. A production worker would keep the stream open.
 */
export async function GET(_req: Request, { params }: { params: { runId: string } }) {
  const run = getRun(params.runId);
  if (!run) {
    return new Response(JSON.stringify({ error: { code: "NOT_FOUND", message: "Run not found" } }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
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
