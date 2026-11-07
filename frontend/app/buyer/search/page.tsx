import type { Metadata } from "next";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { VehicleCard } from "@/components/buyer/VehicleCard";
import { FilterPanel } from "@/components/buyer/FilterPanel";
import { EmptyState } from "@/components/shared/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { portalUser } from "@/lib/server/page";
import { getMarketplace, getSavedSearchesFor, type MarketplaceFilters } from "@/lib/server/data";

export const metadata: Metadata = { title: "Search & Filters — TrustDrive" };
export const dynamic = "force-dynamic";

function num(v?: string) {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export default function SearchPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const user = portalUser("buyer")!;
  const filters: MarketplaceFilters = {
    q: searchParams.q,
    make: searchParams.make,
    priceMin: num(searchParams.priceMin),
    priceMax: num(searchParams.priceMax),
    yearMin: num(searchParams.yearMin),
    yearMax: num(searchParams.yearMax),
    kmMax: num(searchParams.kmMax),
    fuel: searchParams.fuel,
    transmission: searchParams.transmission,
    category: searchParams.category,
    location: searchParams.location,
    ownershipMax: num(searchParams.ownershipMax),
    condition: searchParams.condition,
    verification: (searchParams.verification as MarketplaceFilters["verification"]) ?? undefined,
    accident: (searchParams.accident as MarketplaceFilters["accident"]) ?? undefined,
    trustMin: num(searchParams.trustMin),
    sort: (searchParams.sort as MarketplaceFilters["sort"]) ?? undefined,
    page: num(searchParams.page) ?? 1,
    pageSize: 12,
  };

  const result = getMarketplace(filters, user.id);
  const makes = Array.from(new Set(getMarketplace({ pageSize: 48 }, user.id).items.map((i) => i.make))).sort();
  const savedSearches = getSavedSearchesFor(user.id);

  const pageLink = (page: number) => {
    const p = new URLSearchParams();
    Object.entries(searchParams).forEach(([k, v]) => {
      if (v && k !== "page") p.set(k, v);
    });
    if (page > 1) p.set("page", String(page));
    return `/buyer/search${p.toString() ? `?${p.toString()}` : ""}`;
  };

  return (
    <PortalShell portal="buyer" activeLabel="Search & Filters" profile={user.profile} unread={user.unread} title="TrustDrive — Search">
      <PageHeader
        eyebrow="Marketplace"
        title="Search & filters"
        subtitle={`${result.total} listing${result.total === 1 ? "" : "s"} match your filters. Every result is backed by its stored verification record.`}
      >
        <a href="/buyer/explore" className="td-btn td-btn-secondary">
          <Icon name="Compass" size={15} /> Browse
        </a>
      </PageHeader>

      <FilterPanel
        initial={{
          q: searchParams.q ?? "",
          make: searchParams.make ?? "",
          priceMin: searchParams.priceMin ?? "",
          priceMax: searchParams.priceMax ?? "",
          yearMin: searchParams.yearMin ?? "",
          yearMax: searchParams.yearMax ?? "",
          kmMax: searchParams.kmMax ?? "",
          fuel: searchParams.fuel ?? "",
          transmission: searchParams.transmission ?? "",
          category: searchParams.category ?? "",
          location: searchParams.location ?? "",
          ownershipMax: searchParams.ownershipMax ?? "",
          condition: searchParams.condition ?? "",
          verification: searchParams.verification ?? "all",
          accident: searchParams.accident ?? "all",
          trustMin: searchParams.trustMin ?? "",
          sort: searchParams.sort ?? "",
        }}
        makes={makes}
        savedSearches={savedSearches}
      />

      {result.items.length ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {result.items.map((v) => (
              <VehicleCard key={v.id} v={v} />
            ))}
          </div>
          {(result.page > 1 || result.hasMore) && (
            <div className="flex items-center justify-between">
              <span className="text-caption text-muted">
                Page {result.page} · {result.items.length} of {result.total}
              </span>
              <div className="flex gap-2">
                {result.page > 1 && (
                  <a href={pageLink(result.page - 1)} className="rounded-pill border border-border px-3.5 py-2 text-caption font-semibold text-ink hover:bg-bg">
                    Previous
                  </a>
                )}
                {result.hasMore && (
                  <a href={pageLink(result.page + 1)} className="rounded-pill bg-primary px-3.5 py-2 text-caption font-semibold text-[var(--on-primary)] hover:bg-primary-600">
                    Next
                  </a>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon="Search"
          title="No listings match"
          detail="Try removing a filter or widening the price and mileage range."
          action={
            <a href="/buyer/search" className="mt-2 rounded-pill bg-primary px-4 py-2.5 text-caption font-semibold text-[var(--on-primary)]">
              Clear all filters
            </a>
          }
        />
      )}

      <p className="text-caption text-muted">
        Filters use the same deterministic data as the vehicle reports. A missing accident/theft record means the supported sources
        returned nothing — it is not a guarantee.
      </p>
    </PortalShell>
  );
}
