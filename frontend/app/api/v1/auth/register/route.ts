import { createUser, getUserByEmail, updateUser } from "@/lib/server/db";
import { hashPassword, type Role } from "@/lib/server/auth";
import { created, fail, withRefreshCookie, withSessionCookie } from "@/lib/server/http";
import { isValidEmail, passwordProblem } from "@/lib/server/validate";
import { isProd, issueToken, requestMeta, sendMail, startSession } from "@/lib/server/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/auth/register — signup, verification email, session cookies. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { name?: string; email?: string; password?: string; role?: string; sellerType?: string; businessName?: string }
    | null;
  if (!body?.name || !body?.email || !body?.password) {
    return fail(400, "VALIDATION_FAILED", "name, email and password are required");
  }
  if (!isValidEmail(body.email)) return fail(400, "VALIDATION_FAILED", "Enter a valid email address.");
  const problem = passwordProblem(body.password);
  if (problem) return fail(400, "VALIDATION_FAILED", problem);
  if (getUserByEmail(body.email)) {
    return fail(409, "DUPLICATE_EMAIL", "An account with this email already exists");
  }
  const role: Role = body.role === "seller" ? "seller" : "buyer";
  const id = `u-${Date.now()}`;
  const initials = body.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const email = body.email.trim().toLowerCase();
  createUser({ id, name: body.name.trim(), role, email, password_hash: hashPassword(body.password), initials });
  if (role === "seller") {
    updateUser(id, {
      seller_type: body.sellerType ?? "individual",
      business_name: body.businessName ?? null,
    });
  }

  const token = issueToken(id, "verify_email");
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const link = `${base}/verify-email/${token}`;
  const delivery = await sendMail({
    to: email,
    subject: "Verify your TrustDrive email",
    body: "Confirm your address to activate email alerts.",
    link,
  });

  const meta = requestMeta(req);
  const { refresh, session } = startSession(id, meta);
  const res = created({
    user: { id, name: body.name.trim(), role, initials, emailVerified: false },
    sellerType: role === "seller" ? body.sellerType ?? "individual" : null,
    // Honest: true only when the provider accepted the message.
    verificationSent: delivery.ok,
    emailDelivery: delivery,
    ...(isProd() ? {} : { verificationLink: link }),
  });
  withSessionCookie(res, { id, role, name: body.name.trim() }, session.id);
  return withRefreshCookie(res, refresh);
}
