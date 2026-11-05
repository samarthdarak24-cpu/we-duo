import type { Metadata } from "next";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { Inbox } from "@/components/seller/Inbox";
import { EmptyState } from "@/components/shared/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { portalUser } from "@/lib/server/page";
import { getInquiriesForSeller } from "@/lib/server/data";

export const metadata: Metadata = { title: "Buyer Inquiries — TrustDrive" };
export const dynamic = "force-dynamic";

export default function SellerInquiriesPage({ searchParams }: { searchParams: { listing?: string } }) {
  const user = portalUser("seller")!;
  const all = getInquiriesForSeller(user.id);
  const items = searchParams.listing ? all.filter((i) => i.listingId === searchParams.listing) : all;

  return (
    <PortalShell portal="seller" activeLabel="Buyer Inquiries" profile={user.profile} unread={user.unread} title="TrustDrive — Buyer Inquiries">
      <PageHeader
        eyebrow="Conversations"
        title="Buyer Inquiries"
        subtitle="Reply, share reports, schedule test drives and resolve conversations without leaving the portal."
      />
      {searchParams.listing && (
        <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-primary/30 bg-info-bg px-4 py-2.5">
          <Icon name="Filter" size={14} className="text-primary" />
          <span className="text-[12.5px] font-semibold text-ink">
            Filtered to one listing · {items.length} {items.length === 1 ? "inquiry" : "inquiries"}
          </span>
          <a href="/seller/inquiries" className="td-btn td-btn-secondary td-btn-sm ml-auto">
            Clear filter
          </a>
        </div>
      )}
      {!items.length ? (
        <EmptyState
          icon="MessageSquare"
          title={searchParams.listing ? "No inquiries for this listing yet" : "No buyer inquiries yet"}
          detail={
            searchParams.listing
              ? "Once a buyer opens a conversation on this listing it appears here with its full message thread."
              : "Publish a listing and buyers can ask questions, request reports or schedule a test drive."
          }
          action={
            <a href="/seller/listings" className="td-btn td-btn-primary mt-2">
              {searchParams.listing ? "Back to listings" : "Marketplace listings"}
            </a>
          }
        />
      ) : (
        <Inbox items={items} viewerId={user.id} role="seller" />
      )}
    </PortalShell>
  );
}
