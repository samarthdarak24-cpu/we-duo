import { randomUUID } from "node:crypto";
import { all, createAudit, getListingByVehicle, getVehicle, run } from "@/lib/server/db";
import { buildEvidenceGraph, MODEL_VERSION, RULESET_VERSION } from "@/lib/server/evidence";
import { getRiskAnalysis } from "@/lib/server/data";
import { fail, ok, requireRole } from "@/lib/server/http";
import { LIMITS, enforceRateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AiRunRow {
  id: string;
  vehicle_id: string;
  case_id: string | null;
  graph: string;
  status: string;
  model_version: string;
  ruleset_version: string;
  input_refs: string;
  output_refs: string;
  started_at: string;
  finished_at: string | null;
}

function canInvestigate(vehicleId: string, userId: string, role: string) {
  const vehicle = getVehicle(vehicleId);
  if (!vehicle) return { ok: false as const, code: "NOT_FOUND", message: "Vehicle not found." };
  if (role === "admin" || vehicle.owner_id === userId) return { ok: true as const, vehicle };
  const listing = getListingByVehicle(vehicleId);
  if (role === "buyer" && listing?.status === "published") return { ok: true as const, vehicle };
  return { ok: false as const, code: "FORBIDDEN", message: "You do not have access to this vehicle's evidence." };
}

/** GET /api/v1/vehicles/:id/ai-investigations — persisted runs. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller", "admin");
  if (!guard.ok) return guard.response;
  const access = canInvestigate(params.id, guard.user.sub, guard.user.role);
  if (!access.ok) return fail(access.code === "NOT_FOUND" ? 404 : 403, access.code, access.message);
  const rows = all<AiRunRow>(
    "SELECT * FROM ai_runs WHERE vehicle_id = ? ORDER BY started_at DESC LIMIT 25",
    params.id
  );
  return ok({
    items: rows.map((row) => ({
      id: row.id,
      status: row.status,
      graph: row.graph,
      modelVersion: row.model_version,
      rulesetVersion: row.ruleset_version,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
    })),
    engine: MODEL_VERSION,
    note: "Runs are deterministic evidence reviews. No language model decides findings or the trust score.",
  });
}

/**
 * POST /api/v1/vehicles/:id/ai-investigations
 * Runs the deterministic evidence review: open findings, graph references and
 * a plain-language explanation. Hidden evidence is never included.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const limited = enforceRateLimit(req, "ai-investigation", LIMITS.write);
  if (limited) return limited;
  const guard = requireRole(req, "buyer", "seller", "admin");
  if (!guard.ok) return guard.response;
  const access = canInvestigate(params.id, guard.user.sub, guard.user.role);
  if (!access.ok) return fail(access.code === "NOT_FOUND" ? 404 : 403, access.code, access.message);

  const body = (await req.json().catch(() => ({}))) as { question?: string; caseId?: string };
  const question = (body.question ?? "Summarise the verified evidence and open findings.").slice(0, 500);
  const graph = buildEvidenceGraph(params.id, { id: guard.user.sub, role: guard.user.role });
  const risk = getRiskAnalysis(params.id);
  if (!graph || !risk) return fail(404, "NOT_FOUND", "Vehicle not found");

  const conflicts = graph.conflicts;
  const citations = [
    ...conflicts.slice(0, 8).map((c) => ({ kind: "finding", id: c.id, label: c.code, detail: c.title })),
    ...graph.nodes
      .filter((n) => n.type === "document" || n.type === "mileage_reading")
      .slice(0, 6)
      .map((n) => ({ kind: n.type, id: n.entityId, label: n.label, detail: `${n.source} · ${n.reliability}` })),
  ];
  const answer =
    conflicts.length === 0
      ? "No open findings are recorded for this vehicle. This reflects the available evidence only; missing data remains unknown rather than clean."
      : `${conflicts.length} open finding${conflicts.length === 1 ? "" : "s"} affect this vehicle: ${conflicts
          .slice(0, 4)
          .map((c) => `${c.title} (${c.severity})`)
          .join("; ")}. Each finding cites stored evidence and must be reviewed individually.`;

  const id = `airun-${randomUUID()}`;
  const now = new Date().toISOString();
  run(
    "INSERT INTO ai_runs (id, vehicle_id, case_id, graph, status, model_version, ruleset_version, input_refs, output_refs, started_at, finished_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    id,
    params.id,
    body.caseId ?? null,
    "deterministic-evidence-review",
    "completed",
    MODEL_VERSION,
    RULESET_VERSION,
    JSON.stringify({ documents: graph.counts.document ?? 0, readings: graph.counts.mileage_reading ?? 0, findings: conflicts.length }),
    JSON.stringify({ citations: citations.length, findings: conflicts.length }),
    now,
    now
  );
  createAudit({
    id: `aud-${randomUUID()}`,
    actor_id: guard.user.sub,
    action: "ai_investigation.run",
    entity_type: "vehicle",
    entity_id: params.id,
    before: "{}",
    after: JSON.stringify({ runId: id, engine: MODEL_VERSION }),
    ip: req.headers.get("x-forwarded-for") ?? "local",
    user_agent: req.headers.get("user-agent") ?? "web",
    at: now,
  });

  return ok({
    id,
    question,
    answer,
    citations,
    findings: conflicts,
    trust: { score: risk.trust.trustScore, coverage: risk.trust.evidenceCoverage },
    engine: MODEL_VERSION,
    graph: "deterministic-evidence-review",
    rulesetVersion: RULESET_VERSION,
    status: "completed",
    disclaimer:
      "Deterministic review of stored records. It explains evidence; it cannot approve a document, clear a finding, or certify a vehicle.",
  });
}
