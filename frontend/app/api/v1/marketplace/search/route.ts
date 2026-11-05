import { getMarketplace } from "@/lib/server/data";
import { getAuth, ok } from "@/lib/server/http";
import { LIMITS, enforceRateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/marketplace/search?q= — text search + suggestions. */
export async function GET(req: Request) {
  const limited = enforceRateLimit(req, "marketplace-search", LIMITS.read);
  if (limited) return limited;
  const auth = getAuth(req);
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const result = getMarketplace({ q, pageSize: 24 }, auth?.sub);
  const suggestions = Array.from(new Set(result.items.map((i) => `${i.make} ${i.model}`))).slice(0, 6);
  return ok({ ...result, suggestions });
}
