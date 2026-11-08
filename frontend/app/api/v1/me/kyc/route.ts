import { getUserById, updateUser } from "@/lib/server/db";
import { created, fail, ok, requireRole } from "@/lib/server/http";
import { MAX_DOC_BYTES, sniffUpload } from "@/lib/server/files";
import { guardedSaveUpload } from "@/lib/server/upload-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/me/kyc — current KYC state. */
export async function GET(req: Request) {
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  const u = getUserById(guard.user.sub);
  if (!u) return fail(404, "NOT_FOUND", "User not found.");
  return ok({ status: u.kyc_status, documentUploaded: !!u.kyc_doc_key });
}

/** POST /api/v1/me/kyc — multipart KYC document (PDF/image) for seller review. */
export async function POST(req: Request) {
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  const form = await req.formData().catch(() => null);
  const file = form?.get("document");
  if (!(file instanceof File)) return fail(400, "VALIDATION_FAILED", "Attach a KYC document.");
  if (file.size > MAX_DOC_BYTES) return fail(413, "FILE_TOO_LARGE", "KYC documents must be under 10 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffUpload(bytes);
  if (!sniffed) return fail(415, "UNSUPPORTED_FILE_TYPE", "Upload a valid PDF, PNG, JPEG or WebP file.");
  try {
    // KYC files are private; they pass the same malware gate as documents.
    const guarded = await guardedSaveUpload({
      bytes,
      fileName: file.name,
      mime: sniffed.mime,
      folder: `kyc/${guard.user.sub}`,
      maxBytes: MAX_DOC_BYTES,
      actorId: guard.user.sub,
      actorRole: guard.user.role,
      req,
    });
    if (!guarded.ok) {
      return fail(guarded.status, guarded.code, guarded.message, { scan: guarded.scan });
    }
    updateUser(guard.user.sub, { kyc_status: "pending", kyc_doc_key: guarded.stored.key });
    return created({
      status: "pending",
      uploaded: true,
      fileUrl: `/api/v1/files/${guarded.stored.key}`,
      scan: guarded.scan,
    });
  } catch (err) {
    const code = (err as Error).message;
    if (code === "FILE_TOO_LARGE") return fail(413, "FILE_TOO_LARGE", "KYC documents must be under 10 MB.");
    return fail(415, "UNSUPPORTED_FILE_TYPE", "Upload a valid PDF, PNG, JPEG or WebP file.");
  }
}
