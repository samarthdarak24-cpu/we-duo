import { buildEvidenceGraph, getPersistedGraphCounts, persistEvidenceGraph } from "@/lib/server/evidence";
import { fail, getAuth, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/vehicles/:id/evidence-graph
 * Permission-based node/edge projection. Buyer visibility respects document
 * consent; hidden documents are counted, never leaked.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller", "admin");
  if (!guard.ok) return guard.response;
  const graph = buildEvidenceGraph(params.id, { id: guard.user.sub, role: guard.user.role });
  if (!graph) return fail(404, "NOT_FOUND", "Vehicle not found");
  return ok({ ...graph, persisted: getPersistedGraphCounts(params.id) });
}

/** POST /api/v1/vehicles/:id/evidence-graph — persist the current projection. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "seller", "admin");
  if (!guard.ok) return guard.response;
  const auth = getAuth(req);
  const result = persistEvidenceGraph(guard.user.sub, auth?.role ?? guard.user.role, params.id);
  if (!result.ok) return fail(result.code === "NOT_FOUND" ? 404 : 403, result.code, result.message);
  return ok(result);
}
