import { getUserById, updateUser } from "@/lib/server/db";
import { verifyPassword } from "@/lib/server/auth";
import { fail, ok, requireRole } from "@/lib/server/http";
import { generateTotpSecret, otpauthUrl, verifyTotp } from "@/lib/server/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function prefsOf(raw: string) {
  try {
    return JSON.parse(raw || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** POST /api/v1/me/2fa — begin enrolment; returns a secret and otpauth URL. */
export async function POST(req: Request) {
  const guard = requireRole(req);
  if (!guard.ok) return guard.response;
  const u = getUserById(guard.user.sub);
  if (!u) return fail(404, "NOT_FOUND", "User not found.");
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  if (!body.password || !verifyPassword(body.password, u.password_hash)) {
    return fail(401, "INVALID_CREDENTIALS", "Enter your current password to begin 2FA setup.");
  }
  if (u.twofa_enabled) return fail(409, "ALREADY_ENABLED", "Two-factor authentication is already enabled.");
  const secret = generateTotpSecret();
  updateUser(u.id, { preferences: JSON.stringify({ ...prefsOf(u.preferences), twofaSecret: secret }) });
  return ok({ secret, otpauthUrl: otpauthUrl(secret, u.email), issuer: "TrustDrive" });
}

/** PUT /api/v1/me/2fa — confirm a code and enable. */
export async function PUT(req: Request) {
  const guard = requireRole(req);
  if (!guard.ok) return guard.response;
  const u = getUserById(guard.user.sub);
  if (!u) return fail(404, "NOT_FOUND", "User not found.");
  const body = (await req.json().catch(() => ({}))) as { code?: string };
  const secret = prefsOf(u.preferences).twofaSecret as string | undefined;
  if (!secret) return fail(409, "NOT_STARTED", "Start 2FA setup first.");
  if (!body.code || !verifyTotp(secret, body.code)) return fail(401, "INVALID_TWOFA", "That code is not valid. Try the next one.");
  updateUser(u.id, {
    twofa_enabled: 1,
    preferences: JSON.stringify({ ...prefsOf(u.preferences), twofaSecret: secret }),
  });
  return ok({ enabled: true });
}

/** DELETE /api/v1/me/2fa — disable with the current password. */
export async function DELETE(req: Request) {
  const guard = requireRole(req);
  if (!guard.ok) return guard.response;
  const u = getUserById(guard.user.sub);
  if (!u) return fail(404, "NOT_FOUND", "User not found.");
  const body = (await req.json().catch(() => ({}))) as { password?: string };
  if (!body.password || !verifyPassword(body.password, u.password_hash)) {
    return fail(401, "INVALID_CREDENTIALS", "Enter your current password to disable 2FA.");
  }
  const prefs = prefsOf(u.preferences);
  delete prefs.twofaSecret;
  updateUser(u.id, { twofa_enabled: 0, preferences: JSON.stringify(prefs) });
  return ok({ enabled: false });
}
