import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { ListingDetailEditor } from "@/components/seller/ListingDetailEditor";
import { portalUser } from "@/lib/server/page";
import { getSellerListingForActor } from "@/lib/server/data";

export const metadata: Metadata = { title: "Listing workspace — TrustDrive" };
export const dynamic = "force-dynamic";

export default function SellerListingDetailPage({ params }: { params: { id: string } }) {
  const user = portalUser("seller");
  if (!user) notFound();

  const result = getSellerListingForActor(user.id, params.id);
  if (!result.ok) notFound();

  return (
    <PortalShell
      portal="seller"
      activeLabel="Marketplace Listings"
      profile={user.profile}
      unread={user.unread}
      title="TrustDrive — Listing workspace"
      hideAssistant
    >
      <PageHeader
        eyebrow="Marketplace"
        title="Listing workspace"
        subtitle="Edit content, manage photos and move the listing through its states. Blockers are enforced server-side."
      >
        <a href="/seller/listings" className="td-btn td-btn-secondary">
          All listings
        </a>
        <a href={`/vehicle/${result.listing.vehicleId}`} target="_blank" rel="noreferrer" className="td-btn td-btn-primary">
          Preview as buyer
        </a>
      </PageHeader>

      <ListingDetailEditor detail={result} />
    </PortalShell>
  );
}
