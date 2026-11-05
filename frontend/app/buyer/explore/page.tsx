import type { Metadata } from "next";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { VehicleCard } from "@/components/buyer/VehicleCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { portalUser } from "@/lib/server/page";
import { getExploreVehicles } from "@/lib/server/data";

export const metadata: Metadata = { title: "Explore Vehicles — TrustDrive" };
export const dynamic = "force-dynamic";

const tabs = ["All", "Recently added", "Popular", "Verified", "Recommended"] as const;

export default function ExplorePage({ searchParams }: { searchParams: { tab?: string } }) {
  const user = portalUser("buyer")!;
  const tab = tabs.find((t) => t === searchParams.tab) ?? "All";
  const vehicles = getExploreVehicles(user.id, tab);

  return (
    <PortalShell portal="buyer" activeLabel="Explore Vehicles" profile={user.profile} unread={user.unread} title="Explore vehicles">
      <PageHeader
        eyebrow="Marketplace"
        title="Explore vehicles"
        subtitle="Every card links to the evidence behind it — documents, mileage, findings and inspection records."
        meta={
          <>
            <span className="td-chip">
              <Icon name="Store" size={12} /> {vehicles.length} listings
            </span>
            <span className="td-chip">
              <Icon name="ShieldCheck" size={12} /> Deterministic scores
            </span>
          </>
        }
      >
        <a href="/buyer/compare" className="td-btn td-btn-secondary">
          <Icon name="GitCompare" size={15} /> Compare
        </a>
        <a href="/buyer/search" className="td-btn td-btn-primary">
          <Icon name="SlidersHorizontal" size={15} /> Advanced filters
        </a>
      </PageHeader>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="td-scroll flex max-w-full gap-1 overflow-x-auto rounded-[11px] border border-border bg-surface p-1">
          {tabs.map((t) => (
            <a
              key={t}
              href={t === "All" ? "/buyer/explore" : `/buyer/explore?tab=${encodeURIComponent(t)}`}
              aria-current={tab === t ? "page" : undefined}
              className={
                "whitespace-nowrap rounded-[8px] px-3.5 py-1.5 text-[12.5px] font-semibold transition " +
                (tab === t ? "bg-[#17191B] text-white shadow-sm" : "text-muted hover:bg-surface-tint hover:text-ink")
              }
            >
              {t}
            </a>
          ))}
        </div>
        <p className="text-[12px] text-muted">Sorted by evidence coverage and recency.</p>
      </div>

      {vehicles.length ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {vehicles.map((v) => (
            <VehicleCard key={v.id} v={v} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon="Compass"
          title="No vehicles in this view"
          detail="Try another tab or clear your filters."
          action={
            <a href="/buyer/explore" className="td-btn td-btn-primary mt-2">
              Show all vehicles
            </a>
          }
        />
      )}

      <p className="rounded-[12px] border border-border bg-surface-tint px-4 py-3 text-[11.5px] leading-relaxed text-muted">
        Trust scores are computed deterministically from verified records. A high score does not guarantee the vehicle has no hidden
        issues — always inspect before buying.
      </p>
    </PortalShell>
  );
}
