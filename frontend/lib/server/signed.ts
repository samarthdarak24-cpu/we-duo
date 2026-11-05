// ---------------------------------------------------------------------------
// Short-lived signed download URLs (design.md §13, §6.13).
// Stateless HMAC token: scope + entity id + expiry. The session/RBAC path stays
// authoritative; a signed token only grants the scoped read it was minted for.
// ---------------------------------------------------------------------------
import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET =
  process.env.DOWNLOAD_SIGNING_SECRET ||
  process.env.QR_SIGNING_SECRET ||
  "trustdrive-download-dev-secret-change-in-prod";

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

const fromB64url = (value: string) =>
  Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");

function sign(data: string): string {
  return b64url(createHmac("sha256", SECRET).update(data).digest());
}

export type DownloadScope = "report" | "file";

export interface DownloadTokenPayload {
  scope: DownloadScope;
  id: string;
  exp: number;
  v: 1;
}

export function signDownloadToken(scope: DownloadScope, id: string, ttlSeconds = 900): string {
  const payload: DownloadTokenPayload = {
    scope,
    id,
    exp: Math.floor(Date.now() / 1000) + Math.max(30, ttlSeconds),
    v: 1,
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function verifyDownloadToken(token: string): DownloadTokenPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  if (signature.length !== expected.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const parsed = JSON.parse(fromB64url(body).toString("utf8")) as DownloadTokenPayload;
    if (parsed.v !== 1 || !parsed.id || !parsed.exp) return null;
    if (parsed.scope !== "report" && parsed.scope !== "file") return null;
    if (parsed.exp * 1000 <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function signedDownloadPath(path: string, scope: DownloadScope, id: string, ttlSeconds = 900) {
  const token = signDownloadToken(scope, id, ttlSeconds);
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}token=${encodeURIComponent(token)}`;
}
