// ---------------------------------------------------------------------------
// Account lifecycle: email verification, password reset, sessions, login
// throttling. Tokens are random 32-byte values stored only as SHA-256 hashes.
// Email delivery is mocked (design.md §32): in non-production the API returns
// the link so the demo can complete the flow without SMTP.
// ---------------------------------------------------------------------------
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  clearLoginAttempts, consumeAuthToken, createAuthToken, createSession, getAuthTokenByHash,
  getDb, getLoginAttempts, getSessionByRefresh, getSession, invalidateAuthTokens, recordLoginFailure,
  revokeAllSessions, revokeSession, touchSession, updatePassword, updateUser, getUserById,
  createAudit,
} from "./db";
import { hashPassword } from "./auth";

const TOKEN_TTL_MS: Record<string, number> = {
  verify_email: 24 * 60 * 60 * 1000,
  reset_password: 60 * 60 * 1000,
};

export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

function hashToken(raw: string) {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export function issueToken(userId: string, type: "verify_email" | "reset_password") {
  invalidateAuthTokens(userId, type);
  const raw = randomBytes(32).toString("base64url");
  const now = new Date();
  createAuthToken({
    id: `tok-${randomUUID()}`,
    user_id: userId,
    type,
    token_hash: hashToken(raw),
    expires_at: new Date(now.getTime() + TOKEN_TTL_MS[type]).toISOString(),
    used_at: null,
    created_at: now.toISOString(),
  });
  return raw;
}

export function consumeToken(raw: string, type: "verify_email" | "reset_password") {
  const row = getAuthTokenByHash(hashToken(raw));
  if (!row || row.type !== type || row.used_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  consumeAuthToken(row.id);
  return row;
}

export function verifyEmail(raw: string) {
  const token = consumeToken(raw, "verify_email");
  if (!token) return null;
  const user = getUserById(token.user_id);
  if (!user) return null;
  updateUser(user.id, { email_verified: 1 });
  createAudit({
    id: `aud-${randomUUID()}`, actor_id: user.id, action: "auth.email_verified", entity_type: "user",
    entity_id: user.id, before: "{}", after: "{}", ip: "", user_agent: "", at: new Date().toISOString(),
  });
  return user;
}

export function resetPassword(raw: string, newPassword: string) {
  const token = consumeToken(raw, "reset_password");
  if (!token) return null;
  const user = getUserById(token.user_id);
  if (!user) return null;
  updatePassword(user.id, hashPassword(newPassword));
  revokeAllSessions(user.id);
  createAudit({
    id: `aud-${randomUUID()}`, actor_id: user.id, action: "auth.password_reset", entity_type: "user",
    entity_id: user.id, before: "{}", after: "{}", ip: "", user_agent: "", at: new Date().toISOString(),
  });
  return user;
}

// ---- Sessions -------------------------------------------------------------
export interface RequestMeta { ip: string; userAgent: string }

export function requestMeta(req: Request): RequestMeta {
  const forwarded = req.headers.get("x-forwarded-for") ?? "";
  return {
    ip: forwarded.split(",")[0].trim() || req.headers.get("x-real-ip") || "127.0.0.1",
    userAgent: req.headers.get("user-agent") ?? "unknown",
  };
}

export function startSession(userId: string, meta: RequestMeta) {
  const refresh = randomBytes(32).toString("base64url");
  const now = new Date().toISOString();
  const session = {
    id: `sess-${randomUUID()}`,
    user_id: userId,
    refresh_hash: hashToken(refresh),
    user_agent: meta.userAgent.slice(0, 220),
    ip: meta.ip,
    created_at: now,
    last_seen_at: now,
    revoked_at: null,
  };
  createSession(session);
  updateUser(userId, { last_login_at: now });
  return { refresh, session };
}

export function rotateSession(refresh: string) {
  const session = getSessionByRefresh(hashToken(refresh));
  if (!session || session.revoked_at) return null;
  const next = randomBytes(32).toString("base64url");
  // Store the new hash directly; the old refresh token stops working.
  getDb().prepare("UPDATE sessions SET refresh_hash = ?, last_seen_at = ? WHERE id = ?")
    .run(hashToken(next), new Date().toISOString(), session.id);
  return { refresh: next, session };
}

export function endSession(id: string, userId: string) {
  revokeSession(id, userId);
}

export function endAllSessions(userId: string) {
  revokeAllSessions(userId);
}

export function sessionForRefresh(refresh: string) {
  const session = getSessionByRefresh(hashToken(refresh));
  if (!session || session.revoked_at) return null;
  touchSession(session.id);
  return session;
}

export function sessionById(id: string) {
  return getSession(id);
}

// ---- Login throttling -----------------------------------------------------
export function loginLockRemaining(email: string, ip: string): number {
  const key = `${email.toLowerCase()}|${ip}`;
  const row = getLoginAttempts(key);
  if (!row?.locked_until) return 0;
  return Math.max(0, new Date(row.locked_until).getTime() - Date.now());
}

export function registerLoginFailure(email: string, ip: string): number {
  const key = `${email.toLowerCase()}|${ip}`;
  const current = getLoginAttempts(key)?.attempts ?? 0;
  const attempts = current + 1;
  const lockedUntil = attempts >= MAX_LOGIN_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS).toISOString() : null;
  recordLoginFailure(key, lockedUntil);
  return Math.max(0, MAX_LOGIN_ATTEMPTS - attempts);
}

export function clearLoginFailures(email: string, ip: string) {
  clearLoginAttempts(`${email.toLowerCase()}|${ip}`);
}

// ---- Mailer ---------------------------------------------------------------
// Real SMTP delivery lives in `mailer.ts`; this re-export keeps the account
// routes stable while every send now returns an honest, persisted outcome.
export type { OutboundMail as Mail, DeliveryResult } from "./mailer";
export { sendMail, sendSms, getMailerStatus, getSmsStatus } from "./mailer";

export function isProd() {
  return process.env.NODE_ENV === "production";
}
