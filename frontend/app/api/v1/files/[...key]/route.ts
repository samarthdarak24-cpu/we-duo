import { getDocumentByFileKey, getListingByVehicle, getUserById, getVehicle } from "@/lib/server/db";
import { fail, getAuth } from "@/lib/server/http";
import { getSignedFileUrl, readUpload, sniffUpload, storageProvider } from "@/lib/server/files";
import { verifyDownloadToken } from "@/lib/server/signed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

/**
 * GET /api/v1/files/<key...> — serves local uploads with consent checks.
 * Photos and avatars are public; documents are public only when consented on a
 * published listing, otherwise owner/admin only; KYC files are private.
 */
export async function GET(req: Request, { params }: { params: { key: string[] } }) {
  const key = params.key.join("/");
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME[ext];
  if (!mime) return fail(415, "UNSUPPORTED_TYPE", "Unsupported file type.");

  const signed = verifyDownloadToken(new URL(req.url).searchParams.get("token") ?? "");
  const signedOk = !!signed && signed.scope === "file" && signed.id === key;
  const auth = getAuth(req);
  const user = auth ? getUserById(auth.sub) : undefined;

  // Seeded demo listing photos live under `vehicles/`; uploads use `photos/`.
  const publicAsset =
    key.startsWith("photos/") || key.startsWith("avatars/") || key.startsWith("vehicles/");
  if (!publicAsset && !signedOk) {
    if (key.startsWith("kyc/")) {
      const ownerId = key.split("/")[1];
      if (!user || (user.id !== ownerId && user.role !== "admin")) {
        return fail(403, "FORBIDDEN", "KYC documents are private.");
      }
    } else {
      const doc = getDocumentByFileKey(key);
      if (!doc) return fail(404, "NOT_FOUND", "File not found.");
      const vehicle = getVehicle(doc.vehicle_id);
      const listing = vehicle ? getListingByVehicle(vehicle.id) : undefined;
      const publicSafe = !!doc.consent && listing?.status === "published";
      const privileged = !!user && (user.id === vehicle?.owner_id || user.role === "admin");
      if (!publicSafe && !privileged) return fail(403, "FORBIDDEN", "This document is private.");
    }
  }

  // Authorization has passed. With S3 storage we redirect to a short-lived
  // presigned GET so bytes do not stream through the app server; the URL is
  // issued only after the ownership/consent checks above.
  if (storageProvider() === "s3") {
    const signedUrl = await getSignedFileUrl(key, 120);
    if (!signedUrl) return fail(503, "STORAGE_UNAVAILABLE", "Object storage is not configured.");
    return new Response(null, {
      status: 302,
      headers: {
        Location: signedUrl,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const data = await readUpload(key);
  if (!data) return fail(404, "NOT_FOUND", "File not found.");
  const actual = sniffUpload(data);
  if (!actual) return fail(415, "UNSUPPORTED_TYPE", "Unsupported file type.");
  return new Response(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": actual.mime,
      "Content-Length": String(data.length),
      "Cache-Control": key.startsWith("documents/") || key.startsWith("kyc/") ? "private, no-store" : "public, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": actual.mime === "application/pdf" ? "inline" : "inline",
    },
  });
}
