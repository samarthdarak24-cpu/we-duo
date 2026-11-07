// ---------------------------------------------------------------------------
// Live sidebar badge counts.
//
// The nav arrays in lib/seed.ts carry static demo numbers. Those disagree with
// the real database as soon as a user saves/unsaves a vehicle, sends a message
// or an admin resolves an item. The product rule (AGENTS.md §2 / design.md)
// says displayed data must be real, so the portal shell overrides those badges
// with counts read from the same shared DB the pages use.
//
// A badge of 0 is returned as 0; Sidebar hides non-positive badges. If the DB
// is unavailable the seed value (visibly labelled "Demo workspace · seeded
// data") is kept, so the shell never crashes on a portal page.
// ---------------------------------------------------------------------------
import { getAdminQueue, getInquiriesForBuyer, getInquiriesForSeller, getSavedVehicles } from "./data";
import { getSessionUser } from "./session";
import type { Portal } from "./page";

export function liveNavBadges(portal: Portal, unread = 0): Record<string, number> {
  // Notifications already computed by portalUser(); reuse it instead of a
  // second query.
  const badges: Record<string, number> = { Notifications: unread };
  try {
    const user = getSessionUser(portal);
    if (!user) return badges;

    if (portal === "buyer") {
      badges["Saved Vehicles"] = getSavedVehicles(user.id).length;
      badges["Inquiries"] = getInquiriesForBuyer(user.id).filter((q) => q.status === "open").length;
    } else if (portal === "seller") {
      badges["Buyer Inquiries"] = getInquiriesForSeller(user.id).filter((q) => q.status === "open").length;
    } else {
      const queue = getAdminQueue();
      badges["Review Queue"] = queue.counts.disputes + queue.counts.listings + queue.counts.documents;
    }
  } catch {
    // Keep the seed badges on a DB error rather than breaking every page.
  }
  return badges;
}
