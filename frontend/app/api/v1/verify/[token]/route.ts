import { lookupVehicle } from "@/lib/server/data";
import { fail, ok } from "@/lib/server/http";
import { verifyQrToken } from "@/lib/server/qr";
import { getQrToken } from "@/lib/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/verify/:token — public QR / identifier verification (B5).
 * Accepts a signed QR token, registration, VIN, TrustDrive ID or vehicle id.
 * "No record" is a valid outcome, not an error.
 */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const raw = decodeURIComponent(params.token).trim();

  // Signed QR token: verify signature and revocation before lookup.
  const payload = verifyQrToken(raw);
  if (payload) {
    const stored = getQrToken(raw);
    if (!stored || stored.revoked_at) {
      return fail(410, "QR_REVOKED", "This QR code has been revoked. Ask the seller for the current code.");
    }
    const result = lookupVehicle("tdid", payload.vid) ?? lookupVehicle("any", payload.vid);
    if (!result) return fail(404, "NO_RECORD", "No TrustDrive record for this QR code.");
    return ok({ via: "qr", ...result });
  }

  const result = lookupVehicle("any", raw);
  if (!result) {
    return fail(
      404,
      "NO_RECORD",
      "No TrustDrive record for this identifier. This is not an error — the vehicle may not be registered on TrustDrive."
    );
  }
  return ok({ via: "identifier", ...result });
}
