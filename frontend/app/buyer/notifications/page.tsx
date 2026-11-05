import type { Metadata } from "next";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { NotificationsList } from "@/components/shared/NotificationsList";
import { portalUser } from "@/lib/server/page";
import { getNotificationsPageFor } from "@/lib/server/data";

export const metadata: Metadata = { title: "Notifications — TrustDrive" };
export const dynamic = "force-dynamic";

export default function BuyerNotificationsPage() {
  const user = portalUser("buyer")!;
  const page = getNotificationsPageFor(user.id, 20);
  return (
    <PortalShell portal="buyer" activeLabel="Notifications" profile={user.profile} unread={user.unread} title="TrustDrive — Notifications">
      <PageHeader
        eyebrow="Activity"
        title="Notifications"
        subtitle="Price changes, saved-vehicle updates and verification alerts."
      />
      <NotificationsList items={page.items} initialHasMore={page.hasMore} initialBefore={page.nextBefore} />
    </PortalShell>
  );
}
