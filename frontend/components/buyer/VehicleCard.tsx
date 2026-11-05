"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { formatINR, formatKm } from "@/lib/format";
import { trustBand } from "@/lib/trust";
import { Icon } from "@/components/ui/Icon";
import { VehiclePhoto } from "@/components/ui/VehiclePhoto";

export interface VehicleCardView {
  id: string;
  listingId: string;
  make: string;
  model: string;
  variant?: string;
  year: number;
  km: number;
  price: number;
  fuel: string;
  transmission: string;
  location: string;
  ownershipCount?: number;
  condition?: string;
  trustScore: number;
  coverage?: number;
  band?: string;
  sellerName?: string;
  sellerType?: string;
  saved: boolean;
  findings?: number;
  hasAccident?: boolean;
}

export function VehicleCard({ v, showSave = true }: { v: VehicleCardView; showSave?: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = useState(v.saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const band = trustBand(v.trustScore);

  async function toggleSave(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/saved/${v.listingId}`, {
        method: saved ? "DELETE" : "POST",
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(json.error?.message ?? "Could not update saved vehicles.");
        return;
      }
      setSaved((s) => !s);
      startTransition(() => router.refresh());
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card card-hover group overflow-hidden">
      <div className="relative">
        <a href={`/vehicle/${v.id}`} aria-label={`View ${v.make} ${v.model}`} className="block">
          <VehiclePhoto
            make={v.make}
            model={v.model}
            year={v.year}
            aspect="16 / 10"
            rounded={0}
            className="transition-transform duration-500 group-hover:scale-[1.015]"
            imageClassName="transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </a>
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <span className="pill border-white/20 bg-[#17191B]/80 text-white backdrop-blur-sm" style={{ color: "#fff", background: "rgba(23,25,27,.78)" }}>
            <Icon name="ShieldCheck" size={12} strokeWidth={2.2} className="text-[#D6BC8A]" />
            Trust {v.trustScore}/100
          </span>
          {showSave && (
            <button
              aria-label={saved ? "Remove from saved" : "Save vehicle"}
              aria-pressed={saved}
              disabled={busy}
              onClick={toggleSave}
              className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur transition hover:bg-white disabled:opacity-60"
            >
              <Icon name="Heart" size={15} className={cn(saved ? "fill-danger text-danger" : "text-[#4B5158]")} />
            </button>
          )}
        </div>
        {v.hasAccident && (
          <span className="pill absolute bottom-3 left-3" style={{ color: "var(--danger)", background: "#FDF0EE" }}>
            <Icon name="AlertTriangle" size={12} /> Damage record
          </span>
        )}
      </div>

      <a href={`/vehicle/${v.id}`} className="block p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-[15.5px] font-semibold leading-snug text-ink">
              {v.make} {v.model}
            </h3>
            <p className="mt-0.5 truncate text-[12px] text-muted">
              {v.year}
              {v.variant ? ` · ${v.variant}` : ""} · {formatKm(v.km)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <div className="td-metric text-[17px] text-ink">{formatINR(v.price)}</div>
            <div className="mt-0.5 text-[10.5px] text-muted">asking</div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2.5 text-[11.5px] text-muted">
          <span className="inline-flex items-center gap-1">
            <Icon name="Fuel" size={12} /> {v.fuel}
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon name="Settings" size={12} /> {v.transmission}
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon name="MapPin" size={12} /> {v.location || "India"}
          </span>
        </div>

        {typeof v.findings === "number" && v.findings > 0 && (
          <p className="mt-2.5 flex items-center gap-1.5 text-[11.5px] font-medium text-warning">
            <Icon name="AlertTriangle" size={12} /> {v.findings} open finding{v.findings === 1 ? "" : "s"} — review before buying
          </p>
        )}
        {error && (
          <p className="mt-2 text-[11px] font-medium text-danger" role="alert">
            {error}
          </p>
        )}
      </a>
    </article>
  );
}
