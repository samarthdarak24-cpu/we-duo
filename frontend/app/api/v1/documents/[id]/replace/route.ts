import { replaceDocumentForActor } from "@/lib/server/data";
import { fail, ok, requireRole } from "@/lib/server/http";
import { MAX_DOC_BYTES, saveUpload } from "@/lib/server/files";
import { getDocument } from "@/lib/server/db";

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
    if (file.size > MAX_DOC_BYTES) return fail(413, "FILE_TOO_LARGE", "Documents must be under 10 MB.");
    const existing = getDocument(params.id);
    if (!existing) return fail(404, "NOT_FOUND", "Document not found.");
    const bytes = Buffer.from(await file.arrayBuffer());
    try {
      const stored = saveUpload(`documents/${existing.vehicle_id}`, bytes, MAX_DOC_BYTES);
      input.fileKey = stored.key;
      input.sha256 = stored.sha256;
      input.sizeBytes = stored.size;
      input.mime = stored.mime;
      input.fileName = file.name;
      input.content = `${file.name}:${file.size}`;
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
  return ok(result);
}
