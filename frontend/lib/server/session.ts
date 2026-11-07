// ---------------------------------------------------------------------------
// Session helper for server components. Reads the httpOnly access-token cookie
// set by POST /auth/login and returns only that account. There is deliberately
// no seeded "demo account" fallback: an anonymous visitor rendered a privileged
// page as if they were u-seller / u-admin, which exposed private reports and
// consent-gated evidence. Anonymous requests get the public view (or notFound),
// exactly as the API layer already does through requireRole().
// ---------------------------------------------------------------------------
import { cookies } from "next/headers";
import { verifyToken } from "./auth";
import { getUserById, type UserRow } from "./db";

export function getSessionUser(_portal: "seller" | "buyer" | "admin"): UserRow | undefined {
  try {
    const token = cookies().get("td_token")?.value;
    const payload = token ? verifyToken(token) : null;
    if (payload) {
      const user = getUserById(payload.sub);
      if (user) return user;
    }
  } catch {
    // cookies() is unavailable outside a request scope (e.g. tests).
  }
  return undefined;
}
