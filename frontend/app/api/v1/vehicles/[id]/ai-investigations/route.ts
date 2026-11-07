import { randomUUID } from "node:crypto";
import { all, createAudit, getListingByVehicle, getVehicle, run } from "@/lib/server/db";
import { buildEvidenceGraph, MODEL_VERSION, RULESET_VERSION } from "@/lib/server/evidence";
import { getRiskAnalysis } from "@/lib/server/data";
import { callIntelligence } from "@/lib/server/intelligence";
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

interface PythonFinding {
  anomaly_type?: string;
  severity?: string;
  explanation?: string;
  evidence?: string[];
  method?: string;
  model_version?: string;
  confidence?: number;
  recommended_review_action?: string;
}

interface PythonInvestigation {
  investigation_id: string;
  vehicle_id: string;
  question: string;
  orchestrator: string;
  checkpointing: boolean;
  nodes: string[];
  status: string;
  answer: Record<string, unknown>;
  findings: PythonFinding[];
  evidence_ids: string[];
  model_versions: Record<string, string>;
  human_review: { required: boolean; id: string | null; policy: string };
  limitations: string[];
}

/** Turn the agent's structured evidence answer into a readable paragraph. */
function agentAnswerText(result: PythonInvestigation): string {
  const answer = result.answer ?? {};
  const llm = typeof answer.llm_explanation === "string" ? answer.llm_explanation.trim() : "";
  if (llm) return llm;
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  const parts: string[] = [];
  const conflicts = strings(answer.unresolved_conflicts);
  if (conflicts.length) {
    parts.push(`${conflicts.length} unresolved conflict${conflicts.length === 1 ? "" : "s"}: ${conflicts.slice(0, 4).join("; ")}.`);
  } else {
    parts.push("The 15/16-node conditional review found no high-severity unresolved conflict in the stored evidence.");
  }
  const mileage = strings(answer.detected_mileage_anomalies);
  if (mileage.length) parts.push(`Mileage checks: ${mileage.slice(0, 3).join("; ")}.`);
  const docs = strings(answer.document_findings);
  if (docs.length) parts.push(`Document checks: ${docs.slice(0, 3).join("; ")}.`);
  const missing = strings(answer.missing_records);
  if (missing.length) {
    parts.push(`Missing records: ${missing.slice(0, 4).join("; ")} — unverified coverage, not proof of a clean history.`);
  }
  if (typeof answer.recommended_next_action === "string") parts.push(answer.recommended_next_action);
  parts.push(`Orchestrator: ${result.orchestrator}; ${result.nodes?.length ?? 0} of 16 registered nodes executed (15 for combustion, 16 for electric).`);
  return parts.join(" ");
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

  const now = new Date().toISOString();

  // 1. Prefer the real 15/16-node conditional Python investigator. It reads the same shared DB,
  //    persists its own investigation + human-review rows and reports whether
  //    LangGraph or the sequential fallback actually executed.
  const agent = await callIntelligence<PythonInvestigation>(
    "/api/intelligence/investigate",
    { vehicle_id: params.id, question, thread_id: null },
    { timeout: 150_000 }
  );

  if (agent.ok && agent.data) {
    const result = agent.data;
    const id = `airun-${randomUUID()}`;
    const findings = (result.findings ?? []).map((f, index) => ({
      id: `${result.investigation_id}-f${index + 1}`,
      title: f.anomaly_type ? f.anomaly_type.replace(/_/g, " ") : "Detected anomaly",
      severity: f.severity ?? "medium",
      explanation: f.explanation ?? null,
      evidence: f.evidence ?? [],
      method: f.method ?? null,
      modelVersion: f.model_version ?? null,
      confidence: typeof f.confidence === "number" ? f.confidence : null,
      recommendation: f.recommended_review_action ?? null,
    }));
    const citations = [
      ...(result.evidence_ids ?? []).slice(0, 10).map((evidenceId) => ({
        kind: "evidence",
        id: evidenceId,
        label: evidenceId,
        detail: "Referenced by the 15/16-node conditional investigator",
      })),
      ...findings.slice(0, 8).map((f) => ({
        kind: "finding",
        id: f.id,
        label: f.title,
        detail: f.explanation ?? "",
      })),
    ];
    const agentFindings = (result.findings ?? []) as PythonFinding[];
    run(
      "INSERT INTO ai_runs (id, vehicle_id, case_id, graph, status, model_version, ruleset_version, input_refs, output_refs, started_at, finished_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      id,
      params.id,
      body.caseId ?? null,
      result.orchestrator === "langgraph" ? "langgraph-conditional" : "sequential-conditional",
      result.status === "awaiting_review" ? "awaiting_review" : "completed",
      result.model_versions?.agent ?? MODEL_VERSION,
      result.model_versions?.fraud_rules ?? RULESET_VERSION,
      JSON.stringify({
        investigationId: result.investigation_id,
        documents: graph.counts.document ?? 0,
        readings: graph.counts.mileage_reading ?? 0,
        findings: agentFindings.length,
      }),
      JSON.stringify({
        citations: citations.length,
        findings: agentFindings.length,
        humanReviewId: result.human_review?.id ?? null,
      }),
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
      after: JSON.stringify({
        runId: id,
        investigationId: result.investigation_id,
        orchestrator: result.orchestrator,
      }),
      ip: req.headers.get("x-forwarded-for") ?? "local",
      user_agent: req.headers.get("user-agent") ?? "web",
      at: now,
    });

    return ok({
      id,
      investigationId: result.investigation_id,
      question,
      answer: agentAnswerText(result),
      citations,
      findings,
      trust: { score: risk.trust.trustScore, coverage: risk.trust.evidenceCoverage },
      engine: result.model_versions?.agent ?? MODEL_VERSION,
      graph: result.orchestrator === "langgraph" ? "langgraph-conditional" : "sequential-conditional",
      orchestrator: result.orchestrator,
      checkpointing: result.checkpointing,
      nodes: result.nodes ?? [],
      humanReview: result.human_review ?? { required: false, id: null },
      modelVersions: result.model_versions ?? {},
      limitations: result.limitations ?? [],
      rulesetVersion: result.model_versions?.fraud_rules ?? RULESET_VERSION,
      status: result.status ?? "completed",
      source: "python-intelligence",
      disclaimer:
        "Evidence review over stored records. An LLM never sets the trust score, clears a finding, or certifies the vehicle. Human review is required for high-impact unresolved findings.",
    });
  }

  // 2. Honest fallback: the deterministic Next review still runs, but the
  //    payload says exactly why the agent result is missing.
  const id = `airun-${randomUUID()}`;
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
    after: JSON.stringify({ runId: id, engine: MODEL_VERSION, agentUnavailable: agent.error }),
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
    orchestrator: "deterministic-next",
    nodes: [],
    humanReview: { required: false, id: null },
    modelVersions: { evidence: MODEL_VERSION, rules: RULESET_VERSION },
    limitations: [
      `The 15/16-node conditional Python investigator did not answer: ${agent.error ?? "service unavailable"}.`,
      "This run uses the Next.js deterministic evidence review instead; it is not a LangGraph execution.",
    ],
    fallbackReason: agent.error ?? "Intelligence service unavailable.",
    rulesetVersion: RULESET_VERSION,
    status: "completed",
    source: "next-deterministic-fallback",
    disclaimer:
      "Deterministic review of stored records. It explains evidence; it cannot approve a document, clear a finding, or certify a vehicle.",
  });
}
