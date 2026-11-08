import { getUserById, updateUser } from "@/lib/server/db";
import { fail, ok, requireRole } from "@/lib/server/http";
import { MAX_IMAGE_BYTES, deleteUpload, sniffUpload } from "@/lib/server/files";
import { guardedSaveUpload } from "@/lib/server/upload-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AVATAR_LIMIT = Math.min(MAX_IMAGE_BYTES, 2 * 1024 * 1024);

/** POST /api/v1/me/avatar — multipart avatar stored in the active provider, magic-byte checked. */
export async function POST(req: Request) {
  const guard = requireRole(req);
  if (!guard.ok) return guard.response;
  const form = await req.formData().catch(() => null);
  const file = form?.get("avatar");
  if (!(file instanceof File)) return fail(400, "VALIDATION_FAILED", "Attach an avatar file.");
  if (file.size > AVATAR_LIMIT) return fail(413, "FILE_TOO_LARGE", "Avatar must be under 2 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffUpload(bytes);
  if (!sniffed) return fail(415, "UNSUPPORTED_FILE_TYPE", "Avatar must be a valid PNG, JPEG or WebP image.");
  try {
    const guarded = await guardedSaveUpload({
      bytes,
      fileName: file.name,
      mime: sniffed.mime,
      folder: `avatars/${guard.user.sub}`,
      maxBytes: AVATAR_LIMIT,
      actorId: guard.user.sub,
      actorRole: guard.user.role,
      req,
    });
    if (!guarded.ok) {
      return fail(guarded.status, guarded.code, guarded.message, { scan: guarded.scan });
    }
    const previous = getUserById(guard.user.sub)?.avatar_url;
    if (previous?.startsWith("/api/v1/files/")) {
      await deleteUpload(previous.replace("/api/v1/files/", ""));
    }
    const url = `/api/v1/files/${guarded.stored.key}`;
    updateUser(guard.user.sub, { avatar_url: url });
    return ok({
      uploaded: true,
      avatarUrl: url,
      mime: guarded.stored.mime,
      size: guarded.stored.size,
      scan: guarded.scan,
    });
  } catch (err) {
    const code = (err as Error).message;
    if (code === "FILE_TOO_LARGE") return fail(413, "FILE_TOO_LARGE", "Avatar must be under 2 MB.");
    return fail(415, "UNSUPPORTED_FILE_TYPE", "Avatar must be a valid PNG, JPEG or WebP image.");
  }
}
