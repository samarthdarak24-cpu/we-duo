import { ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/ai/stack — live status of the intelligence stack.
 * Proxies the Python `/health` endpoint so the browser never needs the service
 * URL or a service token. Returns `connected:false` (never a fake "active")
 * when the service is down.
 */
export async function GET() {
  const base = process.env.TD_INTELLIGENCE_URL?.replace(/\/$/, "");
  if (!base) {
    return ok({
      connected: false,
      reason: "TD_INTELLIGENCE_URL is not configured; live stack status is unavailable.",
    });
  }
  try {
    const res = await fetch(`${base}/health`, {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!res.ok) {
      return ok({ connected: false, reason: `Intelligence service returned ${res.status}.` });
    }
    const h = (await res.json()) as Record<string, unknown> & {
      database?: unknown;
      ocr_backends?: unknown;
      intelligence?: unknown;
      llm?: unknown;
      agent?: { orchestrator?: string; checkpointing?: boolean; nodes?: unknown[] };
      blockchain?: unknown;
      worker?: unknown;
      integrations?: unknown;
    };
    return ok({
      connected: true,
      database: h.database,
      ocr: h.ocr_backends,
      intelligence: h.intelligence,
      llm: h.llm,
      agent: {
        orchestrator: h.agent?.orchestrator,
        checkpointing: h.agent?.checkpointing,
        nodes: h.agent?.nodes?.length ?? 0,
      },
      blockchain: h.blockchain,
      worker: h.worker,
      integrations: h.integrations,
    });
  } catch {
    return ok({ connected: false, reason: "Intelligence service is unreachable." });
  }
}
