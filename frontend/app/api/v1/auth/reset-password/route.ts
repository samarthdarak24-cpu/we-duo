import { resetPassword } from "@/lib/server/accounts";
import { fail, ok } from "@/lib/server/http";
import { passwordProblem } from "@/lib/server/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/auth/reset-password — body { token, password }. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { token?: string; password?: string } | null;
  if (!body?.token || !body?.password) return fail(400, "VALIDATION_FAILED", "token and password are required");
  const problem = passwordProblem(body.password);
  if (problem) return fail(400, "VALIDATION_FAILED", problem);
  const user = resetPassword(body.token, body.password);
  if (!user) return fail(400, "INVALID_TOKEN", "This reset link is invalid or has expired.");
  return ok({ reset: true, email: user.email });
}
