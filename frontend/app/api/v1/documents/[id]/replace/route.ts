import { replaceDocumentForActor } from "@/lib/server/data";
import { fail, ok, requireRole } from "@/lib/server/http";
import {
  MAX_DOC_BYTES,
  isAllowedDocumentFileName,
  sanitizeFileName,
  sniffUpload,
} from "@/lib/server/files";
import { attachFileScanDocument, getDocument } from "@/lib/server/db";
import { guardedSaveUpload } from "@/lib/server/upload-guard";
import { runDocumentOcr } from "@/lib/server/document-ocr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/documents/:id/replace — verified docs are versioned, never overwritten. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  const contentType = req.headers.get("content-type") ?? "";
  const input: { fileName?: string; content?: string; type?: string; sha256?: string; fileKey?: string | null; sizeBytes?: number; mime?: string } = {};

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return fail(400, "VALIDATION_FAILED", "Invalid multipart body.");
    const file = form.get("file");
    if (!(file instanceof File)) return fail(400, "VALIDATION_FAILED", "Attach a replacement file.");
    const safeName = sanitizeFileName(file.name, "document");
    if (file.size === 0) return fail(400, "EMPTY_FILE", "The uploaded file is empty.");
    if (!isAllowedDocumentFileName(file.name)) {
      return fail(415, "UNSUPPORTED_FILE_TYPE", "File extension is not allowed. Upload a PDF, PNG, JPEG or WebP document.");
    }
    if (file.size > MAX_DOC_BYTES) return fail(413, "FILE_TOO_LARGE", "Documents must be under 10 MB.");
    const existing = getDocument(params.id);
    if (!existing) return fail(404, "NOT_FOUND", "Document not found.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffUpload(bytes);
    if (!sniffed) return fail(415, "UNSUPPORTED_FILE_TYPE", "The file content is not a valid PDF, PNG, JPEG or WebP.");
    try {
      // Same scan gate as the original upload: infected files are quarantined,
      // an unavailable scanner fails closed, and a clean verdict is persisted.
      const guarded = await guardedSaveUpload({
        bytes,
        fileName: safeName,
        mime: sniffed.mime,
        folder: `documents/${existing.vehicle_id}`,
        maxBytes: MAX_DOC_BYTES,
        actorId: guard.user.sub,
        actorRole: guard.user.role,
        vehicleId: existing.vehicle_id,
        req,
      });
      if (!guarded.ok) {
        return fail(guarded.status, guarded.code, guarded.message, { scan: guarded.scan });
      }
      input.fileKey = guarded.stored.key;
      input.sha256 = guarded.stored.sha256;
      input.sizeBytes = guarded.stored.size;
      input.mime = guarded.stored.mime;
      input.fileName = safeName;
      input.content = `${safeName}:${file.size}`;
    } catch (err) {
      const code = (err as Error).message;
      if (code === "FILE_TOO_LARGE") return fail(413, "FILE_TOO_LARGE", "Documents must be under 10 MB.");
      return fail(415, "UNSUPPORTED_FILE_TYPE", "The file content is not a valid PDF, PNG, JPEG or WebP.");
    }
  } else {
    const body = (await req.json().catch(() => ({}))) as { fileName?: string; content?: string; type?: string };
    Object.assign(input, body);
  }

  const result = replaceDocumentForActor(guard.user.sub, params.id, input);
  if (!result.ok) return fail(result.code === "NOT_FOUND" ? 404 : 403, result.code, result.message);
  if (result.id && input.fileKey) attachFileScanDocument(input.fileKey, result.id, getDocument(result.id)?.vehicle_id ?? "");
  // A replacement is a new document row; run the same real extraction on it.
  const ocr = result.id && input.fileKey ? await runDocumentOcr(result.id) : null;
  return ok({ ...result, ocr });
}
