// ---------------------------------------------------------------------------
// Accessors for the Phase 4 intelligence + profile entities. Kept beside db.ts
// rather than inside it so the core schema module stays readable; both share the
// single SQLite connection from getDb().
//
// Soft deletion rule: every read of a `deleted_at`-bearing table filters
// `deleted_at IS NULL`, so removing a record hides it from the product while the
// row is retained for audit. Nothing here ever DELETEs a verified record.
// ---------------------------------------------------------------------------
import { createHash } from "node:crypto";
import { all, getDb, one, run } from "./db";

type Params = (string | number | null | undefined)[];
const bind = (p: Params): (string | number | null)[] => p.map((v) => (v === undefined ? null : v));

const g = globalThis as unknown as { __tdTx?: number };

/** Runs `fn` between BEGIN/COMMIT, rolling back on throw. Re-entrant safe. */
export function transact<T>(fn: () => T): T {
  const conn = getDb();
  if (g.__tdTx) return fn();
  conn.exec("BEGIN IMMEDIATE");
  g.__tdTx = 1;
  try {
    const out = fn();
    conn.exec("COMMIT");
    return out;
  } catch (err) {
    try {
      conn.exec("ROLLBACK");
    } catch {
      /* an already-aborted transaction has nothing to roll back */
    }
    throw err;
  } finally {
    g.__tdTx = 0;
  }
}

export const newId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${createHash("sha256").update(String(Math.random())).digest("hex").slice(0, 6)}`;

const now = () => new Date().toISOString();

// ---- seller_profiles / buyer_profiles -------------------------------------
export interface SellerProfileRow {
  user_id: string;
  display_name: string | null;
  business_name: string | null;
  seller_type: string | null;
  gstin: string | null;
  pan: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  verified_dealer: number;
  trust_badge: string | null;
  rating: number;
  total_sales: number;
  avg_response_hours: number | null;
  bio: string | null;
  joined_at: string | null;
  updated_at: string;
  deleted_at: string | null;
}

export function getSellerProfile(userId: string) {
  return one<SellerProfileRow>(
    "SELECT * FROM seller_profiles WHERE user_id = ? AND deleted_at IS NULL",
    userId
  );
}

export function upsertSellerProfile(userId: string, patch: Partial<Record<keyof SellerProfileRow, string | number | null>>) {
  const existing = getSellerProfile(userId);
  if (!existing) {
    run(
      `INSERT INTO seller_profiles (user_id, display_name, business_name, seller_type, city, state, phone,
         verified_dealer, rating, total_sales, avg_response_hours, bio, joined_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ...bind([userId, patch.display_name, patch.business_name, patch.seller_type ?? "individual", patch.city,
        patch.state, patch.phone, patch.verified_dealer ?? 0, patch.rating ?? 0, patch.total_sales ?? 0,
        patch.avg_response_hours, patch.bio, now(), now()])
    );
    return getSellerProfile(userId)!;
  }
  const cols = Object.keys(patch).filter((k) => k !== "user_id" && k !== "updated_at" && k !== "deleted_at") as (keyof SellerProfileRow)[];
  if (cols.length) {
    run(
      `UPDATE seller_profiles SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = ? WHERE user_id = ?`,
      ...bind([...cols.map((c) => patch[c]), now(), userId])
    );
  }
  return getSellerProfile(userId)!;
}

export interface BuyerProfileRow {
  user_id: string;
  display_name: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  budget_min: number | null;
  budget_max: number | null;
  preferred_makes: string;
  preferred_fuel: string | null;
  notification_prefs: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export function getBuyerProfile(userId: string) {
  return one<BuyerProfileRow>("SELECT * FROM buyer_profiles WHERE user_id = ? AND deleted_at IS NULL", userId);
}

export function upsertBuyerProfile(userId: string, patch: Partial<Record<keyof BuyerProfileRow, string | number | null>>) {
  const existing = getBuyerProfile(userId);
  if (!existing) {
    run(
      `INSERT INTO buyer_profiles (user_id, display_name, city, state, phone, budget_min, budget_max,
         preferred_makes, preferred_fuel, notification_prefs, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      ...bind([userId, patch.display_name, patch.city, patch.state, patch.phone, patch.budget_min, patch.budget_max,
        patch.preferred_makes ?? "[]", patch.preferred_fuel, patch.notification_prefs ?? "{}", now(), now()])
    );
    return getBuyerProfile(userId)!;
  }
  const cols = Object.keys(patch).filter((k) => k !== "user_id" && k !== "updated_at" && k !== "created_at" && k !== "deleted_at") as (keyof BuyerProfileRow)[];
  if (cols.length) {
    run(
      `UPDATE buyer_profiles SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = ? WHERE user_id = ?`,
      ...bind([...cols.map((c) => patch[c]), now(), userId])
    );
  }
  return getBuyerProfile(userId)!;
}

// ---- vehicle_images -------------------------------------------------------
export interface VehicleImageRow {
  id: string;
  vehicle_id: string;
  file_key: string;
  kind: string;
  caption: string;
  position: number;
  sha256: string | null;
  created_at: string;
}

export function getVehicleImages(vehicleId: string) {
  return all<VehicleImageRow>(
    "SELECT * FROM vehicle_images WHERE vehicle_id = ? AND deleted_at IS NULL ORDER BY position, created_at",
    vehicleId
  );
}

export function addVehicleImage(input: {
  vehicleId: string;
  fileKey: string;
  kind?: string;
  caption?: string;
  sha256?: string;
  uploadedBy?: string;
  position?: number;
}) {
  const id = newId("vi");
  const position = input.position ?? getVehicleImages(input.vehicleId).length + 1;
  run(
    `INSERT INTO vehicle_images (id, vehicle_id, file_key, kind, caption, position, sha256, uploaded_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    ...bind([id, input.vehicleId, input.fileKey, input.kind ?? "photo", input.caption ?? "", position,
      input.sha256, input.uploadedBy, now()])
  );
  return id;
}

export function softDeleteVehicleImage(id: string) {
  run("UPDATE vehicle_images SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL", now(), id);
}

// ---- accident_records -----------------------------------------------------
export interface AccidentRow {
  id: string;
  vehicle_id: string;
  event_date: string;
  severity: string;
  description: string;
  police_fir: string | null;
  damage_zones: string;
  impact_zone: string | null;
  airbag_deployed: number | null;
  repair_status: string;
  estimated_cost: number | null;
  source_document_id: string | null;
  source: string;
  verified: number;
  verified_at: string | null;
  created_at: string;
}

export function getAccidentRecords(vehicleId: string) {
  return all<AccidentRow>(
    "SELECT * FROM accident_records WHERE vehicle_id = ? AND deleted_at IS NULL ORDER BY event_date DESC",
    vehicleId
  );
}

export function createAccidentRecord(input: {
  vehicleId: string;
  eventDate: string;
  severity: string;
  description: string;
  policeFir?: string;
  damageZones?: string[];
  impactZone?: string;
  airbagDeployed?: number;
  repairStatus?: string;
  estimatedCost?: number;
  repairInvoiceDocId?: string;
  sourceDocumentId?: string;
  source?: string;
  supersedesId?: string;
  createdBy?: string;
}) {
  const id = newId("acc");
  run(
    `INSERT INTO accident_records (id, vehicle_id, event_date, severity, description, police_fir, damage_zones,
       impact_zone, airbag_deployed, repair_status, estimated_cost, repair_invoice_doc_id, source_document_id,
       source, verified, supersedes_id, created_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ...bind([id, input.vehicleId, input.eventDate, input.severity, input.description, input.policeFir,
      JSON.stringify(input.damageZones ?? []), input.impactZone, input.airbagDeployed,
      input.repairStatus ?? "unknown", input.estimatedCost, input.repairInvoiceDocId, input.sourceDocumentId,
      input.source ?? "seller_reported", 0, input.supersedesId, input.createdBy, now(), now()])
  );
  return id;
}

export function setAccidentVerified(id: string) {
  run("UPDATE accident_records SET verified = 1, verified_at = ?, updated_at = ? WHERE id = ?", now(), now(), id);
}

export function countAccidents(vehicleId: string) {
  return one<{ c: number }>(
    "SELECT COUNT(*) AS c FROM accident_records WHERE vehicle_id = ? AND deleted_at IS NULL",
    vehicleId
  )?.c ?? 0;
}

// ---- vehicle_inspections --------------------------------------------------
export interface InspectionRow {
  id: string;
  vehicle_id: string;
  inspector_id: string | null;
  inspector_name: string | null;
  inspection_type: string;
  inspection_date: string;
  odometer_km: number | null;
  structural_damage: number | null;
  passed: number | null;
  score: number | null;
  status: string;
  summary: string;
  findings_json: string;
  evidence_json: string;
  review_note: string | null;
  created_at: string;
}

export function getInspections(vehicleId: string) {
  return all<InspectionRow>(
    "SELECT * FROM vehicle_inspections WHERE vehicle_id = ? AND deleted_at IS NULL ORDER BY inspection_date DESC",
    vehicleId
  );
}

export function getInspection(id: string) {
  return one<InspectionRow>("SELECT * FROM vehicle_inspections WHERE id = ? AND deleted_at IS NULL", id);
}

export function createInspection(input: {
  vehicleId: string;
  inspectionDate: string;
  inspectionType?: string;
  inspectorId?: string;
  inspectorName?: string;
  odometerKm?: number;
  structuralDamage?: number;
  passed?: number;
  score?: number;
  summary?: string;
  findings?: unknown[];
  evidence?: unknown[];
  reportDocumentId?: string;
}) {
  const id = newId("insp");
  const at = now();
  run(
    `INSERT INTO vehicle_inspections (id, vehicle_id, inspector_id, inspector_name, inspection_type, inspection_date,
       odometer_km, structural_damage, passed, score, status, summary, findings_json, evidence_json,
       report_document_id, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ...bind([id, input.vehicleId, input.inspectorId, input.inspectorName, input.inspectionType ?? "pre_purchase",
      input.inspectionDate, input.odometerKm, input.structuralDamage, input.passed, input.score, "pending",
      input.summary ?? "", JSON.stringify(input.findings ?? []), JSON.stringify(input.evidence ?? []),
      input.reportDocumentId, at, at])
  );
  return id;
}

export function reviewInspection(id: string, status: "approved" | "rejected", reviewedBy: string, note: string) {
  run(
    "UPDATE vehicle_inspections SET status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ?, updated_at = ? WHERE id = ?",
    status, reviewedBy, now(), note, now(), id
  );
}

// ---- verification_evidence ------------------------------------------------
export interface EvidenceRow {
  id: string;
  vehicle_id: string;
  run_id: string | null;
  result_id: string | null;
  finding_id: string | null;
  document_id: string | null;
  inspection_id: string | null;
  accident_id: string | null;
  kind: string;
  label: string;
  source: string;
  reliability: string;
  excerpt: string;
  sha256: string | null;
  disclosed_to_buyer: number;
  created_at: string;
}

export function createEvidence(input: {
  vehicleId: string;
  kind: string;
  label: string;
  source: string;
  runId?: string;
  resultId?: string;
  findingId?: string;
  documentId?: string;
  inspectionId?: string;
  accidentId?: string;
  reliability?: string;
  excerpt?: string;
  payload?: unknown;
  sha256?: string;
  disclosedToBuyer?: boolean;
}) {
  const id = newId("ev");
  run(
    `INSERT INTO verification_evidence (id, vehicle_id, run_id, result_id, finding_id, document_id, inspection_id,
       accident_id, kind, label, source, reliability, excerpt, payload, sha256, disclosed_to_buyer, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ...bind([id, input.vehicleId, input.runId, input.resultId, input.findingId, input.documentId, input.inspectionId,
      input.accidentId, input.kind, input.label, input.source, input.reliability ?? "unknown",
      input.excerpt ?? "", JSON.stringify(input.payload ?? {}), input.sha256,
      input.disclosedToBuyer ? 1 : 0, now()])
  );
  return id;
}

export function getEvidenceForVehicle(vehicleId: string, buyerVisibleOnly = false) {
  return all<EvidenceRow>(
    `SELECT * FROM verification_evidence WHERE vehicle_id = ?${buyerVisibleOnly ? " AND disclosed_to_buyer = 1" : ""} ORDER BY created_at`,
    vehicleId
  );
}

export function getEvidenceForRun(runId: string) {
  return all<EvidenceRow>("SELECT * FROM verification_evidence WHERE run_id = ? ORDER BY created_at", runId);
}

// ---- ai_analysis ----------------------------------------------------------
export interface AiAnalysisRow {
  id: string;
  vehicle_id: string;
  run_id: string | null;
  kind: string;
  anomaly_type: string | null;
  title: string;
  explanation: string;
  severity: string;
  method: string;
  model_version: string;
  confidence: number | null;
  readings_json: string;
  evidence_json: string;
  features_json: string;
  contributions_json: string;
  recommended_action: string | null;
  review_state: string;
  disclaimer: string;
  created_at: string;
}

export function createAiAnalysis(input: {
  vehicleId: string;
  kind: string;
  title: string;
  explanation: string;
  method: string;
  modelVersion: string;
  severity?: string;
  anomalyType?: string;
  confidence?: number;
  readings?: unknown[];
  evidence?: unknown[];
  features?: Record<string, unknown>;
  contributions?: unknown[];
  recommendedAction?: string;
  reviewState?: string;
  runId?: string;
  disclaimer?: string;
}) {
  const id = newId("ai");
  run(
    `INSERT INTO ai_analysis (id, vehicle_id, run_id, kind, anomaly_type, title, explanation, severity, method,
       model_version, confidence, readings_json, evidence_json, features_json, contributions_json,
       recommended_action, review_state, disclaimer, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ...bind([id, input.vehicleId, input.runId, input.kind, input.anomalyType, input.title, input.explanation,
      input.severity ?? "info", input.method, input.modelVersion, input.confidence,
      JSON.stringify(input.readings ?? []), JSON.stringify(input.evidence ?? []),
      JSON.stringify(input.features ?? {}), JSON.stringify(input.contributions ?? []),
      input.recommendedAction, input.reviewState ?? "auto",
      input.disclaimer ?? "Deterministic analysis of stored records. Not proof of fraud.", now()])
  );
  return id;
}

export function getAiAnalysis(vehicleId: string, kind?: string) {
  return all<AiAnalysisRow>(
    `SELECT * FROM ai_analysis WHERE vehicle_id = ?${kind ? " AND kind = ?" : ""} ORDER BY created_at DESC`,
    ...(kind ? [vehicleId, kind] : [vehicleId])
  );
}

export function getAiAnalysisRow(id: string) {
  return one<AiAnalysisRow>("SELECT * FROM ai_analysis WHERE id = ?", id);
}

export function setAiReview(id: string, state: "confirmed" | "dismissed" | "corrected", by: string, note: string) {
  run("UPDATE ai_analysis SET review_state = ?, reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ?",
    state, by, now(), note, id);
}

// ---- trust_scores (append-only history) -----------------------------------
export interface TrustScoreRow {
  id: string;
  vehicle_id: string;
  score: number;
  band: string;
  version: string;
  method: string;
  weights_json: string;
  factors_json: string;
  positive_json: string;
  negative_json: string;
  unverified_json: string;
  missing_policy: string;
  evidence_coverage: number;
  computed_at: string;
}

export function recordTrustScore(input: Omit<TrustScoreRow, "id" | "computed_at"> & { computedAt?: string }) {
  const id = newId("ts");
  run(
    `INSERT INTO trust_scores (id, vehicle_id, score, band, version, method, weights_json, factors_json,
       positive_json, negative_json, unverified_json, missing_policy, evidence_coverage, computed_at, computed_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ...bind([id, input.vehicle_id, input.score, input.band, input.version, input.method, input.weights_json,
      input.factors_json, input.positive_json, input.negative_json, input.unverified_json,
      input.missing_policy, input.evidence_coverage, input.computedAt ?? now(), null])
  );
  return id;
}

export function getLatestTrustScore(vehicleId: string) {
  return one<TrustScoreRow>(
    "SELECT * FROM trust_scores WHERE vehicle_id = ? ORDER BY computed_at DESC LIMIT 1",
    vehicleId
  );
}

export function getTrustScoreHistory(vehicleId: string, limit = 20) {
  return all<TrustScoreRow>(
    "SELECT * FROM trust_scores WHERE vehicle_id = ? ORDER BY computed_at DESC LIMIT ?",
    vehicleId,
    limit
  );
}

// ---- background_jobs ------------------------------------------------------
export interface JobRow {
  id: string;
  type: string;
  subject_type: string | null;
  subject_id: string | null;
  status: string;
  priority: number;
  attempts: number;
  max_attempts: number;
  timeout_ms: number;
  idempotency_key: string | null;
  payload: string;
  result: string | null;
  error: string | null;
  progress: number;
  progress_label: string | null;
  run_after: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export function enqueueJob(input: {
  type: string;
  subjectType?: string;
  subjectId?: string;
  payload?: unknown;
  priority?: number;
  maxAttempts?: number;
  timeoutMs?: number;
  idempotencyKey?: string;
  runAfter?: string;
}) {
  const existing = input.idempotencyKey
    ? one<{ id: string }>("SELECT id FROM background_jobs WHERE idempotency_key = ?", input.idempotencyKey)
    : undefined;
  if (existing) return { id: existing.id, deduplicated: true };
  const id = newId("job");
  const at = now();
  run(
    `INSERT INTO background_jobs (id, type, subject_type, subject_id, status, priority, attempts, max_attempts,
       timeout_ms, idempotency_key, payload, progress, run_after, created_at, updated_at)
     VALUES (?,?,?,?,'queued',?,0,?,?,?,?,0,?,?,?)`,
    ...bind([id, input.type, input.subjectType, input.subjectId, input.priority ?? 5, input.maxAttempts ?? 3,
      input.timeoutMs ?? 60_000, input.idempotencyKey, JSON.stringify(input.payload ?? {}),
      input.runAfter ?? at, at, at])
  );
  return { id, deduplicated: false };
}

/** Atomically claims the next runnable job for `workerId`, or returns nothing. */
export function claimJob(workerId: string, type?: string): JobRow | undefined {
  const at = now();
  return transact(() => {
    const candidate = one<{ id: string }>(
      `SELECT id FROM background_jobs
        WHERE status = 'queued' AND (run_after IS NULL OR run_after <= ?)${type ? " AND type = ?" : ""}
        ORDER BY priority, created_at LIMIT 1`,
      ...(type ? [at, type] : [at])
    );
    if (!candidate) return undefined;
    run(
      `UPDATE background_jobs
          SET status = 'running', attempts = attempts + 1, locked_by = ?, locked_at = ?, started_at = ?, updated_at = ?
        WHERE id = ? AND status = 'queued'`,
      workerId, at, at, at, candidate.id
    );
    return one<JobRow>("SELECT * FROM background_jobs WHERE id = ?", candidate.id);
  });
}

export function setJobProgress(id: string, progress: number, label?: string) {
  run("UPDATE background_jobs SET progress = ?, progress_label = ?, updated_at = ? WHERE id = ?",
    Math.max(0, Math.min(100, Math.round(progress))), label ?? null, now(), id);
}

export function completeJob(id: string, result: unknown) {
  run("UPDATE background_jobs SET status = 'succeeded', result = ?, progress = 100, finished_at = ?, updated_at = ?, locked_by = NULL WHERE id = ?",
    JSON.stringify(result ?? {}), now(), now(), id);
}

/** Retryable failures re-queue with exponential backoff; exhausted ones go 'dead'. */
export function failJob(id: string, error: string) {
  const job = one<{ attempts: number; max_attempts: number }>("SELECT attempts, max_attempts FROM background_jobs WHERE id = ?", id);
  const exhausted = !job || job.attempts >= job.max_attempts;
  if (exhausted) {
    run("UPDATE background_jobs SET status = 'dead', error = ?, finished_at = ?, updated_at = ?, locked_by = NULL WHERE id = ?",
      error, now(), now(), id);
    return;
  }
  const backoffMs = 2 ** (job.attempts - 1) * 5_000;
  run(
    `UPDATE background_jobs SET status = 'queued', error = ?, run_after = ?, locked_by = NULL, locked_at = NULL, updated_at = ?
      WHERE id = ?`,
    error, new Date(Date.now() + backoffMs).toISOString(), now(), id
  );
}

export function getJob(id: string) {
  return one<JobRow>("SELECT * FROM background_jobs WHERE id = ?", id);
}

export function listJobs(filter: { status?: string; type?: string; limit?: number; offset?: number } = {}) {
  const where: string[] = [];
  const params: Params = [];
  if (filter.status) {
    where.push("status = ?");
    params.push(filter.status);
  }
  if (filter.type) {
    where.push("type = ?");
    params.push(filter.type);
  }
  return all<JobRow>(
    `SELECT * FROM background_jobs${where.length ? ` WHERE ${where.join(" AND ")}` : ""}
      ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ...bind([...params, filter.limit ?? 50, filter.offset ?? 0])
  );
}

export function countJobsByStatus() {
  return all<{ status: string; c: number }>("SELECT status, COUNT(*) AS c FROM background_jobs GROUP BY status");
}

/** Leases abandoned by a crashed worker return to the queue. */
export function reclaimStaleJobs(timeoutMs = 120_000) {
  const cutoff = new Date(Date.now() - timeoutMs).toISOString();
  run(
    `UPDATE background_jobs SET status = 'queued', locked_by = NULL, run_after = ?, updated_at = ?
      WHERE status = 'running' AND locked_at < ?`,
    cutoff, now(), cutoff
  );
}

// ---- agent_investigations -------------------------------------------------
export interface InvestigationRow {
  id: string;
  vehicle_id: string;
  question: string;
  actor_id: string | null;
  thread_id: string | null;
  status: string;
  answer: string | null;
  citations_json: string;
  conflicts_json: string;
  missing_json: string;
  node_trace_json: string;
  tokens_json: string;
  graph_version: string;
  started_at: string;
  finished_at: string | null;
}

export function createInvestigation(input: {
  vehicleId: string;
  question: string;
  actorId?: string;
  threadId?: string;
  graphVersion: string;
}) {
  const id = newId("inv");
  run(
    `INSERT INTO agent_investigations (id, vehicle_id, question, actor_id, thread_id, status, citations_json,
       conflicts_json, missing_json, node_trace_json, tokens_json, graph_version, started_at)
     VALUES (?,?,?,?,?,'running','[]','[]','[]','[]','{}',?,?)`,
    ...bind([id, input.vehicleId, input.question, input.actorId, input.threadId, input.graphVersion, now()])
  );
  return id;
}

export function updateInvestigation(
  id: string,
  patch: Partial<Pick<InvestigationRow, "status" | "answer" | "citations_json" | "conflicts_json" | "missing_json" | "node_trace_json" | "tokens_json">>
) {
  const cols = Object.keys(patch) as (keyof typeof patch)[];
  if (!cols.length) return;
  run(
    `UPDATE agent_investigations SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`,
    ...bind([...cols.map((c) => patch[c]), id])
  );
}

export function getInvestigation(id: string) {
  return one<InvestigationRow>("SELECT * FROM agent_investigations WHERE id = ?", id);
}

export function listInvestigations(vehicleId: string, limit = 20) {
  return all<InvestigationRow>(
    "SELECT * FROM agent_investigations WHERE vehicle_id = ? ORDER BY started_at DESC LIMIT ?",
    vehicleId,
    limit
  );
}

// ---- human_review_queue ---------------------------------------------------
export interface ReviewRow {
  id: string;
  vehicle_id: string;
  analysis_id: string | null;
  document_id: string | null;
  inspection_id: string | null;
  kind: string;
  reason: string;
  payload: string;
  status: string;
  assigned_to: string | null;
  resolved_by: string | null;
  resolution: string | null;
  created_at: string;
  resolved_at: string | null;
}

export function enqueueReview(input: {
  vehicleId: string;
  kind: string;
  reason: string;
  analysisId?: string;
  documentId?: string;
  inspectionId?: string;
  payload?: unknown;
}) {
  const open = one<{ id: string }>(
    "SELECT id FROM human_review_queue WHERE status = 'open' AND vehicle_id = ? AND kind = ? AND COALESCE(analysis_id,'') = COALESCE(?,'')",
    ...bind([input.vehicleId, input.kind, input.analysisId])
  );
  if (open) return open.id;
  const id = newId("rev");
  const at = now();
  run(
    `INSERT INTO human_review_queue (id, vehicle_id, analysis_id, document_id, inspection_id, kind, reason,
       payload, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,'open',?,?)`,
    ...bind([id, input.vehicleId, input.analysisId, input.documentId, input.inspectionId, input.kind,
      input.reason, JSON.stringify(input.payload ?? {}), at, at])
  );
  return id;
}

export function listReviewQueue(status = "open", limit = 50) {
  return all<ReviewRow>(
    "SELECT * FROM human_review_queue WHERE status = ? ORDER BY created_at DESC LIMIT ?",
    status,
    limit
  );
}

export function resolveReview(id: string, status: "resolved" | "rejected", by: string, resolution: string) {
  run("UPDATE human_review_queue SET status = ?, resolved_by = ?, resolution = ?, resolved_at = ?, updated_at = ? WHERE id = ?",
    status, by, resolution, now(), now(), id);
}

// ---- audit log pagination -------------------------------------------------
export interface AuditFilter {
  action?: string;
  actor?: string;
}

function auditWhere(filter: AuditFilter) {
  const parts: string[] = [];
  const params: (string | number | null)[] = [];
  if (filter.action) {
    parts.push("action = ?");
    params.push(filter.action);
  }
  if (filter.actor) {
    parts.push("actor_id = ?");
    params.push(filter.actor);
  }
  return { clause: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}

/** Paged audit read — pagination happens in SQL, not in memory. */
export function getAuditPage(limit = 50, offset = 0, filter: AuditFilter = {}) {
  const { clause, params } = auditWhere(filter);
  return all<Record<string, unknown>>(
    `SELECT * FROM audit_logs ${clause} ORDER BY at DESC LIMIT ? OFFSET ?`,
    ...bind([...params, limit, offset])
  );
}

export function countAuditLogs(filter: AuditFilter = {}) {
  const { clause, params } = auditWhere(filter);
  return one<{ c: number }>(`SELECT COUNT(*) AS c FROM audit_logs${clause}`, ...params)?.c ?? 0;
}

/** Distinct action counts, for the admin audit facets menu. */
export function getAuditFacets(limit = 20) {
  return all<{ action: string; c: number }>(
    "SELECT action, COUNT(*) AS c FROM audit_logs GROUP BY action ORDER BY c DESC LIMIT ?",
    limit
  );
}

/** Actors that appear in the trail, resolved to names where the user still exists. */
export function getAuditActors() {
  return all<{ id: string; name: string }>(
    `SELECT a.actor_id AS id, COALESCE(u.name, a.actor_id) AS name
       FROM (SELECT DISTINCT actor_id FROM audit_logs WHERE actor_id IS NOT NULL) a
       LEFT JOIN users u ON u.id = a.actor_id
      ORDER BY name`
  );
}
