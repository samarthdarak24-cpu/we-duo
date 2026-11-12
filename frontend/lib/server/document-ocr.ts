// ---------------------------------------------------------------------------
// Document OCR bridge: Next.js upload -> Python extraction -> shared database.
//
// Before this bridge existed, an upload wrote a `pending` document row and the
// UI said "queued for verification" forever: no OCR job ran and no extracted
// field reached the buyer report. This module performs the real call and writes
// the result back to `documents` + `document_extractions` so the seller sees the
// engine, method, confidence, fields and flags that were actually produced.
//
// Honesty rules:
//  * a PDF text layer is reported with method/text-layer, never as OCR;
//  * if the service is unavailable the document stays pending with the real
//    reason and the UI shows that reason (no fake success);
//  * "verified" here means the automated extraction checks passed — it is not a
//    claim that the paper document is authentic.
// ---------------------------------------------------------------------------
import { randomUUID } from "node:crypto";
import {
  addBatteryRecord,
  createFinding,
  createHistoryEvent,
  createMileage,
  getBatteryRecords,
  getDocument,
  getFindings,
  getHistory,
  getMileage,
  getVehicle,
  run as dbRun,
  updateDocument,
  updateVehicle,
} from "./db";
import { RULESET_VERSION, recordDocumentExtractions } from "./evidence";
import { materializeUpload } from "./files";
import { callIntelligence } from "./intelligence";
import { hasBatteryPack } from "@/lib/vehicle-categories";
import { categoryIdForVehicle } from "./data";

interface PythonExtraction {
  document_id: string;
  sha256: string;
  engine: string;
  method: string;
  is_ocr: boolean;
  fields: Record<string, unknown>;
  confidence: number;
  low_confidence: boolean;
  flags: string[];
  duplicate_of: string | null;
  expiry: Record<string, unknown> | null;
  manual_review_id: string | null;
  comparison: {
    vehicle_id?: string;
    checks?: { field: string; result: string; expected?: string; extracted?: string }[];
  };
  workflow: { step: number; name: string; status: string; detail?: string }[];
  version: string;
  warning?: string;
}

export interface DocumentOcrOutcome {
  status: "processed" | "unavailable" | "not_applicable";
  engine?: string;
  method?: string;
  isOcr?: boolean;
  confidence?: number;
  flags?: string[];
  reviewId?: string | null;
  fieldsStored?: number;
  documentStatus?: string;
  reason?: string;
}

/** Persist an honest "could not run" state without pretending OCR succeeded. */
function markUnavailable(documentId: string, reason: string): DocumentOcrOutcome {
  updateDocument(documentId, {
    status: "pending",
    status_reason: `OCR unavailable — ${reason}`,
    verified_at: null,
  });
  return { status: "unavailable", documentStatus: "pending", reason };
}

/** Parse DD-MM-YYYY, DD/MM/YYYY, DD-MM-YY, or YYYY-MM-DD into an ISO date string. */
function parseDocDateIso(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    let yr = Number(m[3]);
    if (yr < 100) yr += yr >= 70 ? 1900 : 2000;
    const dt = new Date(Date.UTC(yr, Number(m[2]) - 1, Number(m[1])));
    if (Number.isNaN(dt.getTime()) || dt.getUTCMonth() !== Number(m[2]) - 1) return null;
    return dt.toISOString();
  }
  return null;
}

function ensureFinding(params: {
  vehicleId: string;
  ruleKey: string;
  code: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  explanation: string;
  recommendation: string;
  evidence: Record<string, unknown>;
  responsibleDoc: string | null;
  points: number;
}) {
  const existing = getFindings(params.vehicleId).some(
    (f) =>
      f.status !== "cleared" &&
      f.code === params.code &&
      f.rule_key === params.ruleKey &&
      f.responsible_doc === params.responsibleDoc
  );
  if (existing) return;
  createFinding({
    id: `f-${randomUUID().slice(0, 12)}`,
    vehicle_id: params.vehicleId,
    rule_key: params.ruleKey,
    code: params.code,
    severity: params.severity,
    title: params.title,
    explanation: params.explanation,
    recommendation: params.recommendation,
    evidence: JSON.stringify(params.evidence),
    responsible_doc: params.responsibleDoc,
    points: params.points,
    status: "open",
    created_at: new Date().toISOString(),
  });
}

function syncFindingsFromExtraction(
  doc: NonNullable<ReturnType<typeof getDocument>>,
  result: PythonExtraction
) {
  const vehicle = getVehicle(doc.vehicle_id);
  const fields = result.fields ?? {};
  const flags = Array.isArray(result.flags) ? result.flags : [];
  const checks = result.comparison?.checks ?? [];
  const refNo = String(fields.invoice_number ?? fields.policy_number ?? "").trim() || null;
  const docDate = String(fields.document_date ?? (Array.isArray(fields.dates) ? fields.dates[0] : "") ?? "").trim() || null;

  for (const check of checks) {
    if (check.result !== "mismatch") continue;
    if (check.field === "registration_number") {
      ensureFinding({
        vehicleId: doc.vehicle_id,
        ruleKey: "REGISTRATION_MISMATCH",
        code: "DOCUMENT_MISMATCH",
        severity: "high",
        title: "Registration number mismatch",
        explanation: `Document extracted registration ${check.extracted ?? "unknown"} differs from vehicle record ${check.expected ?? "unknown"}.`,
        recommendation: "Verify the document against the vehicle registration certificate or upload the correct record.",
        evidence: {
          documentId: doc.id,
          field: "registration_number",
          expected: check.expected ?? null,
          extracted: check.extracted ?? null,
          method: "deterministic-document-rules",
          rulesetVersion: RULESET_VERSION,
        },
        responsibleDoc: doc.id,
        points: 25,
      });
    } else if (check.field === "vin" || check.field === "chassis_number") {
      ensureFinding({
        vehicleId: doc.vehicle_id,
        ruleKey: "PRIMARY_IDENTIFIER_MISMATCH",
        code: "VIN_MISMATCH",
        severity: "high",
        title: "Chassis / VIN mismatch",
        explanation: `Document extracted identifier ${check.extracted ?? "unknown"} differs from vehicle record ${check.expected ?? "unknown"}.`,
        recommendation: "Confirm the stamped chassis/VIN plate matches the uploaded record.",
        evidence: {
          documentId: doc.id,
          field: check.field,
          expected: check.expected ?? null,
          extracted: check.extracted ?? null,
          method: "deterministic-document-rules",
          rulesetVersion: RULESET_VERSION,
        },
        responsibleDoc: doc.id,
        points: 25,
      });
    } else if (check.field === "model_year") {
      ensureFinding({
        vehicleId: doc.vehicle_id,
        ruleKey: "MODEL_YEAR_MISMATCH",
        code: "DOCUMENT_MISMATCH",
        severity: "medium",
        title: "Model year conflict",
        explanation: `Document states model year ${check.extracted ?? "unknown"}, while vehicle record year is ${check.expected ?? "unknown"}.`,
        recommendation: "Clarify the manufacturing / model year against registration records.",
        evidence: {
          documentId: doc.id,
          field: "model_year",
          expected: check.expected ?? null,
          extracted: check.extracted ?? null,
          method: "deterministic-document-rules",
          rulesetVersion: RULESET_VERSION,
        },
        responsibleDoc: doc.id,
        points: 15,
      });
    }
  }

  for (const flag of flags) {
    if (flag === "future_document_date") {
      ensureFinding({
        vehicleId: doc.vehicle_id,
        ruleKey: "FUTURE_DOCUMENT_DATE",
        code: "DATE_INCONSISTENCY",
        severity: "high",
        title: "Document date is in the future",
        explanation: `Extracted document date (${docDate ?? "unknown"}) is in the future relative to today's date.`,
        recommendation: "Verify the invoice or certificate issue date on the physical document.",
        evidence: {
          documentId: doc.id,
          documentDate: docDate,
          method: "deterministic-date-validity",
          rulesetVersion: RULESET_VERSION,
        },
        responsibleDoc: doc.id,
        points: 20,
      });
    } else if (flag === "date_before_manufacture_year") {
      ensureFinding({
        vehicleId: doc.vehicle_id,
        ruleKey: "DATE_BEFORE_MANUFACTURE",
        code: "DATE_INCONSISTENCY",
        severity: "high",
        title: "Document date precedes vehicle manufacture year",
        explanation: `Extracted document date (${docDate ?? "unknown"}) precedes vehicle manufacture/registration year ${vehicle?.year ?? "unknown"}.`,
        recommendation: "Confirm whether the document belongs to this vehicle or contains a typo.",
        evidence: {
          documentId: doc.id,
          documentDate: docDate,
          vehicleYear: vehicle?.year ?? null,
          method: "deterministic-date-sequence",
          rulesetVersion: RULESET_VERSION,
        },
        responsibleDoc: doc.id,
        points: 20,
      });
    } else if (flag.startsWith("duplicate_of:")) {
      const otherId = flag.split(":", 2)[1] ?? "";
      ensureFinding({
        vehicleId: doc.vehicle_id,
        ruleKey: "DUPLICATE_SHA256",
        code: "DUPLICATE_DOCUMENT",
        severity: "high",
        title: "Duplicate document file (identical SHA-256)",
        explanation: `Uploaded file shares an identical SHA-256 hash (${doc.sha256.slice(0, 12)}…) with existing document ${otherId}.`,
        recommendation: "Remove duplicate uploads or supply the distinct original document.",
        evidence: {
          documentId: doc.id,
          duplicateOf: otherId,
          sha256: doc.sha256,
          method: "sha256-equality",
          rulesetVersion: RULESET_VERSION,
        },
        responsibleDoc: doc.id,
        points: 25,
      });
    } else if (flag.startsWith("duplicate_reference_same_vehicle:")) {
      const otherId = flag.split(":", 2)[1] ?? "";
      ensureFinding({
        vehicleId: doc.vehicle_id,
        ruleKey: "DUPLICATE_REFERENCE_SAME_VEHICLE",
        code: "DUPLICATE_DOCUMENT_REFERENCE",
        severity: "medium",
        title: "Duplicate document reference on this vehicle",
        explanation: `Reference number ${refNo ?? "unknown"} matches existing document ${otherId} on this vehicle despite different file bytes.`,
        recommendation: "Confirm whether this is a re-scan/re-upload of the same invoice.",
        evidence: {
          documentId: doc.id,
          otherDocumentId: otherId,
          referenceNo: refNo,
          method: "reference-uniqueness",
          rulesetVersion: RULESET_VERSION,
        },
        responsibleDoc: doc.id,
        points: 15,
      });
    } else if (flag.startsWith("cross_vehicle_reference_reuse:")) {
      const [, otherVehicleId = "", otherDocId = ""] = flag.split(":");
      ensureFinding({
        vehicleId: doc.vehicle_id,
        ruleKey: "CROSS_VEHICLE_REFERENCE_REUSE",
        code: "CROSS_VEHICLE_REFERENCE",
        severity: "high",
        title: "Document reference number already used on another vehicle",
        explanation: `Reference number ${refNo ?? "unknown"} is already attached to vehicle ${otherVehicleId} (document ${otherDocId}).`,
        recommendation: "Verify the original invoice and ensure documents are not shared across vehicles.",
        evidence: {
          documentId: doc.id,
          otherVehicleId,
          otherDocumentId: otherDocId,
          referenceNo: refNo,
          method: "cross-vehicle-reference-check",
          rulesetVersion: RULESET_VERSION,
        },
        responsibleDoc: doc.id,
        points: 25,
      });
    } else if (flag === "document_date_expired") {
      ensureFinding({
        vehicleId: doc.vehicle_id,
        ruleKey: "DOCUMENT_EXPIRED",
        code: doc.type.startsWith("insurance") ? "INSURANCE_EXPIRED" : "DATE_INCONSISTENCY",
        severity: "medium",
        title: doc.type.startsWith("insurance") ? "Insurance policy appears expired" : "Document validity date appears expired",
        explanation: `Latest date found on document (${docDate ?? "unknown"}) is in the past.`,
        recommendation: "Upload a current policy or certificate.",
        evidence: {
          documentId: doc.id,
          documentDate: docDate,
          method: "deterministic-expiry-check",
          rulesetVersion: RULESET_VERSION,
        },
        responsibleDoc: doc.id,
        points: 12,
      });
    }
  }
}

function syncTimelineAndBatteryFromExtraction(
  doc: NonNullable<ReturnType<typeof getDocument>>,
  result: PythonExtraction,
  status: string
) {
  const fields = result.fields ?? {};
  const flags = Array.isArray(result.flags) ? result.flags : [];
  const docDateRaw = fields.document_date ?? (Array.isArray(fields.dates) ? fields.dates[0] : null);
  const dateIso = parseDocDateIso(docDateRaw);
  const kmRaw = fields.odometer_km;
  const km = typeof kmRaw === "number" && Number.isFinite(kmRaw) && kmRaw >= 0 ? Math.round(kmRaw) : null;

  const blockedFromTimeline = flags.some(
    (f) =>
      f === "registration_number_mismatch" ||
      f === "vin_mismatch" ||
      f === "chassis_number_mismatch" ||
      f === "future_document_date" ||
      f === "date_before_manufacture_year" ||
      f === "low_image_quality" ||
      f.startsWith("duplicate_of:") ||
      f.startsWith("duplicate_reference_same_vehicle:") ||
      f.startsWith("cross_vehicle_reference_reuse:")
  );

  if (km !== null && dateIso && !blockedFromTimeline) {
    const existingMileage = getMileage(doc.vehicle_id);
    if (!existingMileage.some((m) => m.document_id === doc.id)) {
      const sourceLabel = result.is_ocr ? "ocr_document" : "pdf_text_layer";
      createMileage({
        id: `m-${randomUUID().slice(0, 12)}`,
        vehicle_id: doc.vehicle_id,
        year: dateIso.slice(0, 4),
        km,
        source: sourceLabel,
        date: dateIso,
        flagged: 0,
        verified: status === "verified" ? 1 : 0,
        is_seller_claim: 0,
        document_id: doc.id,
      });

      const historyExists = getHistory(doc.vehicle_id).some((h) => h.evidence_document_id === doc.id);
      if (!historyExists) {
        const ownerId = getVehicle(doc.vehicle_id)?.owner_id ?? "";
        createHistoryEvent({
          id: `h-${randomUUID().slice(0, 12)}`,
          vehicle_id: doc.vehicle_id,
          category: doc.type.includes("battery") ? "inspection" : "service",
          event_date: dateIso,
          mileage_km: km,
          title: `${doc.file_name} (${km.toLocaleString("en-IN")} km)`,
          description: `Extracted from uploaded document via ${result.engine} (${result.method}).`,
          source: sourceLabel,
          evidence_document_id: doc.id,
          status: status === "verified" ? "verified" : "pending",
          supersedes_id: null,
          created_by: ownerId,
          created_at: new Date().toISOString(),
        });
      }

      const ordered = getMileage(doc.vehicle_id).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      for (let i = 1; i < ordered.length; i++) {
        const prev = ordered[i - 1];
        const curr = ordered[i];
        if (curr.km < prev.km) {
          dbRun("UPDATE mileage_readings SET flagged = 1, verified = 0 WHERE id IN (?, ?)", prev.id, curr.id);
          ensureFinding({
            vehicleId: doc.vehicle_id,
            ruleKey: `MILEAGE_CHRONOLOGY_${prev.id}_${curr.id}`,
            code: "ODOMETER_ROLLBACK",
            severity: "high",
            title: "Mileage chronology inconsistency (needs review)",
            explanation:
              `Distance decreased from ${prev.km.toLocaleString("en-IN")} km (${prev.date.slice(0, 10)}) ` +
              `to ${curr.km.toLocaleString("en-IN")} km (${curr.date.slice(0, 10)}). ` +
              "Status: NEEDS_REVIEW / SUSPICIOUS — this is a chronology conflict requiring inspection, not confirmed odometer fraud.",
            recommendation: "Review both source documents and request clarification or cluster-replacement evidence from the seller.",
            evidence: {
              fromReadingId: prev.id,
              toReadingId: curr.id,
              fromDocumentId: prev.document_id,
              toDocumentId: curr.document_id,
              fromKm: prev.km,
              toKm: curr.km,
              fromDate: prev.date.slice(0, 10),
              toDate: curr.date.slice(0, 10),
              reviewState: "NEEDS_REVIEW",
              method: "monotonicity-check",
              rulesetVersion: RULESET_VERSION,
            },
            responsibleDoc: curr.document_id ?? doc.id,
            points: 35,
          });
        }
      }
      const latestReading = ordered[ordered.length - 1];
      if (latestReading) {
        updateVehicle(doc.vehicle_id, { last_verified_km: latestReading.km });
      }
    }
  }

  const catId = categoryIdForVehicle(doc.vehicle_id);
  const soh = typeof fields.battery_soh === "number" ? fields.battery_soh : null;
  const cap = typeof fields.battery_capacity_kwh === "number" ? fields.battery_capacity_kwh : null;
  const batSerial = typeof fields.battery_serial === "string" ? fields.battery_serial : null;
  if (hasBatteryPack(catId) && (soh !== null || cap !== null || batSerial) && !blockedFromTimeline) {
    const existingBat = getBatteryRecords(doc.vehicle_id).some((b) => b.source_document_id === doc.id);
    if (!existingBat) {
      addBatteryRecord({
        id: `bat-${randomUUID().slice(0, 12)}`,
        vehicle_id: doc.vehicle_id,
        kind: "health_report",
        soh_percent: soh,
        capacity_kwh: cap,
        serial: batSerial,
        measured_at: dateIso ?? new Date().toISOString(),
        source_document_id: doc.id,
        status: status === "verified" ? "verified" : "pending",
        notes: `Extracted via ${result.engine} (${result.method}).`,
      });
    }
  }
}

export async function runDocumentOcr(documentId: string): Promise<DocumentOcrOutcome> {
  const doc = getDocument(documentId);
  if (!doc) return { status: "not_applicable", reason: "Document not found." };
  if (!doc.file_key) {
    // Metadata-only records (legacy seeds) have no file to process. Do not claim
    // an OCR run against bytes that do not exist.
    return { status: "not_applicable", reason: "No stored file is linked to this document." };
  }
  // Local storage returns the existing path; S3 downloads to a transient temp
  // file that is removed in `finally` after the Python service has read it.
  const materialized = await materializeUpload(doc.file_key).catch(() => null);
  if (!materialized) {
    return markUnavailable(documentId, "the stored file could not be found in storage.");
  }

  try {
    const response = await callIntelligence<PythonExtraction>(
      "/api/intelligence/documents/process",
      {
        document_id: doc.id,
        vehicle_id: doc.vehicle_id,
        path: materialized.path,
        doc_type: doc.type,
        async: false,
      },
      { timeout: 150_000 }
    );

    if (!response.ok || !response.data) {
      return markUnavailable(documentId, response.error ?? "the extraction service returned no result.");
    }

    const result = response.data;
    const lowConfidence = result.low_confidence || result.confidence < 0.55;
    const flags = Array.isArray(result.flags) ? result.flags : [];
    const hasMismatch = (result.comparison?.checks ?? []).some((check) => check.result === "mismatch");
    const unreadable = flags.includes("unreadable_no_text");
    const needsCorrection = lowConfidence || hasMismatch || flags.length > 0;
    const status = needsCorrection ? "needs_correction" : "verified";
    const statusReason = unreadable
      ? "Unreadable or blank image — no text or fields extracted. Queued for manual review."
      : needsCorrection
        ? flags.join(", ") || (hasMismatch ? "Extracted values conflict with the vehicle record." : "Low extraction confidence.")
        : null;

    // Store the real fields plus the traceability metadata the UI and PDF report
    // need. `fields` is nested so `recordDocumentExtractions` can write one row per
    // field without treating the engine metadata as an extracted value.
    const extracted = {
      fields: result.fields ?? {},
      confidence: result.confidence,
      method: result.method,
      engine: result.engine,
      is_ocr: result.is_ocr,
      flags,
      comparison: result.comparison ?? {},
      workflow: result.workflow ?? [],
      expiry: result.expiry,
      duplicate_of: result.duplicate_of,
      review_id: result.manual_review_id,
      version: result.version,
      source: "python-intelligence",
      warning: result.warning ?? "Machine-read text is not proof of document authenticity.",
    };

    updateDocument(documentId, {
      extracted: JSON.stringify(extracted),
      status,
      status_reason: statusReason,
      verified_at: status === "verified" ? new Date().toISOString() : null,
    });
    const fieldsStored = recordDocumentExtractions(documentId);
    syncFindingsFromExtraction(doc, result);
    syncTimelineAndBatteryFromExtraction(doc, result, status);

    return {
      status: "processed",
      engine: result.engine,
      method: result.method,
      isOcr: result.is_ocr,
      confidence: result.confidence,
      flags,
      reviewId: result.manual_review_id,
      fieldsStored,
      documentStatus: status,
    };
  } finally {
    materialized.cleanup();
  }
}

/**
 * Run OCR for a document when the caller already knows the vehicle belongs to
 * the seller. Ownership is enforced by the route before this is called.
 */
export async function runDocumentOcrForVehicle(
  documentId: string,
  vehicleId: string
): Promise<DocumentOcrOutcome> {
  const doc = getDocument(documentId);
  if (!doc || doc.vehicle_id !== vehicleId) {
    return { status: "not_applicable", reason: "Document does not belong to this vehicle." };
  }
  return runDocumentOcr(documentId);
}
