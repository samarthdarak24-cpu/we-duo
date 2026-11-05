import type { Metadata } from "next";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListingManager } from "@/components/seller/ListingManager";
import { portalUser } from "@/lib/server/page";
import { getSellerListings } from "@/lib/server/data";

export const metadata: Metadata = { title: "Marketplace Listings — TrustDrive" };
export const dynamic = "force-dynamic";

export default function SellerListingsPage({ searchParams }: { searchParams: { vehicle?: string } }) {
  const user = portalUser("seller")!;
  const rows = getSellerListings(user.id);

  return (
    <PortalShell portal="seller" activeLabel="Marketplace Listings" profile={user.profile} unread={user.unread} title="TrustDrive — Marketplace Listings">
      <PageHeader
        eyebrow="Marketplace"
        title="Marketplace Listings"
        subtitle="Create, preview and publish. Blockers must be cleared before a listing can go live."
      />

      {rows.length ? (
        <ListingManager rows={rows} initialId={searchParams.vehicle} />
      ) : (
        <EmptyState
          icon="Store"
          title="Nothing to list yet"
          detail="Add a vehicle first, then create a marketplace listing."
          action={
            <a href="/seller/add-vehicle" className="td-btn td-btn-primary mt-2">
              Add vehicle
            </a>
          }
        />
      )}
    </PortalShell>
  );
}
