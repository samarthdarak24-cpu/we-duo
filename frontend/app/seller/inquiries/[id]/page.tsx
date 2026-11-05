import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { Inbox } from "@/components/seller/Inbox";
import { portalUser } from "@/lib/server/page";
import { getInquiriesForSeller } from "@/lib/server/data";

export const metadata: Metadata = { title: "Conversation — TrustDrive" };
export const dynamic = "force-dynamic";

export default function SellerInquiryThreadPage({ params }: { params: { id: string } }) {
  const user = portalUser("seller");
  if (!user) notFound();
  const items = getInquiriesForSeller(user.id);
  if (!items.some((i) => i.id === params.id)) notFound();

  return (
    <PortalShell portal="seller" activeLabel="Buyer Inquiries" profile={user.profile} unread={user.unread} title="TrustDrive — Buyer Inquiries">
      <PageHeader eyebrow="Conversation" title="Conversation" subtitle="Reply, share reports, schedule test drives and resolve conversations.">
        <a href="/seller/inquiries" className="td-btn td-btn-secondary">
          All inquiries
        </a>
      </PageHeader>
      <Inbox items={items} viewerId={user.id} role="seller" initialSelected={params.id} />
    </PortalShell>
  );
}
