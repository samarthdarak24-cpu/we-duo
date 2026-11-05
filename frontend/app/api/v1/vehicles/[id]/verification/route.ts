import { getResults, getRun } from "@/lib/server/db";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/vehicles/:id/verification — latest run + per-check results. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller", "admin");
  if (!guard.ok) return guard.response;
  const { getLatestRun } = await import("@/lib/server/db");
  const run = getLatestRun(params.id);
  if (!run) return fail(404, "NO_RUN", "No verification run exists for this vehicle.");
  return ok({
    run: { id: run.id, status: run.status, startedAt: run.started_at, finishedAt: run.finished_at, summary: JSON.parse(run.summary || "{}") },
    results: getResults(run.id).map((r) => ({ check: r.check_key, status: r.status, details: r.details })),
  });
}

/** POST /api/v1/vehicles/:id/verification — poll a run by id (?runId=). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "seller", "admin");
  if (!guard.ok) return guard.response;
  const runId = new URL(req.url).searchParams.get("runId");
  if (!runId) return fail(400, "VALIDATION_FAILED", "runId is required");
  const run = getRun(runId);
  if (!run || run.vehicle_id !== params.id) return fail(404, "NOT_FOUND", "Run not found");
  return ok({ run, results: getResults(runId) });
}
