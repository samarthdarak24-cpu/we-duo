// ---------------------------------------------------------------------------
// Short-lived signed download URLs (design.md §13, §6.13).
// Stateless HMAC token: scope + entity id + expiry. The session/RBAC path stays
// authoritative; a signed token only grants the scoped read it was minted for.
//
// Fail closed in production: if no signing secret is configured, no token can be
// minted or accepted. The old code fell back to a public development string,
// which would let anyone forge a download token on a misconfigured deployment.
// ---------------------------------------------------------------------------
import { createHmac, timingSafeEqual } from "node:crypto";

const DEV_SECRET = "trustdrive-download-dev-secret-change-in-prod";
// `next start` sets NODE_ENV=production even for a local demo. TD_ENV=local is
// the explicit escape hatch used by the checked-in development environment.
const IS_PRODUCTION = process.env.NODE_ENV === "production" && process.env.TD_ENV !== "local";
const CONFIGURED_SECRET = process.env.DOWNLOAD_SIGNING_SECRET || process.env.QR_SIGNING_SECRET;
const SECRET = CONFIGURED_SECRET || (IS_PRODUCTION ? null : DEV_SECRET);

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

const fromB64url = (value: string) =>
  Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/** True when a real signing secret is configured (false = production lockout). */
export function downloadSigningConfigured(): boolean {
  return SECRET !== null;
}

function sign(data: string): string | null {
  if (!SECRET) return null;
  return b64url(createHmac("sha256", SECRET).update(data).digest());
}

export type DownloadScope = "report" | "file";

export interface DownloadTokenPayload {
  scope: DownloadScope;
  id: string;
  exp: number;
  v: 1;
}

export function signDownloadToken(scope: DownloadScope, id: string, ttlSeconds = 900): string | null {
  if (!SECRET) return null;
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
  if (!SECRET) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  if (!expected || signature.length !== expected.length) return null;
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

export function signedDownloadPath(
  path: string,
  scope: DownloadScope,
  id: string,
  ttlSeconds = 900
): string | null {
  const token = signDownloadToken(scope, id, ttlSeconds);
  if (!token) return null;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}token=${encodeURIComponent(token)}`;
}
