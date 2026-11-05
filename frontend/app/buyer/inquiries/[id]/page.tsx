import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { Inbox } from "@/components/seller/Inbox";
import { portalUser } from "@/lib/server/page";
import { getInquiriesForBuyer } from "@/lib/server/data";

export const metadata: Metadata = { title: "Conversation — TrustDrive" };
export const dynamic = "force-dynamic";

export default function BuyerInquiryThreadPage({ params }: { params: { id: string } }) {
  const user = portalUser("buyer");
  if (!user) notFound();
  const items = getInquiriesForBuyer(user.id);
  if (!items.some((i) => i.id === params.id)) notFound();

  return (
    <PortalShell portal="buyer" activeLabel="Inquiries" profile={user.profile} unread={user.unread} title="TrustDrive — Inquiries">
      <PageHeader eyebrow="Conversation" title="Conversation" subtitle="Ask for documents, schedule a test drive or negotiate with the seller.">
        <a href="/buyer/inquiries" className="td-btn td-btn-secondary">
          All inquiries
        </a>
      </PageHeader>
      <Inbox items={items} viewerId={user.id} role="buyer" initialSelected={params.id} />
    </PortalShell>
  );
}
