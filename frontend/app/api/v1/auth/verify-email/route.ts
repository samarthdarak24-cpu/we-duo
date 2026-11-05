import { verifyEmail } from "@/lib/server/accounts";
import { fail, ok } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/auth/verify-email — body { token }. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { token?: string } | null;
  if (!body?.token) return fail(400, "VALIDATION_FAILED", "token is required");
  const user = verifyEmail(body.token);
  if (!user) return fail(400, "INVALID_TOKEN", "This verification link is invalid or has expired.");
  return ok({ verified: true, email: user.email });
}
