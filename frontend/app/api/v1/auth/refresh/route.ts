import { getUserById } from "@/lib/server/db";
import { signToken, type Role } from "@/lib/server/auth";
import { fail, getAuth, ok, readCookie, withRefreshCookie, withSessionCookie } from "@/lib/server/http";
import { rotateSession } from "@/lib/server/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/auth/refresh — rotate the refresh token and re-issue the access cookie. */
export async function POST(req: Request) {
  const refresh = readCookie(req, "td_refresh");
  const rotated = refresh ? rotateSession(refresh) : null;
  if (!rotated) {
    // Fall back to a still-valid access token (e.g. cookie-only demo sessions).
    const auth = getAuth(req);
    if (!auth) return fail(401, "UNAUTHENTICATED", "No valid session to refresh.");
    const u = getUserById(auth.sub);
    if (!u) return fail(404, "NOT_FOUND", "User not found");
    const res = ok({ refreshed: true, accessToken: signToken({ sub: u.id, role: u.role as Role, name: u.name, sid: auth.sid }) });
    return withSessionCookie(res, { id: u.id, role: u.role as Role, name: u.name }, auth.sid);
  }
  const u = getUserById(rotated.session.user_id);
  if (!u) return fail(404, "NOT_FOUND", "User not found");
  const res = ok({ refreshed: true, accessToken: signToken({ sub: u.id, role: u.role as Role, name: u.name, sid: rotated.session.id }) });
  withSessionCookie(res, { id: u.id, role: u.role as Role, name: u.name }, rotated.session.id);
  return withRefreshCookie(res, rotated.refresh);
}
