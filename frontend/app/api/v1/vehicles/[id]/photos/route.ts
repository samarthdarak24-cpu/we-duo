import {
  createListingImage, deleteListingImage, getListing, getListingByVehicle, getListingImages, getVehicle,
  updateListing, updateListingImage,
} from "@/lib/server/db";
import { created, fail, ok, requireRole } from "@/lib/server/http";
import {
  MAX_IMAGE_BYTES,
  isAllowedImageFileName,
  sanitizeFileName,
  sniffUpload,
} from "@/lib/server/files";
import { guardedSaveUpload } from "@/lib/server/upload-guard";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function imagesView(listingId: string) {
  return getListingImages(listingId).map((img) => ({
    id: img.id,
    position: img.position,
    key: img.file_key,
    url: `/api/v1/files/${img.file_key}`,
  }));
}

/** GET /api/v1/vehicles/:id/photos */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller", "admin");
  if (!guard.ok) return guard.response;
  const listing = getListingByVehicle(params.id);
  if (!listing) return ok({ listingId: null, cover: null, images: [] });
  return ok({ listingId: listing.id, cover: listing.cover_image, images: imagesView(listing.id) });
}

/** POST /api/v1/vehicles/:id/photos — multipart photo upload (binary, magic-byte checked). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  const vehicle = getVehicle(params.id);
  if (!vehicle) return fail(404, "NOT_FOUND", "Vehicle not found.");
  if (vehicle.owner_id !== guard.user.sub) return fail(403, "FORBIDDEN", "You do not own this vehicle.");
  const listing = getListingByVehicle(params.id);
  if (!listing) return fail(409, "NO_LISTING", "Create a listing draft before uploading photos.");
  const form = await req.formData().catch(() => null);
  if (!form) return fail(400, "VALIDATION_FAILED", "Invalid multipart body.");
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return fail(400, "VALIDATION_FAILED", "Attach at least one photo.");
  if (files.length > 10) return fail(400, "VALIDATION_FAILED", "Upload at most 10 photos at once.");
  const existing = getListingImages(listing.id);
  if (existing.length + files.length > 20) return fail(409, "PHOTO_LIMIT", "A listing can hold at most 20 photos.");
  let position = existing.reduce((max, img) => Math.max(max, img.position), 0);
  let added = 0;
  for (const file of files) {
    const safeName = sanitizeFileName(file.name, "photo");
    if (file.size === 0) return fail(400, "EMPTY_FILE", `${safeName} is empty.`);
    if (!isAllowedImageFileName(file.name)) {
      return fail(415, "UNSUPPORTED_FILE_TYPE", `${safeName} extension is not allowed. Upload PNG, JPEG or WebP.`);
    }
    if (file.size > MAX_IMAGE_BYTES) return fail(413, "FILE_TOO_LARGE", `${safeName} exceeds 6 MB.`);
    const bytes = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffUpload(bytes);
    if (!sniffed || !sniffed.mime.startsWith("image/")) {
      return fail(415, "UNSUPPORTED_FILE_TYPE", `${safeName} is not a valid PNG, JPEG or WebP image.`);
    }
    try {
      const guarded = await guardedSaveUpload({
        bytes,
        fileName: safeName,
        mime: sniffed.mime,
        folder: `photos/${params.id}`,
        maxBytes: MAX_IMAGE_BYTES,
        actorId: guard.user.sub,
        actorRole: guard.user.role,
        vehicleId: params.id,
        req,
      });
      if (!guarded.ok) {
        return fail(guarded.status, guarded.code, `${file.name}: ${guarded.message}`, { scan: guarded.scan });
      }
      createListingImage(`img-${randomUUID()}`, listing.id, guarded.stored.key, position + 1);
      position += 1;
      added += 1;
    } catch (err) {
      const code = (err as Error).message;
      if (code === "FILE_TOO_LARGE") return fail(413, "FILE_TOO_LARGE", `${file.name} exceeds 6 MB.`);
      return fail(415, "UNSUPPORTED_FILE_TYPE", `${file.name} is not a valid PNG, JPEG or WebP image.`);
    }
  }
  if (!listing.cover_image) {
    const first = imagesView(listing.id)[0];
    if (first) updateListing(listing.id, { cover_image: first.key });
  }
  return created({ uploaded: added, listingId: listing.id, images: imagesView(listing.id) });
}

/** PATCH /api/v1/vehicles/:id/photos — reorder or set the cover. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  const vehicle = getVehicle(params.id);
  if (!vehicle) return fail(404, "NOT_FOUND", "Vehicle not found.");
  if (vehicle.owner_id !== guard.user.sub) return fail(403, "FORBIDDEN", "You do not own this vehicle.");
  const listing = getListingByVehicle(params.id);
  if (!listing) return fail(404, "NOT_FOUND", "Listing not found.");
  const body = (await req.json().catch(() => ({}))) as { imageId?: string; order?: string[]; cover?: string };
  const own = new Set(getListingImages(listing.id).map((i) => i.id));
  if (body.cover) {
    if (!own.has(body.cover)) return fail(404, "NOT_FOUND", "Image not found on this listing.");
    updateListing(listing.id, { cover_image: getListingImages(listing.id).find((i) => i.id === body.cover)?.file_key ?? null });
  }
  if (Array.isArray(body.order)) {
    body.order.forEach((id, idx) => {
      if (own.has(id)) updateListingImage(id, { position: idx + 1 });
    });
  }
  return ok({ images: imagesView(listing.id), cover: getListing(listing.id)?.cover_image ?? null });
}

/** DELETE /api/v1/vehicles/:id/photos?imageId= */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  const vehicle = getVehicle(params.id);
  if (!vehicle) return fail(404, "NOT_FOUND", "Vehicle not found.");
  if (vehicle.owner_id !== guard.user.sub) return fail(403, "FORBIDDEN", "You do not own this vehicle.");
  const listing = getListingByVehicle(params.id);
  if (!listing) return fail(404, "NOT_FOUND", "Listing not found.");
  const id = new URL(req.url).searchParams.get("imageId");
  if (!id) return fail(400, "VALIDATION_FAILED", "imageId is required.");
  const image = getListingImages(listing.id).find((i) => i.id === id);
  if (!image) return fail(404, "NOT_FOUND", "Image not found on this listing.");
  deleteListingImage(id);
  if (listing.cover_image === image.file_key) {
    const next = getListingImages(listing.id)[0];
    updateListing(listing.id, { cover_image: next?.file_key ?? null });
  }
  return ok({ deleted: id, images: imagesView(listing.id) });
}
