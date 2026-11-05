"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StatCard } from "@/components/ui/StatCard";
import { VehiclePhoto } from "@/components/ui/VehiclePhoto";
import { SectionCard } from "@/components/shared/SectionCard";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { formatINR, formatKm } from "@/lib/format";

export interface SellerVehicleRow {
  id: string;
  make: string;
  model: string;
  variant: string;
  year: number;
  regNo: string;
  vin: string;
  km: number;
  price: number;
  fuel: string;
  transmission: string;
  location: string;
  status: string;
  trustScore: number;
  band: string;
  coverage: number;
  listingStatus: string;
  listingId: string | null;
  findings: number;
  photos: number;
  updatedAt: string;
}

const statusLabel: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  sold: "Sold",
  archived: "Archived",
  paused: "Paused",
  pending_review: "Pending review",
};

export function VehicleManager({ vehicles }: { vehicles: SellerVehicleRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const published = vehicles.filter((v) => v.listingStatus === "published").length;
  const needsAttention = vehicles.filter((v) => v.findings > 0 || v.coverage < 90).length;

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return vehicles.filter((v) => {
      const matchQ = !query || `${v.make} ${v.model} ${v.variant} ${v.regNo} ${v.vin}`.toLowerCase().includes(query);
      const matchS = status === "all" || v.status === status || v.listingStatus === status;
      return matchQ && matchS;
    });
  }, [vehicles, q, status]);

  async function archive(v: SellerVehicleRow) {
    if (!window.confirm(`Archive ${v.make} ${v.model}? It will be hidden from the marketplace.`)) return;
    setBusy(v.id);
    setError(null);
    const res = await fetch(`/api/v1/seller/vehicles/${v.id}/archive`, { method: "POST" });
    setBusy(null);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      setError(json.error?.message ?? "Could not archive the vehicle.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon="Car" label="Vehicles" value={vehicles.length} hint="In your garage" tone="gold" />
        <StatCard icon="Store" label="Published" value={published} hint="Visible to buyers" tone="success" />
        <StatCard icon="AlertTriangle" label="Need attention" value={needsAttention} hint="Open findings or low coverage" tone="warning" />
        <StatCard icon="Images" label="Photos" value={vehicles.reduce((n, v) => n + v.photos, 0)} hint="Across all vehicles" tone="neutral" />
      </div>

      <SectionCard flush>
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <div className="relative min-w-[220px] flex-1">
            <Icon name="Search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by reg no, VIN, make or model…"
              aria-label="Search vehicles"
              className="td-input pl-9"
            />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status" className="td-input td-select w-auto min-w-[150px]">
            <option value="all">All statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="paused">Paused</option>
            <option value="sold">Sold</option>
            <option value="archived">Archived</option>
          </select>
          <span className="td-chip">{rows.length} shown</span>
        </div>

        {error && (
          <div className="border-b border-border p-3">
            <InlineAlert tone="danger" title="Could not archive the vehicle" detail={error} />
          </div>
        )}

        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-tint text-primary">
              <Icon name="CarFront" size={22} />
            </span>
            <p className="text-[14px] font-semibold text-ink">No vehicles match this filter</p>
            <p className="text-[12.5px] text-muted">Try a different search term or status.</p>
          </div>
        ) : (
          <div className="td-scroll overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 font-semibold">Vehicle</th>
                  <th className="px-4 py-3 font-semibold">Mileage</th>
                  <th className="px-4 py-3 font-semibold">Price</th>
                  <th className="px-4 py-3 font-semibold">Coverage</th>
                  <th className="px-4 py-3 font-semibold">Trust</th>
                  <th className="px-4 py-3 font-semibold">Listing</th>
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.id} className="border-b border-border/70 align-middle transition-colors last:border-0 hover:bg-surface-tint/60">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <VehiclePhoto make={v.make} model={v.model} year={v.year} size={44} rounded={9} />
                        <div className="min-w-0">
                          <div className="truncate text-[13.5px] font-semibold text-ink">
                            {v.make} {v.model} {v.variant}
                          </div>
                          <div className="text-[11.5px] text-muted">
                            {v.year} · {v.regNo} · {v.fuel}
                          </div>
                          <div className="text-[11px] text-muted">
                            {v.photos} photo{v.photos === 1 ? "" : "s"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-[13px] text-ink">{formatKm(v.km)}</td>
                    <td className="px-4 py-3.5 text-[13px] font-semibold text-ink">{formatINR(v.price)}</td>
                    <td className="px-4 py-3.5">
                      <span
                        className="pill"
                        style={{
                          color: v.coverage >= 90 ? "var(--success)" : "var(--warning)",
                          background: v.coverage >= 90 ? "var(--success-bg)" : "var(--warning-bg)",
                        }}
                      >
                        {v.coverage}%
                      </span>
                      {v.findings > 0 && <div className="mt-1 text-[11px] font-semibold text-warning">{v.findings} finding(s)</div>}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className="pill"
                        style={{
                          color: v.trustScore >= 65 ? "var(--success)" : v.trustScore >= 40 ? "var(--warning)" : "var(--danger)",
                          background: v.trustScore >= 65 ? "var(--success-bg)" : v.trustScore >= 40 ? "var(--warning-bg)" : "var(--danger-bg)",
                        }}
                      >
                        {v.trustScore}/100
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge
                        status={v.listingStatus === "published" ? "verified" : v.listingStatus === "sold" ? "unverified" : "pending"}
                        label={statusLabel[v.listingStatus] ?? v.listingStatus}
                      />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-0.5">
                        <a href={`/seller/vehicles/${v.id}`} aria-label="View vehicle" title="View" className="flex h-8 w-8 items-center justify-center rounded-[8px] text-muted transition hover:bg-surface-tint hover:text-ink">
                          <Icon name="Eye" size={16} />
                        </a>
                        <a href={`/seller/history?vehicle=${v.id}`} aria-label="History" title="History" className="flex h-8 w-8 items-center justify-center rounded-[8px] text-muted transition hover:bg-surface-tint hover:text-ink">
                          <Icon name="History" size={16} />
                        </a>
                        <a href={`/seller/documents?vehicle=${v.id}`} aria-label="Documents" title="Documents" className="flex h-8 w-8 items-center justify-center rounded-[8px] text-muted transition hover:bg-surface-tint hover:text-ink">
                          <Icon name="FolderOpen" size={16} />
                        </a>
                        <a href={`/seller/listings?vehicle=${v.id}`} aria-label="Listing" title="Listing" className="flex h-8 w-8 items-center justify-center rounded-[8px] text-muted transition hover:bg-surface-tint hover:text-ink">
                          <Icon name="Store" size={16} />
                        </a>
                        <button
                          onClick={() => archive(v)}
                          disabled={busy === v.id || v.status === "archived"}
                          aria-label="Archive vehicle"
                          title="Archive"
                          className="flex h-8 w-8 items-center justify-center rounded-[8px] text-danger transition hover:bg-danger-bg disabled:opacity-30"
                        >
                          <Icon name={busy === v.id ? "Loader2" : "Trash2"} size={16} className={busy === v.id ? "animate-spin" : ""} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <p className="td-help">
        Duplicate registration numbers and VINs are rejected with a link to the existing record. Archived vehicles keep their verified
        records for audit.
      </p>
    </div>
  );
}
