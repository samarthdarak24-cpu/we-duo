import { getUserById, updateUser } from "@/lib/server/db";
import { created, fail, getAuth, ok, requireRole } from "@/lib/server/http";
import { MAX_DOC_BYTES, saveUpload } from "@/lib/server/files";

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
  try {
    const stored = saveUpload(`kyc/${guard.user.sub}`, bytes, MAX_DOC_BYTES);
    updateUser(guard.user.sub, { kyc_status: "pending", kyc_doc_key: stored.key });
    return created({ status: "pending", uploaded: true, fileUrl: `/api/v1/files/${stored.key}` });
  } catch (err) {
    const code = (err as Error).message;
    if (code === "FILE_TOO_LARGE") return fail(413, "FILE_TOO_LARGE", "KYC documents must be under 10 MB.");
    return fail(415, "UNSUPPORTED_FILE_TYPE", "Upload a valid PDF, PNG, JPEG or WebP file.");
  }
}
