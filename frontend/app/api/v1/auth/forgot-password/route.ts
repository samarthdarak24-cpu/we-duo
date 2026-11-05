import { getUserByEmail } from "@/lib/server/db";
import { fail, ok } from "@/lib/server/http";
import { isProd, issueToken, sendMail } from "@/lib/server/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/auth/forgot-password — body { email }. Always generic. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { email?: string } | null;
  if (!body?.email) return fail(400, "VALIDATION_FAILED", "email is required");
  const user = getUserByEmail(body.email);
  if (!user) return ok({ sent: true });
  const token = issueToken(user.id, "reset_password");
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const link = `${base}/reset-password/${token}`;
  sendMail({ to: user.email, subject: "Reset your TrustDrive password", body: "This link expires in one hour.", link });
  return ok({ sent: true, ...(isProd() ? {} : { resetLink: link }) });
}
