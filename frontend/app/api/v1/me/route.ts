import { getMe, updateProfile } from "@/lib/server/data";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = requireRole(req);
  if (!guard.ok) return guard.response;
  const me = getMe(guard.user.sub);
  if (!me) return fail(404, "NOT_FOUND", "User not found");
  return ok(me);
}

/** PATCH /api/v1/me — profile, business profile and notification preferences. */
export async function PATCH(req: Request) {
  const guard = requireRole(req);
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as {
    name?: string;
    phone?: string;
    city?: string;
    sellerType?: string;
    businessName?: string;
    preferences?: Record<string, unknown>;
  } | null;
  if (!body) return fail(400, "VALIDATION_FAILED", "A JSON body is required.");
  const result = updateProfile(guard.user.sub, body);
  if (!result.ok) return fail(400, result.code, result.message);
  return ok(getMe(guard.user.sub));
}
