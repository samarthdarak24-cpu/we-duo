import { addDocumentForVehicle, getDocumentsView } from "@/lib/server/data";
import { getVehicle } from "@/lib/server/db";
import { fail, created, ok, requireRole } from "@/lib/server/http";
import { paginate } from "@/lib/server/pagination";
import { MAX_DOC_BYTES, saveUpload, sniffUpload } from "@/lib/server/files";
import { nearDuplicateDocuments, recordDocumentExtractions } from "@/lib/server/evidence";
import { scanBuffer, type ScanResult } from "@/lib/server/scan";
import { withIdempotency } from "@/lib/server/idempotency";
import { LIMITS, enforceRateLimit } from "@/lib/server/ratelimit";
import { signedDownloadPath } from "@/lib/server/signed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/vehicles/:id/documents?type=&status=&page=&pageSize= → `{ items, page }`. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller", "admin");
  if (!guard.ok) return guard.response;
  if (!getVehicle(params.id)) return fail(404, "NOT_FOUND", "Vehicle not found");
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const status = url.searchParams.get("status");
  let rows = getDocumentsView(params.id);
  if (type && type !== "all") rows = rows.filter((d) => d.type === type);
  if (status && status !== "all") rows = rows.filter((d) => d.status === status);
  return ok({ ...paginate(rows, url, { pageSize: 50 }), nearDuplicates: nearDuplicateDocuments(params.id) });
}

/** POST /api/v1/vehicles/:id/documents — multipart binary upload or JSON metadata. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const limited = enforceRateLimit(req, "document-upload", LIMITS.write);
  if (limited) return limited;
  return withIdempotency(req, `document-upload:${params.id}`, async () => {
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  let scan: ScanResult = { status: "not_configured", engine: "none", detail: "No file bytes were submitted." };
  const contentType = req.headers.get("content-type") ?? "";
  let type = "";
  let fileName = "";
  let mime = "application/pdf";
  let sizeBytes = 0;
  let consent = true;
  let content: string | undefined;
  let extracted: Record<string, unknown> | undefined;
  let sha256: string | undefined;
  let fileKey: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return fail(400, "VALIDATION_FAILED", "Invalid multipart body.");
    type = String(form.get("type") ?? "");
    const file = form.get("file");
    if (!(file instanceof File)) return fail(400, "VALIDATION_FAILED", "Attach a file.");
    if (file.size > MAX_DOC_BYTES) return fail(413, "FILE_TOO_LARGE", "Documents must be under 10 MB.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffUpload(bytes);
    if (!sniffed) return fail(415, "UNSUPPORTED_FILE_TYPE", "The file content is not a valid PDF, PNG, JPEG or WebP.");
    scan = await scanBuffer(bytes, { fileName: file.name, mime: sniffed.mime });
    if (scan.status === "infected") return fail(422, "MALWARE_DETECTED", scan.detail);
    try {
      const stored = saveUpload(`documents/${params.id}`, bytes, MAX_DOC_BYTES);
      fileKey = stored.key;
      mime = stored.mime;
      sizeBytes = stored.size;
      sha256 = stored.sha256;
    } catch (err) {
      const code = (err as Error).message;
      if (code === "FILE_TOO_LARGE") return fail(413, "FILE_TOO_LARGE", "Documents must be under 10 MB.");
      return fail(415, "UNSUPPORTED_FILE_TYPE", "The file content is not a valid PDF, PNG, JPEG or WebP.");
    }
    fileName = file.name;
    consent = form.get("consent") !== "false";
    content = `${file.name}:${file.size}`;
  } else {
    const body = (await req.json().catch(() => null)) as {
      type?: string;
      fileName?: string;
      mime?: string;
      sizeBytes?: number;
      consent?: boolean;
      extracted?: Record<string, unknown>;
      content?: string;
    } | null;
    if (!body?.type) return fail(400, "VALIDATION_FAILED", "type is required");
    type = body.type;
    fileName = body.fileName ?? `${type}.pdf`;
    mime = body.mime ?? "application/pdf";
    sizeBytes = body.sizeBytes ?? 0;
    consent = body.consent !== false;
    extracted = body.extracted;
    content = body.content;
  }

  const result = addDocumentForVehicle(guard.user.sub, params.id, {
    type, fileName, mime, sizeBytes, consent, extracted, content, sha256, fileKey,
  });
  if (!result.ok) return fail(result.code === "NOT_FOUND" ? 404 : result.code === "FORBIDDEN" ? 403 : 400, result.code, result.message);
  const documentId = (result as { id?: string }).id;
  const extractions = documentId ? recordDocumentExtractions(documentId) : 0;
  return created({
    ...result,
    fileKey,
    fileUrl: fileKey ? signedDownloadPath(`/api/v1/files/${fileKey}`, "file", fileKey) : null,
    scan,
    extractions,
  });
  });
}
