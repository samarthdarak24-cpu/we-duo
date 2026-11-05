import { generateListingDescription, transitionListingForActor } from "@/lib/server/data";
import { evaluateSavedSearchAlerts } from "@/lib/server/alerts";
import { fail, ok, requireRole } from "@/lib/server/http";
import { withIdempotency } from "@/lib/server/idempotency";
import { LIMITS, enforceRateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actions = ["publish", "pause", "resume", "unpublish", "sold", "mark-sold", "pending_review", "generate-description"] as const;
type Action = (typeof actions)[number];

/**
 * POST /api/v1/seller/listings/:id/:action
 * Covers publish / pause / unpublish / sold / pending_review and the
 * deterministic "Generate with AI" description draft (S8 / §4.5).
 */
export async function POST(req: Request, { params }: { params: { id: string; action: string } }) {
  const limited = enforceRateLimit(req, "listing-action", LIMITS.write);
  if (limited) return limited;
  return withIdempotency(req, `listing-action:${params.id}:${params.action}`, async () => {
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  const action = params.action as Action;
  if (!actions.includes(action)) return fail(404, "NOT_FOUND", "Unknown listing action");

  if (action === "generate-description") {
    const result = generateListingDescription(guard.user.sub, params.id);
    if (!result.ok) return fail(result.code === "NOT_FOUND" ? 404 : 403, result.code, result.message);
    return ok(result);
  }

  const effectiveAction =
    action === "mark-sold" ? "sold" : action === "resume" ? "publish" : action;
  const result = transitionListingForActor(guard.user.sub, params.id, effectiveAction as "publish" | "pause" | "unpublish" | "sold" | "pending_review");
  if (!result.ok) {
    const status =
      result.code === "NOT_FOUND"
        ? 404
        : result.code === "FORBIDDEN"
        ? 403
        : result.code === "INVALID_TRANSITION"
        ? 409
        : result.code === "PUBLISH_BLOCKED"
        ? 422
        : 400;
    return fail(status, result.code, result.message, "details" in result ? result.details : undefined);
  }
  if (action === "publish" || action === "sold" || action === "pending_review") {
    evaluateSavedSearchAlerts(undefined, params.id);
  }
  return ok(result);
  });
}
