import { aiHealth } from "@/lib/server/ai";
import { ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/ai/health — grounded assistant capability disclosure. */
export async function GET() {
  return ok(aiHealth());
}
