import type { Metadata } from "next";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { CompareBuilder, type CompareOption } from "@/components/buyer/CompareBuilder";
import { Icon } from "@/components/ui/Icon";
import { portalUser } from "@/lib/server/page";
import { getCompareVehicles, getMarketplace, getSavedVehicles } from "@/lib/server/data";

export const metadata: Metadata = { title: "Compare Vehicles — TrustDrive" };
export const dynamic = "force-dynamic";

export default function ComparePage({ searchParams }: { searchParams: { ids?: string } }) {
  const user = portalUser("buyer")!;
  const saved = getSavedVehicles(user.id);
  const market = getMarketplace({ pageSize: 24 }, user.id).items;

  const optionMap = new Map<string, CompareOption>();
  for (const s of saved) optionMap.set(s.id, { id: s.id, name: `${s.make} ${s.model}`, price: s.price, trustScore: s.trustScore });
  for (const m of market) {
    if (!optionMap.has(m.id)) optionMap.set(m.id, { id: m.id, name: `${m.make} ${m.model}`, price: m.price, trustScore: m.trustScore });
  }
  const options = Array.from(optionMap.values());

  const requested = (searchParams.ids?.split(",").filter(Boolean) ?? []).slice(0, 4);
  const defaults = saved.slice(0, 3).map((s) => s.id);
  const ids = requested.length ? requested : defaults.length >= 2 ? defaults : market.slice(0, 3).map((m) => m.id);

  const { rows, differences } = getCompareVehicles(ids, user.id);

  return (
    <PortalShell portal="buyer" activeLabel="Compare Vehicles" profile={user.profile} unread={user.unread} title="TrustDrive — Compare Vehicles">
      <PageHeader
        eyebrow="Decision support"
        title="Compare vehicles"
        subtitle="Side-by-side facts from verified records, with a deterministic key-differences summary."
      >
        <a href="/buyer/explore" className="td-btn td-btn-secondary">
          <Icon name="Compass" size={15} /> Add from marketplace
        </a>
      </PageHeader>
      <CompareBuilder selected={ids} options={options} rows={rows} differences={differences} />
    </PortalShell>
  );
}
