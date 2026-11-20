import { getUserByEmail } from "@/lib/server/db";
import { appBaseUrl, fail, ok } from "@/lib/server/http";
import { isProd, issueToken, sendMail } from "@/lib/server/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/auth/forgot-password — body { email }. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { email?: string } | null;
  if (!body?.email) return fail(400, "VALIDATION_FAILED", "email is required");
  const user = getUserByEmail(body.email);
  // Nothing is attempted for an unknown address, so no delivery is claimed.
  if (!user) return ok({ accepted: true, sent: false, emailDelivery: null });
  const token = issueToken(user.id, "reset_password");
  const base = appBaseUrl(req);
  const link = `${base}/reset-password/${token}`;
  // `accepted` means the request was processed; `sent` mirrors the provider's
  // real outcome. A failed delivery is never reported as a sent message.
  const delivery = await sendMail({
    to: user.email,
    subject: "Reset your TrustDrive password",
    body: "This link expires in one hour.",
    link,
  });
  return ok({
    accepted: true,
    sent: delivery.ok,
    emailDelivery: delivery,
    ...(isProd() ? {} : { resetLink: link }),
  });
}
