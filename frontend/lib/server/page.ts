// ---------------------------------------------------------------------------
// Server-component session helpers. Pages render for the signed-in user when a
// session cookie exists, otherwise for the seeded demo account (DECISIONS D11).
// ---------------------------------------------------------------------------
import { redirect } from "next/navigation";
import { getSessionUser } from "./session";
import { getMe, getNotificationsFor } from "./data";

export type Portal = "seller" | "buyer" | "admin";

export function portalUser(portal: Portal) {
  const user = getSessionUser(portal);
  if (!user) return null;
  // Page-level RBAC: a signed-in buyer must not render a seller portal (and
  // vice versa). API routes enforce this too; this stops the UI from leaking
  // another role's data before a request is made.
  const allowed = portal === "admin" ? user.role === "admin" : user.role === portal;
  if (!allowed) redirect(`/login?next=${portal}`);
  const me = getMe(user.id);
  if (!me) return null;
  return {
    id: me.id,
    me,
    profile: {
      name: me.name,
      role: me.role === "seller" ? "Seller" : me.role === "admin" ? "Admin" : "Buyer",
      avatarInitials: me.initials,
    },
    unread: getNotificationsFor(me.id).filter((n) => !n.read).length,
  };
}

/** The demo fallback ids, used by API-driven forms when no cookie is present. */
export const DEMO = { seller: "u-seller", buyer: "u-buyer", admin: "u-admin" } as const;
