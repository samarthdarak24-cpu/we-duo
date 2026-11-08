import { addDocumentForVehicle, getDocumentsView } from "@/lib/server/data";
import { attachFileScanDocument, getListingByVehicle, getVehicle } from "@/lib/server/db";
import { fail, created, ok, requireRole } from "@/lib/server/http";
import { paginate } from "@/lib/server/pagination";
import { MAX_DOC_BYTES, sniffUpload } from "@/lib/server/files";
import { nearDuplicateDocuments, recordDocumentExtractions } from "@/lib/server/evidence";
import type { ScanResult } from "@/lib/server/scan";
import { guardedSaveUpload } from "@/lib/server/upload-guard";
import { withIdempotency } from "@/lib/server/idempotency";
import { LIMITS, enforceRateLimit } from "@/lib/server/ratelimit";
import { signedDownloadPath } from "@/lib/server/signed";
import { runDocumentOcr } from "@/lib/server/document-ocr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/vehicles/:id/documents?type=&status=&page=&pageSize= → `{ items, page }`. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller", "admin");
  if (!guard.ok) return guard.response;
  const vehicle = getVehicle(params.id);
  if (!vehicle) return fail(404, "NOT_FOUND", "Vehicle not found");
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const status = url.searchParams.get("status");
  const isOwner = vehicle.owner_id === guard.user.sub;
  const isAdmin = guard.user.role === "admin";
  let rows = getDocumentsView(params.id);
  // Private evidence is consent-gated: only the owning seller/admin sees every
  // document. Buyers see consented documents of a published listing; other
  // sellers see nothing. This mirrors GET /documents/:id and the vehicle report.
  if (!isOwner && !isAdmin) {
    const listing = getListingByVehicle(params.id);
    const buyerView = guard.user.role === "buyer" && listing?.status === "published";
    if (!buyerView) return fail(403, "FORBIDDEN", "These documents are private.");
    rows = rows.filter((d) => d.consent);
  }
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
    // Scan + store as one gate. Infected files are quarantined and never enter
    // the upload root; an unavailable configured scanner fails closed (503).
    const guarded = await guardedSaveUpload({
      bytes,
      fileName: file.name,
      mime: sniffed.mime,
      folder: `documents/${params.id}`,
      maxBytes: MAX_DOC_BYTES,
      actorId: guard.user.sub,
      actorRole: guard.user.role,
      vehicleId: params.id,
      req,
    });
    if (!guarded.ok) {
      return fail(guarded.status, guarded.code, guarded.message, {
        scan: guarded.scan,
      });
    }
    scan = guarded.scan;
    fileKey = guarded.stored.key;
    mime = guarded.stored.mime;
    sizeBytes = guarded.stored.size;
    sha256 = guarded.stored.sha256;
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
  // Link the persisted scan verdict to the document row so the UI/report can
  // show the engine that actually scanned the bytes.
  if (documentId && fileKey) attachFileScanDocument(fileKey, documentId, params.id);
  // Real OCR bridge: when a file was stored, run the intelligence extraction
  // synchronously and persist its fields/status before returning. If the service
  // is down the document stays pending with the honest reason in status_reason.
  const ocr = documentId && fileKey ? await runDocumentOcr(documentId) : null;
  const extractions = documentId ? recordDocumentExtractions(documentId) : 0;
  return created({
    ...result,
    fileKey,
    fileUrl: fileKey ? signedDownloadPath(`/api/v1/files/${fileKey}`, "file", fileKey) : null,
    scan,
    ocr,
    extractions,
  });
  });
}
