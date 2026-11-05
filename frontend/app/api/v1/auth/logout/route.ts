import { endSession } from "@/lib/server/accounts";
import { readCookie, clearSessionCookie, getAuth, ok } from "@/lib/server/http";
import { sessionForRefresh } from "@/lib/server/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/auth/logout — revokes the current session and clears both cookies. */
export async function POST(req: Request) {
  const auth = getAuth(req);
  if (auth?.sid) endSession(auth.sid, auth.sub);
  const refresh = readCookie(req, "td_refresh");
  if (refresh) {
    const session = sessionForRefresh(refresh);
    if (session) endSession(session.id, session.user_id);
  }
  return clearSessionCookie(ok({ loggedOut: true }));
}
