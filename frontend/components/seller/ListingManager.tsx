"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { VehiclePhoto } from "@/components/ui/VehiclePhoto";
import { SectionCard } from "@/components/shared/SectionCard";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { formatINR, formatKm } from "@/lib/format";

export interface SellerListingRow {
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    regNo: string;
    km: number;
    price: number;
    status: string;
    trustScore: number;
    updatedAt: string;
  };
  listing: {
    id: string;
    status: string;
    headline: string;
    description: string;
    views: number;
    saves: number;
    inquiries: number;
    publishedAt: string | null;
  } | null;
  trustScore: number;
  gate: { blockers: string[]; warnings: string[]; photoCount: number; canPublish: boolean };
  photos: number;
}

const statusLabel: Record<string, string> = {
  draft: "Draft",
  pending_review: "Pending review",
  published: "Published",
  paused: "Paused",
  sold: "Sold",
};

const statusTone: Record<string, string> = {
  draft: "pending",
  pending_review: "pending",
  published: "verified",
  paused: "unavailable",
  sold: "unverified",
};

export function ListingManager({ rows, initialId }: { rows: SellerListingRow[]; initialId?: string }) {
  const router = useRouter();
  const firstId = rows.find((r) => r.vehicle.id === initialId)?.vehicle.id ?? rows[0]?.vehicle.id ?? null;
  const [selectedId, setSelectedId] = useState(firstId);
  const row = useMemo(() => rows.find((r) => r.vehicle.id === selectedId) ?? null, [rows, selectedId]);
  const [form, setForm] = useState({
    headline: row?.listing?.headline ?? "",
    description: row?.listing?.description ?? "",
    condition: "Good",
    location: "",
    price: String(row?.vehicle.price ?? ""),
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  function select(id: string) {
    const next = rows.find((r) => r.vehicle.id === id);
    setSelectedId(id);
    setError(null);
    setInfo(null);
    if (next) {
      setForm({
        headline: next.listing?.headline ?? "",
        description: next.listing?.description ?? "",
        condition: "Good",
        location: "",
        price: String(next.vehicle.price ?? ""),
      });
    }
  }

  async function saveDraft() {
    if (!row) return;
    setBusy("save");
    setError(null);
    setInfo(null);
    const res = await fetch("/api/v1/seller/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleId: row.vehicle.id,
        headline: form.headline || undefined,
        description: form.description || undefined,
        condition: form.condition || undefined,
        location: form.location || undefined,
        price: form.price ? Number(form.price) : undefined,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: { id: string; created: boolean }; error?: { message?: string } };
    setBusy(null);
    if (!res.ok) {
      setError(json.error?.message ?? "Could not save the listing.");
      return;
    }
    setInfo(json.data?.created ? "Listing draft created." : "Listing updated.");
    router.refresh();
  }

  async function action(kind: string) {
    if (!row?.listing) {
      setError("Create the listing draft first.");
      return;
    }
    setBusy(kind);
    setError(null);
    setInfo(null);
    const res = await fetch(`/api/v1/seller/listings/${row.listing.id}/${kind}`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as { data?: { description?: string; status?: string }; error?: { message?: string } };
    setBusy(null);
    if (!res.ok) {
      setError(json.error?.message ?? `Could not ${kind.replace(/-/g, " ")}.`);
      return;
    }
    if (kind === "generate-description" && json.data?.description) {
      setForm((f) => ({ ...f, description: json.data!.description! }));
      setInfo("Suggestion generated from verified records. Edit before saving.");
      return;
    }
    setInfo(`Listing ${kind.replace(/-/g, " ")} completed.`);
    router.refresh();
  }

  async function uploadPhotos() {
    if (!row) return;
    const files = photoRef.current?.files;
    if (!files?.length) {
      setError("Choose at least one photo.");
      return;
    }
    setBusy("photos");
    setError(null);
    setInfo(null);
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    const res = await fetch(`/api/v1/vehicles/${row.vehicle.id}/photos`, { method: "POST", body: fd });
    const json = (await res.json().catch(() => ({}))) as { data?: { uploaded: number }; error?: { message?: string } };
    setBusy(null);
    if (!res.ok) {
      setError(json.error?.message ?? "Photo upload failed.");
      return;
    }
    setInfo(`${json.data?.uploaded ?? 0} photo(s) uploaded.`);
    if (photoRef.current) photoRef.current.value = "";
    router.refresh();
  }

  if (!rows.length) {
    return (
      <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
        <Icon name="Store" size={26} className="text-muted" />
        <p className="text-[14px] font-semibold text-ink">No vehicles to list</p>
        <p className="max-w-sm text-[12.5px] text-muted">Add a vehicle first, then create a marketplace listing.</p>
        <a href="/seller/add-vehicle" className="td-btn td-btn-primary mt-2">
          Add a vehicle
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 rounded-[14px] border border-border bg-surface p-2.5">
        {rows.map((r) => (
          <button
            key={r.vehicle.id}
            onClick={() => select(r.vehicle.id)}
            aria-pressed={selectedId === r.vehicle.id}
            className={cn(
              "flex items-center gap-2 rounded-[10px] border px-2.5 py-1.5 text-left transition",
              selectedId === r.vehicle.id
                ? "border-primary/45 bg-info-bg"
                : "border-transparent bg-surface-tint hover:border-border"
            )}
          >
            <VehiclePhoto id={r.vehicle.id} make={r.vehicle.make} model={r.vehicle.model} year={r.vehicle.year} size={26} rounded={6} />
            <span className="text-[11.5px] font-semibold text-ink">
              {r.vehicle.make} {r.vehicle.model}
            </span>
            <StatusBadge status={statusTone[r.listing?.status ?? "draft"]} label={statusLabel[r.listing?.status ?? "draft"]} />
          </button>
        ))}
      </div>

      {(error || info) && (
        <div className="space-y-2" aria-live="polite">
          {error && <InlineAlert tone="danger" title="Action failed" detail={error} />}
          {info && <InlineAlert tone="success" title="Saved" detail={info} />}
        </div>
      )}

      {row && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
          <SectionCard
            title={`${row.vehicle.make} ${row.vehicle.model} · ${row.vehicle.year}`}
            description={`${row.vehicle.regNo} · ${formatKm(row.vehicle.km)} · Trust ${row.trustScore}/100`}
            action={
              <StatusBadge status={statusTone[row.listing?.status ?? "draft"]} label={statusLabel[row.listing?.status ?? "draft"]} />
            }
          >
            <div className="space-y-3.5">
              <label className="block">
                <span className="td-label">Headline</span>
                <input
                  value={form.headline}
                  onChange={(e) => setForm({ ...form, headline: e.target.value })}
                  placeholder="e.g. Single-owner 2021 BMW 3 Series, full service history"
                  className="td-input"
                />
              </label>

              <label className="block">
                <span className="flex items-center justify-between gap-2">
                  <span className="td-label">Description</span>
                  <button
                    onClick={() => action("generate-description")}
                    disabled={busy === "generate-description" || !row.listing}
                    className="td-btn td-btn-ghost td-btn-sm -mt-1"
                  >
                    <Icon name={busy === "generate-description" ? "Loader2" : "Sparkles"} size={12} className={busy === "generate-description" ? "animate-spin" : ""} />
                    Generate with AI
                  </button>
                </span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={5}
                  placeholder="Describe the vehicle using only verifiable facts."
                  className="td-textarea"
                />
                <span className="td-help mt-1 block">The suggestion is deterministic and based on verified records. Review and edit it before saving.</span>
              </label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="td-label">Price (₹)</span>
                  <input
                    type="number"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className="td-input"
                  />
                </label>
                <label className="block">
                  <span className="td-label">Condition</span>
                  <select
                    value={form.condition}
                    onChange={(e) => setForm({ ...form, condition: e.target.value })}
                    className="td-input td-select"
                  >
                    {["Excellent", "Good", "Fair", "Needs work"].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="td-label">Location</span>
                  <input
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="Mumbai"
                    className="td-input"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3.5">
                <button onClick={saveDraft} disabled={busy === "save"} className="td-btn td-btn-primary">
                  {busy === "save" ? (
                    <>
                      <Icon name="Loader2" size={14} className="animate-spin" /> Saving…
                    </>
                  ) : (
                    <>
                      <Icon name="Check" size={14} /> {row.listing ? "Save listing" : "Create draft"}
                    </>
                  )}
                </button>
                <a href={`/vehicle/${row.vehicle.id}`} target="_blank" rel="noreferrer" className="td-btn td-btn-secondary">
                  <Icon name="Eye" size={14} /> Preview as buyer
                </a>
                {row.listing && (
                  <a href={`/seller/listings/${row.listing.id}`} className="td-btn td-btn-ghost">
                    <Icon name="PenLine" size={14} /> Manage listing
                  </a>
                )}
              </div>
            </div>
          </SectionCard>

          <div className="space-y-4">
            <SectionCard title="Publish readiness" description="Blockers must be cleared before the listing can go live.">
              <div className="flex items-center justify-between rounded-[10px] border border-border bg-surface-tint px-3 py-2 text-[12px]">
                <span className="text-muted">Photos</span>
                <span className="font-semibold text-ink">{row.gate.photoCount} / 3 minimum</span>
              </div>

              {row.gate.blockers.length > 0 ? (
                <div className="mt-3 rounded-[10px] border border-danger/25 bg-danger-bg p-3">
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-danger">
                    <Icon name="ShieldAlert" size={13} /> Blockers
                  </div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] text-danger">
                    {row.gate.blockers.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-1.5 rounded-[10px] border border-success/25 bg-success-bg p-3 text-[12px] font-semibold text-success">
                  <Icon name="CheckCircle2" size={13} /> No blockers — this listing can be published.
                </div>
              )}

              {row.gate.warnings.length > 0 && (
                <div className="mt-3 rounded-[10px] border border-warning/30 bg-warning-bg p-3">
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-warning">
                    <Icon name="AlertTriangle" size={13} /> Warnings
                  </div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] text-ink">
                    {row.gate.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-1.5">
                <button onClick={() => action("publish")} disabled={busy !== null || !row.listing} className="td-btn td-btn-primary td-btn-sm">
                  Publish
                </button>
                <button onClick={() => action("pause")} disabled={busy !== null || !row.listing} className="td-btn td-btn-secondary td-btn-sm">
                  Pause
                </button>
                <button onClick={() => action("unpublish")} disabled={busy !== null || !row.listing} className="td-btn td-btn-secondary td-btn-sm">
                  Unpublish
                </button>
                <button onClick={() => action("sold")} disabled={busy !== null || !row.listing} className="td-btn td-btn-secondary td-btn-sm">
                  Mark sold
                </button>
              </div>
            </SectionCard>

            <SectionCard title="Photos" description={`${row.photos} uploaded. At least 3 photos are required before publishing.`}>
              <input
                ref={photoRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                suppressHydrationWarning
                className="td-input block cursor-pointer py-2 text-[12px] file:mr-3 file:rounded-[8px] file:border-0 file:bg-info-bg file:px-3 file:py-1.5 file:text-[11.5px] file:font-semibold file:text-ink"
              />
              <button onClick={uploadPhotos} disabled={busy === "photos" || !row.listing} className="td-btn td-btn-secondary mt-2.5 w-full">
                {busy === "photos" ? (
                  <>
                    <Icon name="Loader2" size={14} className="animate-spin" /> Uploading…
                  </>
                ) : (
                  <>
                    <Icon name="ImagePlus" size={14} /> Upload photos
                  </>
                )}
              </button>
            </SectionCard>

            {row.listing && (
              <SectionCard title="Performance" description={row.listing.publishedAt ? `Published ${new Date(row.listing.publishedAt).toLocaleDateString("en-IN")}` : "Not published yet."}>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-[10px] border border-border bg-surface-tint px-2 py-2.5">
                    <div className="text-[20px] font-bold leading-none text-ink">{row.listing.views}</div>
                    <div className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">Views</div>
                  </div>
                  <div className="rounded-[10px] border border-border bg-surface-tint px-2 py-2.5">
                    <div className="text-[20px] font-bold leading-none text-ink">{row.listing.saves}</div>
                    <div className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">Saves</div>
                  </div>
                  <div className="rounded-[10px] border border-border bg-surface-tint px-2 py-2.5">
                    <div className="text-[20px] font-bold leading-none text-ink">{row.listing.inquiries}</div>
                    <div className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">Inquiries</div>
                  </div>
                </div>
                {row.listing.status === "published" && (
                  <p className="td-help mt-2.5">Asking price {formatINR(Number(form.price) || 0)}</p>
                )}
              </SectionCard>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
