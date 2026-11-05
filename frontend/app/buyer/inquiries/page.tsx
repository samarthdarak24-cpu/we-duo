import type { Metadata } from "next";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { Inbox } from "@/components/seller/Inbox";
import { portalUser } from "@/lib/server/page";
import { getInquiriesForBuyer } from "@/lib/server/data";

export const metadata: Metadata = { title: "Inquiries — TrustDrive" };
export const dynamic = "force-dynamic";

export default function BuyerInquiriesPage() {
  const user = portalUser("buyer")!;
  const items = getInquiriesForBuyer(user.id);

  return (
    <PortalShell portal="buyer" activeLabel="Inquiries" profile={user.profile} unread={user.unread} title="TrustDrive — Inquiries">
      <PageHeader
        eyebrow="Conversations"
        title="Inquiries"
        subtitle="Contact sellers, ask for documents, schedule test drives and negotiate — every message is stored with the listing."
      />
      <Inbox items={items} viewerId={user.id} role="buyer" />
    </PortalShell>
  );
}
