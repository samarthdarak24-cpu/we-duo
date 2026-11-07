import { lookupVehicle } from "@/lib/server/data";
import { getQrToken } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { verifyQrToken } from "@/lib/server/qr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/v1/verification/lookup — body { type: reg|vin|tdid|qr, value }.
 * Public: buyers can verify any vehicle without an account.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { type?: string; value?: string } | null;
  if (!body?.value) return fail(400, "VALIDATION_FAILED", "value is required");
  const type = ["reg", "vin", "tdid", "qr"].includes(body.type ?? "") ? body.type! : "any";

  if (type === "qr") {
    const payload = verifyQrToken(body.value.trim());
    if (!payload) return fail(400, "INVALID_QR", "This QR code is not a genuine TrustDrive token.");
    const stored = getQrToken(body.value.trim());
    if (!stored || stored.revoked_at) {
      return fail(410, "QR_REVOKED", "This QR code has been revoked. Ask the seller for the current code.");
    }
    // signQrToken() stores the internal vehicle id (e.g. "v-bmw") in payload.vid,
    // not a TD-xxxxxxx TrustDrive id. Resolve by tdid first (for tokens minted
    // with a public id), then by any identifier, then by the stored token row.
    // Without these fallbacks every valid QR token 404s on this endpoint while
    // GET /api/v1/verify/:token succeeds — see QA22 feature 15.
    const result =
      lookupVehicle("tdid", payload.vid) ??
      lookupVehicle("any", payload.vid) ??
      (stored.vehicle_id ? lookupVehicle("any", stored.vehicle_id) : null);
    if (!result) return fail(404, "NO_RECORD", "No TrustDrive record for this QR code.");
    return ok({ via: "qr", ...result });
  }

  const result = lookupVehicle(type, body.value);
  if (!result) {
    return fail(
      404,
      "NO_RECORD",
      "No TrustDrive record for this identifier. This is not an error — the vehicle may not be registered on TrustDrive."
    );
  }
  return ok(result);
}
