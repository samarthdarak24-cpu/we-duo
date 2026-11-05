// ---------------------------------------------------------------------------
// Auth primitives (design.md §21): scrypt password hashing + HS256 JWT using
// only node:crypto (no external deps). Access token 7 days; refresh handled by
// lib/server/accounts.ts.
//
// SECURITY (SEC-001): the JWT secret must NEVER be a constant in source code.
// `JWT_SECRET` wins; otherwise a cryptographically random secret is generated
// once per installation and persisted in `.data/jwt-secret` (gitignored). The
// Python intelligence service reads the SAME file, so one account/token still
// works across both runtimes without shipping a forgeable secret in the repo.
// ---------------------------------------------------------------------------
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const DATA_DIR = (() => {
  const raw = process.env.TD_DATA_DIR || ".data";
  const abs = join(process.cwd(), raw);
  if (!existsSync(abs) && existsSync(join(process.cwd(), "..", raw))) {
    return join(process.cwd(), "..", raw);
  }
  return abs;
})();
const SECRET_FILE = join(DATA_DIR, "jwt-secret");

function resolveSecret(): string {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  try {
    mkdirSync(dirname(SECRET_FILE), { recursive: true });
    if (!existsSync(SECRET_FILE)) {
      try {
        writeFileSync(SECRET_FILE, randomBytes(32).toString("hex"), { flag: "wx", mode: 0o600 });
      } catch (err) {
        // Another runtime won the race; it owns the file now.
        if ((err as NodeJS.ErrnoException)?.code !== "EEXIST") throw err;
      }
    }
    const persisted = readFileSync(SECRET_FILE, "utf8").trim();
    if (persisted.length >= 32) return persisted;
  } catch {
    // Fall through: never fall back to a publicly known constant.
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET is not configured and .data/jwt-secret is unreadable. " +
      "Set JWT_SECRET to a strong random value before starting in production."
    );
  }
  // Local dev with an unwritable .data: a per-process random secret is still
  // unforgeable (it just won't be shared with the Python runtime).
  return randomBytes(32).toString("hex");
}

const SECRET = resolveSecret();

export type Role = "buyer" | "seller" | "admin";

export interface JwtPayload {
  sub: string;
  role: Role;
  name: string;
  sid?: string;
  iat: number;
  exp: number;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${key}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(key, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

const b64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

function sign(data: string): string {
  return b64url(createHmac("sha256", SECRET).update(data).digest());
}

export function signToken(payload: { sub: string; role: Role; name: string; sid?: string }, ttlSec = 7 * 24 * 60 * 60): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + ttlSec }));
  const data = `${header}.${body}`;
  return `${data}.${sign(data)}`;
}

/** Short-lived service-to-service token for the Next.js -> Python hop.
 *  Signed with the same secret; the Python guard recognises the `svc` claim
 *  instead of looking up a (non-existent) user row. Not usable as a user token. */
export function signServiceToken(ttlSec = 120): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(JSON.stringify({
    sub: "service:nextjs", role: "service", name: "TrustDrive Web",
    svc: "nextjs", iat: now, exp: now + ttlSec,
  }));
  const data = `${header}.${body}`;
  return `${data}.${sign(data)}`;
}

export function verifyToken(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, b, s] = parts;
  // Reject algorithm confusion / "alg: none" before trusting anything else.
  try {
    const header = JSON.parse(fromB64url(h).toString("utf8")) as { alg?: string; typ?: string };
    if (header.alg !== "HS256" || header.typ !== "JWT") return null;
  } catch {
    return null;
  }
  const expected = sign(`${h}.${b}`);
  if (s.length !== expected.length || !timingSafeEqual(Buffer.from(s), Buffer.from(expected))) {
    return null;
  }
  try {
    const payload = JSON.parse(fromB64url(b).toString("utf8")) as JwtPayload;
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
