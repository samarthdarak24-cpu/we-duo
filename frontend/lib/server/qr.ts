// ---------------------------------------------------------------------------
// Revocable, signed QR verification tokens (design.md §31.1). Payload carries
// only the vehicle id + a random jti; the signature makes it unguessable.
// ---------------------------------------------------------------------------
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

const SECRET = process.env.QR_SIGNING_SECRET || "trustdrive-qr-dev-secret-change-in-prod";

const b64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

function sign(data: string) {
  return b64url(createHmac("sha256", SECRET).update(data).digest());
}

export interface QrPayload {
  vid: string;
  jti: string;
  v: 1;
}

export function newJti() {
  return randomBytes(16).toString("hex");
}

export function signQrToken(vehicleId: string, jti = newJti()): string {
  const payload = b64url(JSON.stringify({ vid: vehicleId, jti, v: 1 } satisfies QrPayload));
  return `${payload}.${sign(payload)}`;
}

export function verifyQrToken(token: string): QrPayload | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(fromB64url(payload).toString("utf8")) as QrPayload;
    return parsed.v === 1 && parsed.vid && parsed.jti ? parsed : null;
  } catch {
    return null;
  }
}
