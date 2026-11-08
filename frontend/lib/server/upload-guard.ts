// ---------------------------------------------------------------------------
// Shared upload security gate.
//
// Every binary upload (documents, photos, avatars, KYC, replacements) passes
// through this helper before bytes are persisted:
//
//   1. The bytes are scanned (clamd → HTTP scanner → local signature rules).
//   2. An infected file is NEVER stored in the servable upload root. It is
//      written to the quarantine directory for security review, an audit row
//      records the verdict, and the uploader receives an in-app notification.
//   3. If a configured scanner cannot be reached the upload fails closed with
//      503 — the file is not stored and nothing is marked clean.
//   4. A clean file is stored and its scan verdict is persisted in `file_scans`
//      so the evidence survives a refresh and can be shown in the UI.
//
// A scan verdict is evidence about malware presence, never proof that a
// document is authentic.
// ---------------------------------------------------------------------------
import { randomUUID } from "node:crypto";

import { createAudit, createNotification, getUserById, recordFileScan } from "./db";
import { quarantineBuffer, saveUpload, type StoredFile } from "./files";
import { scanBuffer, type ScanResult } from "./scan";

export interface GuardedUploadInput {
  bytes: Buffer;
  fileName: string;
  mime: string;
  folder: string;
  maxBytes: number;
  actorId: string;
  actorRole?: string;
  vehicleId?: string;
  req?: Request;
}

export type GuardedUploadResult =
  | { ok: true; stored: StoredFile; scan: ScanResult }
  | { ok: false; status: 422 | 503; code: string; message: string; scan: ScanResult };

function audit(
  input: GuardedUploadInput,
  action: string,
  detail: Record<string, unknown>
) {
  // A deleted/missing actor must not make a security audit row fail; the actor
  // column is nullable precisely so the evidence can still be recorded.
  const actorId = getUserById(input.actorId) ? input.actorId : null;
  createAudit({
    id: randomUUID(),
    actor_id: actorId,
    action,
    entity_type: input.vehicleId ? "vehicle" : "user",
    entity_id: input.vehicleId ?? input.actorId,
    before: "",
    after: JSON.stringify(detail),
    ip: "",
    user_agent: input.req?.headers.get("user-agent") ?? "",
    at: new Date().toISOString(),
  });
}

function notifyUploader(input: GuardedUploadInput, scan: ScanResult) {
  // Notifications have a foreign key to users; an anonymous/deleted actor has
  // no inbox to write to.
  if (!getUserById(input.actorId)) return;
  createNotification({
    id: `ntf-${randomUUID()}`,
    user_id: input.actorId,
    type: "security",
    title: "Upload blocked by malware scan",
    body:
      `"${input.fileName}" was rejected by the ${scan.engine} scanner: ${scan.detail} ` +
      "The file was not published. Contact support if you believe this is a mistake.",
    data: JSON.stringify({
      fileName: input.fileName,
      engine: scan.engine,
      status: scan.status,
      sha256: scan.sha256 ?? null,
      vehicleId: input.vehicleId ?? null,
    }),
    read: 0,
    created_at: new Date().toISOString(),
  });
}

export async function guardedSaveUpload(input: GuardedUploadInput): Promise<GuardedUploadResult> {
  const scan = await scanBuffer(input.bytes, {
    fileName: input.fileName,
    mime: input.mime,
  });

  if (scan.status === "infected") {
    // Quarantine outside the servable root. The upload root never receives the
    // bytes, so /api/v1/files cannot serve them even with a valid signature.
    const quarantinePath = quarantineBuffer(input.fileName, input.bytes);
    recordFileScan({
      subject_key: null,
      document_id: null,
      vehicle_id: input.vehicleId ?? null,
      file_name: input.fileName,
      sha256: scan.sha256 ?? null,
      engine: scan.engine,
      scanner: scan.scanner ?? "unknown",
      status: scan.status,
      detail: scan.detail,
      signature_version: scan.signatureVersion ?? null,
      duration_ms: scan.durationMs ?? null,
    });
    audit(input, "upload.malware_blocked", {
      fileName: input.fileName,
      engine: scan.engine,
      detail: scan.detail,
      sha256: scan.sha256 ?? null,
      quarantined: Boolean(quarantinePath),
    });
    notifyUploader(input, scan);
    return {
      ok: false,
      status: 422,
      code: "MALWARE_DETECTED",
      message: scan.detail,
      scan,
    };
  }

  if (scan.status === "error") {
    // A configured scanner that is unavailable means the file was NOT scanned.
    // Fail closed: do not store it, do not mark it clean.
    recordFileScan({
      subject_key: null,
      document_id: null,
      vehicle_id: input.vehicleId ?? null,
      file_name: input.fileName,
      sha256: scan.sha256 ?? null,
      engine: scan.engine,
      scanner: scan.scanner ?? "unknown",
      status: scan.status,
      detail: scan.detail,
      signature_version: scan.signatureVersion ?? null,
      duration_ms: scan.durationMs ?? null,
    });
    return {
      ok: false,
      status: 503,
      code: "SCAN_UNAVAILABLE",
      message: `${scan.detail} The upload was not stored.`,
      scan,
    };
  }

  // Clean (or local rules equivalent). Persist the file and the scan evidence
  // together; if storage fails the scan row is still written below only after
  // the stored key is known.
  const stored = await saveUpload(input.folder, input.bytes, input.maxBytes);
  recordFileScan({
    subject_key: stored.key,
    document_id: null,
    vehicle_id: input.vehicleId ?? null,
    file_name: input.fileName,
    sha256: stored.sha256,
    engine: scan.engine,
    scanner: scan.scanner ?? "unknown",
    status: scan.status === "not_configured" ? "clean" : scan.status,
    detail: scan.detail,
    signature_version: scan.signatureVersion ?? null,
    duration_ms: scan.durationMs ?? null,
  });
  return { ok: true, stored, scan };
}
