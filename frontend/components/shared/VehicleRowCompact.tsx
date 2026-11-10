"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { formatINR, formatKm } from "@/lib/format";
import { trustBand } from "@/lib/trust";
import { Icon } from "@/components/ui/Icon";
import { VehiclePhoto } from "@/components/ui/VehiclePhoto";
import type { RecommendedVehicle } from "@/lib/seed";

export function VehicleRowCompact({ v }: { v: RecommendedVehicle }) {
  const router = useRouter();
  const [saved, setSaved] = useState(v.saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const band = trustBand(v.trustScore);

  async function toggleSave(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!v.listingId || busy) return;
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
    <div className="group relative flex items-center gap-3 rounded-[12px] p-2 transition hover:bg-surface-tint">
      <a href={`/vehicle/${v.id}`} className="flex min-w-0 flex-1 items-center gap-3" aria-label={`View ${v.make} ${v.model}`}>
        <VehiclePhoto id={v.id} make={v.make} model={v.model} year={v.year} size={60} rounded={11} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13.5px] font-semibold text-ink">
              {v.make} {v.model}
            </span>
            <span className="pill shrink-0" style={{ color: band.color, background: band.bg }}>
              {v.trustScore}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[12px] text-muted">
            {v.year} · {formatKm(v.km)}
            {v.fuel ? ` · ${v.fuel}` : ""}
          </div>
          <div className="mt-1 text-[13px] font-semibold text-ink">{formatINR(v.price)}</div>
        </div>
      </a>
      {v.listingId && (
        <button
          type="button"
          aria-label={saved ? `Remove ${v.make} ${v.model} from saved` : `Save ${v.make} ${v.model}`}
          aria-pressed={saved}
          disabled={busy}
          onClick={toggleSave}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-transparent transition hover:border-border hover:bg-surface disabled:opacity-50"
          )}
          title={saved ? "Saved" : "Save vehicle"}
        >
          <Icon
            name={saved ? "Heart" : "Heart"}
            size={17}
            className={cn("transition", saved ? "fill-danger text-danger" : "text-muted")}
          />
        </button>
      )}
      {error && (
        <span className="absolute -bottom-2 left-2 right-2 truncate text-[10.5px] font-medium text-danger" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
