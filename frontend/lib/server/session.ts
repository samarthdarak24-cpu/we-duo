// ---------------------------------------------------------------------------
// Session helper for server components. Reads the httpOnly access-token cookie
// set by POST /auth/login; falls back to the seeded demo account for the portal
// so the demo dashboards work before login (documented in DECISIONS.md).
// ---------------------------------------------------------------------------
import { cookies } from "next/headers";
import { verifyToken } from "./auth";
import { getUserById, type UserRow } from "./db";

export function getSessionUser(portal: "seller" | "buyer" | "admin"): UserRow | undefined {
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
  const fallback = portal === "seller" ? "u-seller" : portal === "buyer" ? "u-buyer" : "u-admin";
  return getUserById(fallback);
}
