"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatINR, formatKm } from "@/lib/format";
import { trustBand } from "@/lib/trust";
import { Icon } from "@/components/ui/Icon";
import { VehiclePhoto } from "@/components/ui/VehiclePhoto";

export interface SavedItem {
  id: string;
  listingId: string;
  make: string;
  model: string;
  year: number;
  km: number;
  price: number;
  trustScore: number;
  availability: string;
  priceAtSave: number;
  priceChanged: boolean;
  listName: string;
}

export function SavedGrid({ items }: { items: SavedItem[] }) {
  const router = useRouter();
  const [removed, setRemoved] = useState<string[]>([]);
  const [compare, setCompare] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const visible = items.filter((i) => !removed.includes(i.id));

  const toggleCompare = (id: string) =>
    setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < 4 ? [...c, id] : c));

  async function remove(v: SavedItem) {
    setBusy(v.id);
    const res = await fetch(`/api/v1/saved/${v.listingId}`, { method: "DELETE" });
    setBusy(null);
    if (res.ok) {
      setRemoved((r) => [...r, v.id]);
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted">
          {visible.length} saved vehicle{visible.length === 1 ? "" : "s"}
          {compare.length > 0 && ` · ${compare.length} selected`}
        </p>
        <a
          href={compare.length >= 2 ? `/buyer/compare?ids=${compare.join(",")}` : "/buyer/compare"}
          aria-disabled={compare.length < 2}
          className={
            "td-btn td-btn-sm " +
            (compare.length >= 2 ? "td-btn-primary" : "td-btn-secondary pointer-events-none opacity-50")
          }
        >
          <Icon name="GitCompare" size={14} /> Compare ({compare.length})
        </a>
      </div>

      {!visible.length && (
        <div className="card flex flex-col items-center gap-2 p-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-info-bg text-primary">
            <Icon name="Heart" size={24} />
          </span>
          <p className="text-[15px] font-semibold text-ink">No saved vehicles yet</p>
          <p className="max-w-sm text-[12.5px] text-muted">Tap the heart on any marketplace card to build a shortlist.</p>
          <a href="/buyer/explore" className="td-btn td-btn-primary td-btn-sm mt-2">
            Explore vehicles
          </a>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((v) => {
          const band = trustBand(v.trustScore);
          const available = v.availability === "Available";
          return (
            <article key={v.id} className="card card-hover overflow-hidden">
              <div className="relative">
                <a href={`/vehicle/${v.id}`} aria-label={`View ${v.make} ${v.model}`} className="block">
                  <VehiclePhoto id={v.id} make={v.make} model={v.model} year={v.year} aspect="16 / 10" rounded={0} />
                </a>
                <span className="pill absolute left-3 top-3" style={{ color: band.color, background: band.bg }}>
                  {v.trustScore}/100
                </span>
                <button
                  onClick={() => remove(v)}
                  disabled={busy === v.id}
                  className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-[var(--danger)] shadow-sm backdrop-blur transition hover:bg-white disabled:opacity-60"
                  aria-label={`Remove ${v.make} ${v.model} from saved`}
                >
                  <Icon name="Heart" size={15} className="fill-danger" />
                </button>
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-[14.5px] font-semibold text-ink">
                      {v.make} {v.model}
                    </h3>
                    <p className="text-[12px] text-muted">
                      {v.year} · {formatKm(v.km)}
                    </p>
                  </div>
                  <span className="shrink-0 text-[14px] font-bold text-ink">{formatINR(v.price)}</span>
                </div>
                {v.priceChanged && (
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-warning">
                    <Icon name="TrendingDown" size={12} /> Price changed since saved ({formatINR(v.priceAtSave)})
                  </p>
                )}
                <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5">
                  <span
                    className="pill"
                    style={
                      available
                        ? { color: "var(--success)", background: "var(--success-bg)" }
                        : { color: "var(--muted)", background: "var(--surface-tint)" }
                    }
                  >
                    {v.availability}
                  </span>
                  <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-muted">
                    <input
                      type="checkbox"
                      checked={compare.includes(v.id)}
                      onChange={() => toggleCompare(v.id)}
                      className="accent-primary"
                      aria-label={`Select ${v.make} ${v.model} for comparison`}
                    />
                    Compare
                  </label>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
