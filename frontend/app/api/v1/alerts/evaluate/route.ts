import { evaluateSavedSearchAlerts } from "@/lib/server/alerts";
import { getAuth, ok, requireRole } from "@/lib/server/http";
import { LIMITS, enforceRateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/alerts/evaluate
 * A buyer evaluates only their own saved searches; an admin may evaluate all.
 * Publishing and price changes evaluate automatically.
 */
export async function POST(req: Request) {
  const limited = enforceRateLimit(req, "alerts-evaluate", LIMITS.write);
  if (limited) return limited;
  const guard = requireRole(req, "buyer", "admin");
  if (!guard.ok) return guard.response;
  const auth = getAuth(req);
  const buyerId = auth?.role === "admin" ? undefined : guard.user.sub;
  const result = evaluateSavedSearchAlerts(buyerId);
  return ok({ ...result, evaluatedAt: new Date().toISOString(), scope: buyerId ? "own" : "all" });
}
