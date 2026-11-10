// ---------------------------------------------------------------------------
// Evidence graph, verification cases, seller claims, cross-modal mileage and
// near-duplicate intelligence (design.md §7, §8, §11, §12).
//
// The graph is a deterministic projection over stored rows. It never invents
// an edge: every node carries the entity id a reviewer can open.
// ---------------------------------------------------------------------------
import { randomUUID } from "node:crypto";
import {
  all,
  appendChainRecord,
  createAudit,
  getChain,
  getDamage,
  getDocument,
  getDocuments,
  getFindings,
  getHistory,
  getLatestRun,
  getListingByVehicle,
  getMileage,
  getReportsByVehicle,
  getResults,
  getRun,
  getTheft,
  getVehicle,
  one,
  run,
} from "./db";

export const RULESET_VERSION = "rules-2.0.0";
export const MODEL_VERSION = "deterministic-rules-v1";
export const GRAPH_METHOD = "derived-projection";

export interface EvidenceNode {
  id: string;
  type: string;
  entityId: string;
  label: string;
  source: string;
  reliability: "high" | "medium" | "low" | "self_reported" | "unknown";
  disclosed: boolean;
  payload: Record<string, unknown>;
  createdAt: string | null;
}

export interface EvidenceEdge {
  id: string;
  source: string;
  relation: string;
  target: string;
}

export interface EvidenceConflict {
  id: string;
  code: string;
  severity: string;
  title: string;
  status: string;
  evidenceRefs: string[];
}

export interface EvidenceGraph {
  vehicleId: string;
  generatedAt: string;
  method: string;
  rulesetVersion: string;
  modelVersion: string;
  nodes: EvidenceNode[];
  edges: EvidenceEdge[];
  conflicts: EvidenceConflict[];
  hiddenDocuments: number;
  counts: Record<string, number>;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function docReliability(status: string): EvidenceNode["reliability"] {
  if (status === "verified") return "high";
  if (status === "pending" || status === "processing") return "medium";
  if (status === "needs_correction" || status === "suspicious") return "low";
  return "unknown";
}

function collector() {
  const nodes: EvidenceNode[] = [];
  const edges: EvidenceEdge[] = [];
  const seen = new Set<string>();
  const edge = (source: string, relation: string, target: string) => {
    edges.push({ id: `e-${edges.length + 1}`, source, relation, target });
  };
  const node = (n: EvidenceNode) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    nodes.push(n);
  };
  return { nodes, edges, node, edge };
}

export function buildEvidenceGraph(
  vehicleId: string,
  viewer?: { id: string; role: string }
): EvidenceGraph | null {
  const vehicle = getVehicle(vehicleId);
  if (!vehicle) return null;
  const listing = getListingByVehicle(vehicleId);
  const docs = getDocuments(vehicleId);
  const canSeeAllDocs = !viewer || viewer.role === "admin" || viewer.id === vehicle.owner_id;
  const visibleDocs = canSeeAllDocs
    ? docs
    : docs.filter((d) => d.consent === 1 && listing?.status === "published");
  const hiddenDocuments = docs.length - visibleDocs.length;

  const { nodes, edges, node, edge } = collector();
  const vehicleNode = `vehicle:${vehicle.id}`;
  node({
    id: vehicleNode,
    type: "vehicle",
    entityId: vehicle.id,
    label: `${vehicle.make ?? "Vehicle"} ${vehicle.model ?? ""}`.trim(),
    source: "vehicle_record",
    reliability: "high",
    disclosed: true,
    payload: { regNo: vehicle.reg_no, vin: vehicle.vin, year: vehicle.year, trustdriveId: vehicle.trustdrive_id },
    createdAt: vehicle.created_at,
  });

  for (const doc of visibleDocs) {
    const id = `document:${doc.id}`;
    node({
      id,
      type: "document",
      entityId: doc.id,
      label: `${doc.type.toUpperCase()} · ${doc.file_name}`,
      source: doc.file_key ? "uploaded_file" : "document_record",
      reliability: docReliability(doc.status),
      disclosed: doc.consent === 1,
      payload: {
        status: doc.status,
        version: doc.version,
        sha256: doc.sha256,
        verifiedAt: doc.verified_at,
        supersedesId: doc.supersedes_id,
        extracted: parseJson<Record<string, unknown>>(doc.extracted, {}),
      },
      createdAt: doc.uploaded_at,
    });
    edge(vehicleNode, "has_document", id);
  }

  for (const event of getHistory(vehicleId)) {
    const id = `event:${event.id}`;
    node({
      id,
      type: "history_event",
      entityId: event.id,
      label: event.title ?? event.category ?? "History event",
      source: event.source ?? "unknown",
      reliability:
        event.status === "verified" ? "high" : event.source === "seller_submitted" || event.status === "pending" ? "self_reported" : "medium",
      disclosed: true,
      payload: {
        category: event.category,
        date: event.event_date,
        km: event.mileage_km,
        status: event.status,
        supersedesId: event.supersedes_id,
      },
      createdAt: event.event_date,
    });
    edge(vehicleNode, "has_event", id);
    if (event.evidence_document_id) {
      const docId = `document:${event.evidence_document_id}`;
      if (nodes.some((n) => n.id === docId)) edge(docId, "supports", id);
    }
  }

  for (const reading of getMileage(vehicleId)) {
    const id = `reading:${reading.id}`;
    node({
      id,
      type: "mileage_reading",
      entityId: reading.id,
      label: `${Number(reading.km).toLocaleString("en-IN")} km`,
      source: reading.source ?? "unknown",
      reliability: reading.verified ? "high" : reading.is_seller_claim ? "self_reported" : "medium",
      disclosed: true,
      payload: {
        date: reading.date,
        km: reading.km,
        flagged: !!reading.flagged,
        verified: !!reading.verified,
        sellerClaim: !!reading.is_seller_claim,
      },
      createdAt: reading.date,
    });
    edge(vehicleNode, "has_reading", id);
    if (reading.document_id) {
      const docId = `document:${reading.document_id}`;
      if (nodes.some((n) => n.id === docId)) edge(docId, "supports", id);
    }
  }

  for (const damage of getDamage(vehicleId)) {
    const id = `damage:${damage.id}`;
    node({
      id,
      type: "damage_record",
      entityId: damage.id,
      label: `${damage.zone_id || damage.component_id || "detected_damage"} · ${damage.severity || "unassessed"}`,
      source: damage.repair_invoice_doc_id ? "repair_invoice" : "inspection",
      reliability: damage.status === "verified" ? "high" : "medium",
      disclosed: true,
      payload: {
        zoneId: damage.zone_id,
        severity: damage.severity,
        repairStatus: damage.repair_status,
        inspectionDate: damage.inspection_date,
        status: damage.status,
        photoKeys: parseJson<string[]>(damage.photo_keys, []),
        repairInvoiceDocId: damage.repair_invoice_doc_id,
      },
      createdAt: damage.created_at,
    });
    edge(vehicleNode, "has_damage", id);
    if (damage.repair_invoice_doc_id) {
      const docId = `document:${damage.repair_invoice_doc_id}`;
      if (nodes.some((n) => n.id === docId)) edge(docId, "supports", id);
    }
  }

  const findings = getFindings(vehicleId);
  const conflicts: EvidenceConflict[] = [];
  for (const finding of findings) {
    const id = `finding:${finding.id}`;
    const evidence = parseJson<Record<string, unknown>>(finding.evidence, {});
    node({
      id,
      type: "finding",
      entityId: finding.id,
      label: finding.title ?? finding.code,
      source: "rules_engine",
      reliability: "high",
      disclosed: true,
      payload: {
        code: finding.code,
        severity: finding.severity,
        status: finding.status,
        points: finding.points,
        explanation: finding.explanation,
        evidence,
        rulesetVersion: RULESET_VERSION,
      },
      createdAt: finding.created_at,
    });
    edge(vehicleNode, "raised_on", id);
    const refs: string[] = [];
    if (finding.responsible_doc) {
      const docId = `document:${finding.responsible_doc}`;
      if (nodes.some((n) => n.id === docId)) {
        edge(id, "references", docId);
        refs.push(finding.responsible_doc);
      }
    }
    for (const key of ["documentId", "eventId", "readingId", "damageId"]) {
      const value = evidence[key];
      if (typeof value === "string" && value) {
        const prefix = key === "documentId" ? "document" : key === "eventId" ? "event" : key === "readingId" ? "reading" : "damage";
        const refNode = `${prefix}:${value}`;
        if (nodes.some((n) => n.id === refNode)) {
          edge(id, "references", refNode);
          refs.push(value);
        }
      }
    }
    if (!["cleared", "explained", "resolved"].includes(finding.status)) {
      conflicts.push({
        id: finding.id,
        code: finding.code,
        severity: finding.severity,
        title: finding.title ?? finding.code,
        status: finding.status,
        evidenceRefs: refs,
      });
    }
  }

  const latestRun = getLatestRun(vehicleId);
  if (latestRun) {
    const id = `verification:${latestRun.id}`;
    const results = getResults(latestRun.id);
    node({
      id,
      type: "verification_run",
      entityId: latestRun.id,
      label: `Verification ${latestRun.status}`,
      source: "verification_pipeline",
      reliability: latestRun.status === "done" ? "high" : "medium",
      disclosed: true,
      payload: {
        status: latestRun.status,
        startedAt: latestRun.started_at,
        finishedAt: latestRun.finished_at,
        checks: results.map((r) => ({ key: r.check_key, status: r.status })),
        rulesetVersion: RULESET_VERSION,
      },
      createdAt: latestRun.started_at,
    });
    edge(vehicleNode, "verified_by", id);
    for (const finding of findings) {
      if (nodes.some((n) => n.id === `finding:${finding.id}`)) {
        edge(id, "produced", `finding:${finding.id}`);
      }
    }
  }

  const reports = getReportsByVehicle(vehicleId);
  for (const report of reports) {
    const id = `report:${report.id}`;
    node({
      id,
      type: "report",
      entityId: report.id,
      label: report.report_id ?? report.type ?? "Report",
      source: "report_service",
      reliability: report.status === "ready" ? "high" : "medium",
      disclosed: true,
      payload: { status: report.status, type: report.type, hash: report.pdf_hash, generatedAt: report.generated_at },
      createdAt: report.created_at,
    });
    edge(id, "summarises", vehicleNode);
  }

  const theft = getTheft(vehicleId);
  if (theft) {
    const id = `theft:${vehicleId}`;
    node({
      id,
      type: "provider_check",
      entityId: vehicleId,
      label: `Theft check · ${theft.status.replace(/_/g, " ")}`,
      source: theft.source ?? "unknown",
      reliability: theft.status === "unavailable" ? "unknown" : "medium",
      disclosed: true,
      payload: { status: theft.status, checkedAt: theft.checked_at, details: parseJson(theft.details, {}) },
      createdAt: theft.checked_at,
    });
    edge(id, "checked_vehicle", vehicleNode);
  }

  const chain = getChain(vehicleId);
  if (chain.length) {
    const id = `chain:${vehicleId}`;
    node({
      id,
      type: "hash_chain",
      entityId: vehicleId,
      label: `${chain.length} chained records`,
      source: "hash_chain",
      reliability: "high",
      disclosed: true,
      payload: { records: chain.length, latestHash: chain[chain.length - 1]?.record_hash ?? null },
      createdAt: chain[chain.length - 1]?.created_at ?? null,
    });
    edge(id, "hashes", vehicleNode);
  }

  const counts: Record<string, number> = {};
  for (const n of nodes) counts[n.type] = (counts[n.type] ?? 0) + 1;

  return {
    vehicleId,
    generatedAt: new Date().toISOString(),
    method: GRAPH_METHOD,
    rulesetVersion: RULESET_VERSION,
    modelVersion: MODEL_VERSION,
    nodes,
    edges,
    conflicts,
    hiddenDocuments,
    counts,
  };
}

/** Persist the current projection. Only the owner or an admin may do this. */
export function persistEvidenceGraph(actorId: string, role: string, vehicleId: string) {
  const vehicle = getVehicle(vehicleId);
  if (!vehicle) return { ok: false as const, code: "NOT_FOUND", message: "Vehicle not found." };
  if (role !== "admin" && vehicle.owner_id !== actorId) {
    return { ok: false as const, code: "FORBIDDEN", message: "You do not own this vehicle." };
  }
  const graph = buildEvidenceGraph(vehicleId, { id: actorId, role });
  if (!graph) return { ok: false as const, code: "NOT_FOUND", message: "Vehicle not found." };
  const now = new Date().toISOString();
  run("DELETE FROM evidence_edges WHERE vehicle_id = ?", vehicleId);
  run("DELETE FROM evidence_nodes WHERE vehicle_id = ?", vehicleId);
  for (const n of graph.nodes) {
    run(
      "INSERT INTO evidence_nodes (id, vehicle_id, node_type, entity_id, label, source, reliability, disclosed, payload, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
      n.id,
      vehicleId,
      n.type,
      n.entityId,
      n.label,
      n.source,
      n.reliability,
      n.disclosed ? 1 : 0,
      JSON.stringify(n.payload),
      n.createdAt ?? now
    );
  }
  for (const e of graph.edges) {
    run(
      "INSERT INTO evidence_edges (id, vehicle_id, source_node, relation, target_node, created_at) VALUES (?,?,?,?,?,?)",
      e.id,
      vehicleId,
      e.source,
      e.relation,
      e.target,
      now
    );
  }
  createAudit({
    id: `aud-${randomUUID()}`,
    actor_id: actorId,
    action: "evidence_graph.persist",
    entity_type: "vehicle",
    entity_id: vehicleId,
    before: "{}",
    after: JSON.stringify({ nodes: graph.nodes.length, edges: graph.edges.length }),
    ip: "local",
    user_agent: "web",
    at: now,
  });
  return { ok: true as const, nodes: graph.nodes.length, edges: graph.edges.length, persistedAt: now };
}

export function getPersistedGraphCounts(vehicleId: string) {
  const nodes = one<{ c: number }>("SELECT COUNT(*) AS c FROM evidence_nodes WHERE vehicle_id = ?", vehicleId)?.c ?? 0;
  const edges = one<{ c: number }>("SELECT COUNT(*) AS c FROM evidence_edges WHERE vehicle_id = ?", vehicleId)?.c ?? 0;
  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Verification cases
// ---------------------------------------------------------------------------
export function ensureVerificationCase(actorId: string, role: string, vehicleId: string) {
  const vehicle = getVehicle(vehicleId);
  if (!vehicle) return { ok: false as const, code: "NOT_FOUND", message: "Vehicle not found." };
  if (role !== "admin" && vehicle.owner_id !== actorId) {
    return { ok: false as const, code: "FORBIDDEN", message: "You do not own this vehicle." };
  }
  const latest = getLatestRun(vehicleId);
  if (!latest) return { ok: false as const, code: "NO_VERIFICATION_RUN", message: "Run verification before opening a case." };
  const id = `vc-${latest.id}`;
  const existing = one<{ id: string }>("SELECT id FROM verification_cases WHERE id = ?", id);
  const findings = getFindings(vehicleId).filter((f) => f.status !== "cleared");
  const summary = {
    openFindings: findings.length,
    highestSeverity: findings[0]?.severity ?? null,
    reviewRequired: findings.some((f) => f.severity === "critical" || f.severity === "high"),
    runStatus: latest.status,
  };
  const now = new Date().toISOString();
  if (!existing) {
    run(
      "INSERT INTO verification_cases (id, vehicle_id, run_id, subject, state, ruleset_version, model_version, requester_id, summary, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      id,
      vehicleId,
      latest.id,
      `${vehicle.make} ${vehicle.model} · ${vehicle.reg_no}`,
      latest.status === "done" ? "completed" : "running",
      RULESET_VERSION,
      MODEL_VERSION,
      actorId,
      JSON.stringify(summary),
      now,
      now
    );
  } else {
    run("UPDATE verification_cases SET summary = ?, updated_at = ? WHERE id = ?", JSON.stringify(summary), now, id);
  }
  return { ok: true as const, id, runId: latest.id, state: latest.status === "done" ? "completed" : "running" };
}

export function getVerificationCaseById(id: string) {
  const row = one<{
    id: string;
    vehicle_id: string;
    run_id: string | null;
    subject: string | null;
    state: string;
    ruleset_version: string;
    model_version: string;
    requester_id: string | null;
    summary: string;
    created_at: string;
    updated_at: string;
  }>("SELECT * FROM verification_cases WHERE id = ?", id);
  if (!row) return null;
  const vehicle = getVehicle(row.vehicle_id);
  const run = row.run_id ? getRun(row.run_id) : undefined;
  const results = row.run_id ? getResults(row.run_id) : [];
  return {
    case: {
      id: row.id,
      vehicleId: row.vehicle_id,
      runId: row.run_id,
      subject: row.subject,
      state: row.state,
      rulesetVersion: row.ruleset_version,
      modelVersion: row.model_version,
      requesterId: row.requester_id,
      summary: parseJson<Record<string, unknown>>(row.summary, {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    vehicle: vehicle
      ? { id: vehicle.id, make: vehicle.make, model: vehicle.model, regNo: vehicle.reg_no, vin: vehicle.vin }
      : null,
    run: run
      ? {
          id: run.id,
          status: run.status,
          startedAt: run.started_at,
          finishedAt: run.finished_at,
          summary: parseJson<Record<string, unknown>>(run.summary, {}),
        }
      : null,
    results: results.map((r) => ({
      id: r.id,
      checkKey: r.check_key,
      status: r.status,
      details: parseJson<Record<string, unknown>>(r.details, {}),
      evidenceIds: parseJson<string[]>(r.evidence_ids, []),
    })),
    findings: vehicle
      ? getFindings(row.vehicle_id).map((f) => ({
          id: f.id,
          code: f.code,
          severity: f.severity,
          title: f.title,
          status: f.status,
          evidence: parseJson<Record<string, unknown>>(f.evidence, {}),
        }))
      : [],
  };
}

// ---------------------------------------------------------------------------
// Seller claims (§11 vehicle_claims)
// ---------------------------------------------------------------------------
const CLAIM_FIELDS = new Set([
  "ownerCount",
  "accidentHistory",
  "serviceHistory",
  "insuranceStatus",
  "odometer",
  "color",
  "variant",
  "registrationDate",
  "previousUse",
]);

export function addVehicleClaim(
  actorId: string,
  vehicleId: string,
  input: { field?: string; value?: string; supersedesId?: string }
) {
  const vehicle = getVehicle(vehicleId);
  if (!vehicle) return { ok: false as const, code: "NOT_FOUND", message: "Vehicle not found." };
  if (vehicle.owner_id !== actorId) return { ok: false as const, code: "FORBIDDEN", message: "You do not own this vehicle." };
  const field = (input.field ?? "").trim();
  const value = (input.value ?? "").trim();
  if (!CLAIM_FIELDS.has(field)) {
    return { ok: false as const, code: "VALIDATION_FAILED", message: `field must be one of: ${Array.from(CLAIM_FIELDS).join(", ")}.` };
  }
  if (!value || value.length > 500) {
    return { ok: false as const, code: "VALIDATION_FAILED", message: "value must be 1–500 characters." };
  }
  const id = `claim-${randomUUID()}`;
  const now = new Date().toISOString();
  run(
    "INSERT INTO vehicle_claims (id, vehicle_id, field, value, source, status, submitted_by, supersedes_id, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    id,
    vehicleId,
    field,
    value,
    "seller_declared",
    "pending",
    actorId,
    input.supersedesId ?? null,
    now
  );
  appendChainRecord(vehicleId, "vehicle_claim", id, { field, value, supersedes: input.supersedesId ?? null });
  return { ok: true as const, id, status: "pending" };
}

export function getVehicleClaims(vehicleId: string) {
  return all<{
    id: string;
    field: string;
    value: string;
    source: string;
    status: string;
    submitted_by: string | null;
    supersedes_id: string | null;
    created_at: string;
  }>("SELECT * FROM vehicle_claims WHERE vehicle_id = ? ORDER BY created_at DESC", vehicleId).map((c) => ({
    id: c.id,
    field: c.field,
    value: c.value,
    source: c.source,
    status: c.status,
    submittedBy: c.submitted_by,
    supersedesId: c.supersedes_id,
    createdAt: c.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Cross-modal mileage verification (§7 Innovation 3)
// ---------------------------------------------------------------------------
export interface CrossModalConflict {
  type: string;
  severity: string;
  detail: string;
  values: { km: number; date: string; source: string }[];
  method: string;
  version: string;
}

export function crossModalMileage(vehicleId: string) {
  const vehicle = getVehicle(vehicleId);
  if (!vehicle) return null;
  const readings = getMileage(vehicleId);
  const isDocumentSource = (source: string | null, documentId: string | null) =>
    Boolean(documentId) || /ocr|document|invoice|service|inspection/i.test(source ?? "");

  const sellerSeries = readings
    .filter((r) => r.is_seller_claim === 1)
    .map((r) => ({ km: Number(r.km), date: r.date, source: r.source ?? "seller_submitted" }));
  const documentSeries = readings
    .filter((r) => isDocumentSource(r.source, r.document_id))
    .map((r) => ({ km: Number(r.km), date: r.date, source: r.source ?? "document" }));
  const independentSeries = readings
    .filter((r) => r.is_seller_claim !== 1 && !isDocumentSource(r.source, r.document_id))
    .map((r) => ({ km: Number(r.km), date: r.date, source: r.source ?? "unknown" }));

  const conflicts: CrossModalConflict[] = [];
  const DAY = 86_400_000;
  for (const claim of sellerSeries) {
    for (const doc of [...documentSeries, ...independentSeries]) {
      const days = Math.abs(new Date(doc.date).getTime() - new Date(claim.date).getTime()) / DAY;
      if (days <= 45 && Math.abs(doc.km - claim.km) >= 1500) {
        conflicts.push({
          type: "declared_vs_extracted",
          severity: Math.abs(doc.km - claim.km) >= 10_000 ? "high" : "medium",
          detail: `Declared ${claim.km.toLocaleString("en-IN")} km (${claim.date.slice(0, 10)}) differs from ${doc.km.toLocaleString(
            "en-IN"
          )} km in ${doc.source} (${doc.date.slice(0, 10)}).`,
          values: [claim, doc],
          method: "same-window cross-source comparison (45 days, 1,500 km threshold)",
          version: RULESET_VERSION,
        });
      }
    }
  }
  if (vehicle.last_verified_km > 0 && Math.abs(vehicle.km_claimed - vehicle.last_verified_km) >= 5000) {
    conflicts.push({
      type: "declared_vs_verified",
      severity: Math.abs(vehicle.km_claimed - vehicle.last_verified_km) >= 20_000 ? "high" : "medium",
      detail: `Claimed ${vehicle.km_claimed.toLocaleString("en-IN")} km differs from the last verified ${vehicle.last_verified_km.toLocaleString(
        "en-IN"
      )} km.`,
      values: [
        { km: vehicle.km_claimed, date: vehicle.updated_at, source: "seller_declared" },
        { km: vehicle.last_verified_km, date: vehicle.updated_at, source: "verified_record" },
      ],
      method: "declared vs last verified reading",
      version: RULESET_VERSION,
    });
  }

  const inputsAvailable = [sellerSeries.length, documentSeries.length, independentSeries.length].filter((n) => n > 0).length;
  return {
    vehicleId,
    status:
      conflicts.length > 0
        ? "conflict"
        : inputsAvailable >= 2
          ? "consistent"
          : "insufficient_inputs",
    method: "cross-modal-odometer",
    version: RULESET_VERSION,
    inputs: {
      sellerDeclared: sellerSeries.length,
      documentExtracted: documentSeries.length,
      independent: independentSeries.length,
    },
    series: { sellerSeries, documentSeries, independentSeries },
    conflicts,
    note:
      inputsAvailable < 2
        ? "At least two independent odometer sources are required before a cross-modal conclusion can be drawn."
        : "Conflict means the sources disagree; it is not, by itself, proof of odometer fraud.",
  };
}

// ---------------------------------------------------------------------------
// Near-duplicate document intelligence (§5.4, §7 Innovation 4, §8.1)
// ---------------------------------------------------------------------------
function normalizeText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 /.-]/g, "")
    .trim();
}

function trigrams(value: string): Set<string> {
  const text = normalizeText(value);
  const set = new Set<string>();
  for (let i = 0; i < Math.max(0, text.length - 2); i++) set.add(text.slice(i, i + 3));
  return set;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

export function nearDuplicateDocuments(vehicleId: string) {
  const docs = getDocuments(vehicleId);
  const candidates: {
    documentId: string;
    otherDocumentId: string;
    type: string;
    similarity: number;
    method: string;
    reason: string;
  }[] = [];

  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      const a = docs[i];
      const b = docs[j];
      if (a.sha256 === b.sha256) continue;
      const aText = JSON.stringify(parseJson<Record<string, unknown>>(a.extracted, {})) + " " + a.file_name;
      const bText = JSON.stringify(parseJson<Record<string, unknown>>(b.extracted, {})) + " " + b.file_name;
      const textScore = jaccard(trigrams(aText), trigrams(bText));
      const sizeClose =
        a.size_bytes > 0 && b.size_bytes > 0
          ? Math.abs(a.size_bytes - b.size_bytes) / Math.max(a.size_bytes, b.size_bytes) <= 0.02
          : false;
      const score = Math.max(textScore, sizeClose && a.type === b.type ? 0.72 : 0);
      if (score >= 0.82) {
        candidates.push({
          documentId: a.id,
          otherDocumentId: b.id,
          type: a.type === b.type ? a.type : `${a.type}/${b.type}`,
          similarity: Number(score.toFixed(3)),
          method: "ocr-text-trigram+jaccard",
          reason:
            textScore >= 0.82
              ? "Extracted text is highly similar despite a different file hash."
              : "Same document type and near-identical byte size with a different hash.",
        });
      }
    }
  }

  return {
    vehicleId,
    method: "ocr-text-trigram+jaccard",
    version: RULESET_VERSION,
    compared: docs.length,
    candidates: candidates.sort((a, b) => b.similarity - a.similarity).slice(0, 10),
    note:
      "Near-duplicate detection compares extracted text and metadata. A similarity is a review candidate, not proof that a document was altered.",
  };
}

// ---------------------------------------------------------------------------
// Document extractions (§11 document_extractions)
// ---------------------------------------------------------------------------
export function recordDocumentExtractions(documentId: string): number {
  const doc = getDocument(documentId);
  if (!doc) return 0;
  const parsed = parseJson<Record<string, unknown>>(doc.extracted, {});
  const rawFields =
    parsed.fields && typeof parsed.fields === "object"
      ? (parsed.fields as Record<string, unknown>)
      : parsed;
  const confidences =
    parsed.confidence && typeof parsed.confidence === "object"
      ? (parsed.confidence as Record<string, unknown>)
      : parsed.confidences && typeof parsed.confidences === "object"
        ? (parsed.confidences as Record<string, unknown>)
        : {};
  const pages =
    parsed.pages && typeof parsed.pages === "object" ? (parsed.pages as Record<string, unknown>) : {};
  const method = typeof parsed.method === "string" ? parsed.method : "ocr";

  run("DELETE FROM document_extractions WHERE document_id = ?", documentId);
  let count = 0;
  for (const [field, value] of Object.entries(rawFields)) {
    if (value === null || value === undefined || typeof value === "object") continue;
    if (count >= 50) break;
    const confidenceRaw = Number(confidences[field]);
    const pageRaw = Number(pages[field]);
    run(
      "INSERT INTO document_extractions (id, document_id, vehicle_id, field, value, confidence, page, method, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      `dx-${randomUUID()}`,
      documentId,
      doc.vehicle_id,
      field,
      String(value).slice(0, 500),
      Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : null,
      Number.isFinite(pageRaw) ? Math.trunc(pageRaw) : null,
      method,
      new Date().toISOString()
    );
    count += 1;
  }
  return count;
}

export function getDocumentExtractions(documentId: string) {
  return all<{
    id: string;
    field: string;
    value: string | null;
    confidence: number | null;
    page: number | null;
    method: string | null;
    created_at: string;
  }>("SELECT * FROM document_extractions WHERE document_id = ? ORDER BY field ASC", documentId).map((row) => ({
    id: row.id,
    field: row.field,
    value: row.value,
    confidence: row.confidence,
    page: row.page,
    method: row.method,
    createdAt: row.created_at,
  }));
}
