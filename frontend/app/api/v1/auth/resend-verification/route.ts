import { getUserByEmail, getUserById } from "@/lib/server/db";
import { appBaseUrl, fail, getAuth, ok } from "@/lib/server/http";
import { isProd, issueToken, sendMail } from "@/lib/server/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/auth/resend-verification — body { email } or an authenticated session. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const auth = getAuth(req);
  const user = auth ? getUserById(auth.sub) : body.email ? getUserByEmail(body.email) : undefined;
  // Always return ok for unknown addresses so the endpoint cannot enumerate users.
  if (!user || user.email_verified) return ok({ sent: false });
  const token = issueToken(user.id, "verify_email");
  const base = appBaseUrl(req);
  const link = `${base}/verify-email/${token}`;
  const delivery = await sendMail({
    to: user.email,
    subject: "Verify your TrustDrive email",
    body: "Confirm your address.",
    link,
  });
  return ok({ sent: delivery.ok, emailDelivery: delivery, ...(isProd() ? {} : { verificationLink: link }) });
}
