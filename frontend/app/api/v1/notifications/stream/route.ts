import { getNotificationsFor } from "@/lib/server/data";
import { requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/notifications/stream — SSE snapshot of the current notifications.
 * A production build would subscribe to a queue; the demo emits once and closes.
 */
export async function GET(req: Request) {
  const guard = requireRole(req);
  if (!guard.ok) return guard.response;
  const items = getNotificationsFor(guard.user.sub);
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`event: snapshot\ndata: ${JSON.stringify(items)}\n\n`));
      controller.close();
    },
  });
  return new Response(body, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
