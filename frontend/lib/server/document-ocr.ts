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
import fs from "node:fs";

import { getDocument, updateDocument } from "./db";
import { recordDocumentExtractions } from "./evidence";
import { absoluteUploadPath } from "./files";
import { callIntelligence } from "./intelligence";

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

export async function runDocumentOcr(documentId: string): Promise<DocumentOcrOutcome> {
  const doc = getDocument(documentId);
  if (!doc) return { status: "not_applicable", reason: "Document not found." };
  if (!doc.file_key) {
    // Metadata-only records (legacy seeds) have no file to process. Do not claim
    // an OCR run against bytes that do not exist.
    return { status: "not_applicable", reason: "No stored file is linked to this document." };
  }
  const absolute = absoluteUploadPath(doc.file_key);
  if (!absolute || !fs.existsSync(absolute)) {
    return markUnavailable(documentId, "the stored file could not be found on disk.");
  }

  const response = await callIntelligence<PythonExtraction>(
    "/api/intelligence/documents/process",
    {
      document_id: doc.id,
      vehicle_id: doc.vehicle_id,
      path: absolute,
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
  const needsCorrection = lowConfidence || hasMismatch || flags.length > 0;
  const status = needsCorrection ? "needs_correction" : "verified";
  const statusReason = needsCorrection
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
