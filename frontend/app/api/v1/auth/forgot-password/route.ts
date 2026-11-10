import { getUserByEmail } from "@/lib/server/db";
import { appBaseUrl, fail, ok } from "@/lib/server/http";
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
  const base = appBaseUrl(req);
  const link = `${base}/reset-password/${token}`;
  // Generic response is deliberate: it must not reveal whether the address
  // exists. `emailDelivery` reports what the provider actually did.
  const delivery = await sendMail({
    to: user.email,
    subject: "Reset your TrustDrive password",
    body: "This link expires in one hour.",
    link,
  });
  return ok({ sent: true, emailDelivery: delivery, ...(isProd() ? {} : { resetLink: link }) });
}
