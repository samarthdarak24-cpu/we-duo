import { getUserById, updateUser } from "@/lib/server/db";
import { fail, ok, requireRole } from "@/lib/server/http";
import { MAX_IMAGE_BYTES, deleteUpload, saveUpload } from "@/lib/server/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AVATAR_LIMIT = Math.min(MAX_IMAGE_BYTES, 2 * 1024 * 1024);

/** POST /api/v1/me/avatar — multipart avatar stored locally, magic-byte checked. */
export async function POST(req: Request) {
  const guard = requireRole(req);
  if (!guard.ok) return guard.response;
  const form = await req.formData().catch(() => null);
  const file = form?.get("avatar");
  if (!(file instanceof File)) return fail(400, "VALIDATION_FAILED", "Attach an avatar file.");
  if (file.size > AVATAR_LIMIT) return fail(413, "FILE_TOO_LARGE", "Avatar must be under 2 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    const stored = saveUpload(`avatars/${guard.user.sub}`, bytes, AVATAR_LIMIT);
    const previous = getUserById(guard.user.sub)?.avatar_url;
    if (previous?.startsWith("/api/v1/files/")) deleteUpload(previous.replace("/api/v1/files/", ""));
    const url = `/api/v1/files/${stored.key}`;
    updateUser(guard.user.sub, { avatar_url: url });
    return ok({ uploaded: true, avatarUrl: url, mime: stored.mime, size: stored.size });
  } catch (err) {
    const code = (err as Error).message;
    if (code === "FILE_TOO_LARGE") return fail(413, "FILE_TOO_LARGE", "Avatar must be under 2 MB.");
    return fail(415, "UNSUPPORTED_FILE_TYPE", "Avatar must be a valid PNG, JPEG or WebP image.");
  }
}
