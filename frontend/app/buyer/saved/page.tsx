import type { Metadata } from "next";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { SavedGrid } from "@/components/buyer/SavedGrid";
import { Icon } from "@/components/ui/Icon";
import { portalUser } from "@/lib/server/page";
import { getSavedVehicles } from "@/lib/server/data";

export const metadata: Metadata = { title: "Saved Vehicles — TrustDrive" };
export const dynamic = "force-dynamic";

export default function SavedPage() {
  const user = portalUser("buyer")!;
  const items = getSavedVehicles(user.id);

  return (
    <PortalShell portal="buyer" activeLabel="Saved Vehicles" profile={user.profile} unread={user.unread} title="TrustDrive — Saved Vehicles">
      <PageHeader
        eyebrow="Shortlist"
        title="Saved vehicles"
        subtitle="Track price changes, availability and open findings before you decide to inspect."
        meta={
          <span className="td-chip">
            <Icon name="Heart" size={12} /> {items.length} saved
          </span>
        }
      >
        <a href="/buyer/compare" className="td-btn td-btn-secondary">
          <Icon name="GitCompare" size={15} /> Compare
        </a>
      </PageHeader>
      <SavedGrid items={items} />
    </PortalShell>
  );
}
