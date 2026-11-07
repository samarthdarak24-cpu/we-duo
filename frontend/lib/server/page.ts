// ---------------------------------------------------------------------------
// Server-component session helpers. A portal page renders for the signed-in
// account and for nobody else: with no session the visitor is sent to /login
// instead of being silently mapped onto a seeded demo account, which used to
// expose another person's vehicles, documents and notifications.
// ---------------------------------------------------------------------------
import { redirect } from "next/navigation";
import { getSessionUser } from "./session";
import { getMe, getNotificationsFor } from "./data";

export type Portal = "seller" | "buyer" | "admin";

export function portalUser(portal: Portal) {
  const user = getSessionUser(portal);
  if (!user) redirect(`/login?next=${portal}`);
  // Page-level RBAC: a signed-in buyer must not render a seller portal (and
  // vice versa). API routes enforce this too; this stops the UI from leaking
  // another role's data before a request is made.
  const allowed = portal === "admin" ? user.role === "admin" : user.role === portal;
  if (!allowed) redirect(`/login?next=${portal}`);
  const me = getMe(user.id);
  if (!me) redirect(`/login?next=${portal}`);
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
