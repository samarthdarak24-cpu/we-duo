"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AiAssistant } from "@/components/shared/AiAssistant";
import { ListingActionBar } from "@/components/seller/ListingActionBar";
import { SectionCard } from "@/components/shared/SectionCard";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { AiDamageScan } from "@/components/seller/AiDamageScan";
import { cn } from "@/lib/cn";
import { formatINR, formatKm } from "@/lib/format";

interface Photo {
  id: string;
  position: number;
  key: string;
  url: string;
}

export interface ListingDetailData {
  listing: {
    id: string;
    vehicleId: string;
    status: string;
    headline: string;
    description: string;
    condition: string;
    location: string;
    views: number;
    saves: number;
    inquiries: number;
    coverImage: string | null;
    publishedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  vehicle: {
    id: string;
    make: string;
    model: string;
    year: number;
    regNo: string;
    km: number;
    askingPrice: number;
    trustScore?: number;
    color?: string;
    ownershipCount?: number;
    vin?: string | null;
    trustdriveId?: string;
  };
  trust: { trustScore: number; bandLabel: string; evidenceCoverage: number };
  gate: { blockers: string[]; warnings: string[]; photoCount: number; canPublish: boolean };
  photos: Photo[];
  events: { id: string; type: string; actorId: string | null; createdAt: string }[];
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

export function ListingDetailEditor({ detail }: { detail: ListingDetailData }) {
  const router = useRouter();
  const { listing, vehicle, trust, gate } = detail;
  const [form, setForm] = useState({
    headline: listing.headline,
    description: listing.description,
    condition: listing.condition || "Good",
    location: listing.location || "",
    price: String(vehicle.askingPrice || ""),
  });
  const [photos, setPhotos] = useState<Photo[]>(detail.photos);
  const [cover, setCover] = useState<string | null>(listing.coverImage);
  const [scanPhotoId, setScanPhotoId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  function focusField(ref: { current: HTMLInputElement | HTMLTextAreaElement | null }, openPicker = false) {
    const el = ref.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    if (openPicker) el.click();
    else el.focus({ preventScroll: true });
  }

  async function save() {
    setBusy("save");
    setError(null);
    setInfo(null);
    const res = await fetch(`/api/v1/seller/listings/${listing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        headline: form.headline,
        description: form.description,
        condition: form.condition,
        location: form.location,
        price: form.price ? Number(form.price) : undefined,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    setBusy(null);
    if (!res.ok) {
      setError(json.error?.message ?? "Could not save the listing.");
      return;
    }
    setInfo("Listing saved.");
    router.refresh();
  }

  async function action(kind: "publish" | "pause" | "unpublish" | "sold" | "pending_review" | "generate-description") {
    setBusy(kind);
    setError(null);
    setInfo(null);
    const res = await fetch(`/api/v1/seller/listings/${listing.id}/${kind}`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as { data?: { description?: string; status?: string }; error?: { message?: string } };
    setBusy(null);
    if (!res.ok) {
      setError(json.error?.message ?? `Could not ${kind.replace(/-/g, " ")}.`);
      return;
    }
    if (kind === "generate-description" && json.data?.description) {
      setForm((f) => ({ ...f, description: json.data!.description! }));
      setInfo("Draft generated from verified records. Review before saving.");
      return;
    }
    setInfo(`${statusLabel[json.data?.status ?? ""] ?? kind.replace(/-/g, " ")}.`);
    router.refresh();
  }

  async function uploadPhotos() {
    const files = fileRef.current?.files;
    if (!files?.length) return;
    setBusy("photos");
    setError(null);
    setInfo(null);
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    const res = await fetch(`/api/v1/vehicles/${vehicle.id}/photos`, { method: "POST", body: fd });
    const json = (await res.json().catch(() => ({}))) as { data?: { images: Photo[] }; error?: { message?: string } };
    setBusy(null);
    if (!res.ok) {
      setError(json.error?.message ?? "Upload failed.");
      return;
    }
    if (json.data?.images) setPhotos(json.data.images);
    if (fileRef.current) fileRef.current.value = "";
    setInfo("Photos uploaded.");
    router.refresh();
  }

  async function patchPhotos(body: { cover?: string; order?: string[] }) {
    setBusy("photos-edit");
    const res = await fetch(`/api/v1/vehicles/${vehicle.id}/photos`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: { images: Photo[]; cover: string | null }; error?: { message?: string } };
    setBusy(null);
    if (!res.ok) {
      setError(json.error?.message ?? "Could not update photos.");
      return;
    }
    if (json.data?.images) setPhotos(json.data.images);
    if (json.data) setCover(json.data.cover);
    router.refresh();
  }

  async function removePhoto(id: string) {
    setBusy(id);
    const res = await fetch(`/api/v1/vehicles/${vehicle.id}/photos?imageId=${encodeURIComponent(id)}`, { method: "DELETE" });
    const json = (await res.json().catch(() => ({}))) as { data?: { images: Photo[] }; error?: { message?: string } };
    setBusy(null);
    if (!res.ok) {
      setError(json.error?.message ?? "Could not remove the photo.");
      return;
    }
    if (json.data?.images) setPhotos(json.data.images);
    router.refresh();
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...photos];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setPhotos(next);
    patchPhotos({ order: next.map((p) => p.id) });
  }

  const coverPhoto = photos.find((p) => p.key === cover) ?? photos[0];

  return (
    <div className="td-page">
      {error && (
        <InlineAlert tone="danger" title="That didn’t work" detail={error} />
      )}
      {info && <InlineAlert tone="success" title={info} />}

      <ListingActionBar
        vehicleId={vehicle.id}
        listingId={listing.id}
        vehicleLabel={`${vehicle.make} ${vehicle.model} · ${vehicle.regNo}`}
        onAddPhotos={() => focusField(fileRef, true)}
        onSetPrice={() => focusField(priceRef)}
        onWriteDescription={() => void action("generate-description")}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          {/* Cover hero */}
          <section className="card overflow-hidden">
            <div className="relative h-60 bg-[#17191B] sm:h-72">
              {coverPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverPhoto.url}
                  alt={`${vehicle.make} ${vehicle.model}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-white/55">
                  <Icon name="ImagePlus" size={30} />
                  <p className="text-[13px]">No photos yet — at least 3 are required to publish.</p>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#111315] via-[#111315]/45 to-transparent" />
              <div className="absolute left-4 top-4 flex flex-wrap items-center gap-1.5">
                <StatusBadge status={statusTone[listing.status] ?? "pending"} label={statusLabel[listing.status] ?? listing.status} />
                <span className="pill border-white/15 bg-black/55 text-white backdrop-blur">
                  <Icon name="ShieldCheck" size={12} /> Trust {trust.trustScore}/100
                </span>
              </div>
              <div className="absolute inset-x-4 bottom-4 flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="font-display text-[26px] font-bold leading-tight tracking-tight text-white">
                    {vehicle.make} {vehicle.model}
                    <span className="ml-2 text-[18px] font-semibold text-white/55">{vehicle.year}</span>
                  </h1>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-medium text-white/70">
                    <span className="inline-flex items-center gap-1">
                      <Icon name="Hash" size={11} /> {vehicle.regNo}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Icon name="Gauge" size={11} /> {formatKm(vehicle.km)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Icon name="MapPin" size={11} /> {listing.location || "Location not set"}
                    </span>
                  </div>
                </div>
                <a
                  href={`/vehicle/${vehicle.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-white/20 bg-black/40 px-3 text-[12.5px] font-semibold text-white backdrop-blur transition hover:bg-black/60"
                >
                  Preview as buyer <Icon name="ArrowUpRight" size={13} />
                </a>
              </div>
            </div>

            <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
              {[
                { label: "Views", value: listing.views, icon: "Eye" },
                { label: "Saves", value: listing.saves, icon: "Heart" },
                { label: "Inquiries", value: listing.inquiries, icon: "MessageSquare" },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-3 px-5 py-3.5">
                  <Icon name={s.icon} size={15} className="text-muted" />
                  <div className="min-w-0">
                    <div className="text-[20px] font-bold leading-none text-ink td-metric">{s.value}</div>
                    <div className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-5 p-5">
              <div>
                <label htmlFor="listing-headline" className="td-label flex items-center justify-between">
                  <span>Headline</span>
                  <span className="text-[11px] font-normal text-muted">{form.headline.length}/140</span>
                </label>
                <input
                  id="listing-headline"
                  value={form.headline}
                  maxLength={140}
                  onChange={(e) => setForm({ ...form, headline: e.target.value })}
                  className="td-input"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label htmlFor="listing-description" className="td-label mb-0">
                    Description
                  </label>
                  <button
                    onClick={() => action("generate-description")}
                    disabled={busy !== null}
                    className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-[var(--info-bg)] px-2.5 text-[11px] font-semibold text-primary transition hover:brightness-95 disabled:opacity-40"
                    style={{ borderColor: "color-mix(in srgb, var(--primary) 32%, transparent)" }}
                  >
                    <Icon name="Sparkles" size={11} /> Generate with AI
                  </button>
                </div>
                <textarea
                  id="listing-description"
                  ref={descRef}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={6}
                  className="td-textarea"
                  placeholder="Describe condition, service history and what a buyer should know."
                />
                <p className="td-help mt-1.5">
                  Generated copy uses verified records only. Review it before saving.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="listing-price" className="td-label">
                    Price (₹)
                  </label>
                  <input
                    id="listing-price"
                    ref={priceRef}
                    type="number"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className="td-input"
                  />
                  <p className="td-help mt-1.5">Shown as {formatINR(Number(form.price) || 0)}</p>
                </div>
                <div>
                  <label htmlFor="listing-condition" className="td-label">
                    Condition
                  </label>
                  <select
                    id="listing-condition"
                    value={form.condition}
                    onChange={(e) => setForm({ ...form, condition: e.target.value })}
                    className={cn("td-input td-select")}
                  >
                    {["Excellent", "Good", "Fair", "Needs work"].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="listing-location" className="td-label">
                    Location
                  </label>
                  <input
                    id="listing-location"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="Mumbai"
                    className="td-input"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <button onClick={save} disabled={busy === "save"} className="td-btn td-btn-primary">
                  {busy === "save" ? "Saving…" : "Save changes"}
                </button>
                <button
                  onClick={() => action("publish")}
                  disabled={busy !== null || listing.status === "sold"}
                  className="td-btn td-btn-secondary"
                  style={{ color: "var(--success)" }}
                >
                  <Icon name="Upload" size={14} /> Publish
                </button>
                <button
                  onClick={() => action("pause")}
                  disabled={busy !== null || listing.status === "sold"}
                  className="td-btn td-btn-ghost"
                >
                  Pause
                </button>
                <button
                  onClick={() => action("unpublish")}
                  disabled={busy !== null || listing.status === "sold"}
                  className="td-btn td-btn-ghost"
                >
                  Unpublish
                </button>
                <button
                  onClick={() => action("sold")}
                  disabled={busy !== null || listing.status === "sold"}
                  className="td-btn td-btn-ghost ml-auto"
                  style={{ color: "var(--danger)" }}
                >
                  Mark sold
                </button>
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-5">
          <SectionCard
            title="Publish readiness"
            description="Checks run against the live listing record."
            action={
              <span
                className={cn("td-chip", gate.canPublish ? "text-success" : "text-warning")}
                style={{
                  color: gate.canPublish ? "var(--success)" : "var(--warning)",
                  background: gate.canPublish ? "var(--success-bg)" : "var(--warning-bg)",
                }}
              >
                <Icon name={gate.canPublish ? "CheckCircle2" : "AlertTriangle"} size={12} />
                {gate.canPublish ? "Ready" : `${gate.blockers.length} blocker${gate.blockers.length === 1 ? "" : "s"}`}
              </span>
            }
          >
            <div className="space-y-4">
              <div className="divide-y divide-border overflow-hidden rounded-[12px] border border-border">
                <div className="flex items-center justify-between px-3.5 py-2.5 text-[12.5px]">
                  <span className="text-muted">Photos</span>
                  <span className="font-semibold text-ink td-metric">{gate.photoCount} / 3 minimum</span>
                </div>
                <div className="flex items-center justify-between px-3.5 py-2.5 text-[12.5px]">
                  <span className="text-muted">Evidence coverage</span>
                  <span className="font-semibold text-ink td-metric">{trust.evidenceCoverage}%</span>
                </div>
                <div className="flex items-center justify-between px-3.5 py-2.5 text-[12.5px]">
                  <span className="text-muted">Trust band</span>
                  <span className="font-semibold text-ink">{trust.bandLabel}</span>
                </div>
              </div>

              {!!gate.blockers.length && (
                <InlineAlert
                  tone="danger"
                  title={`${gate.blockers.length} blocker${gate.blockers.length === 1 ? "" : "s"} before publishing`}
                  detail={gate.blockers.join(" · ")}
                />
              )}
              {!!gate.warnings.length && (
                <InlineAlert tone="warning" title="Worth reviewing" detail={gate.warnings.join(" · ")} />
              )}

              <p className="td-help">
                Published {listing.publishedAt ? new Date(listing.publishedAt).toLocaleDateString("en-IN") : "never"} · updated{" "}
                {new Date(listing.updatedAt).toLocaleString("en-IN")}
              </p>
            </div>
          </SectionCard>

          <SectionCard
            title="Gallery"
            description="The first photo becomes the buyer-facing cover."
            action={<span className="text-[11.5px] font-semibold text-muted">{photos.length}/20</span>}
          >
            <div className="space-y-4">
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp"
                aria-label="Listing photos"
                suppressHydrationWarning
                className="block w-full cursor-pointer text-[12px] text-muted file:mr-3 file:cursor-pointer file:rounded-[9px] file:border-0 file:bg-surface-tint file:px-3 file:py-2 file:text-[12px] file:font-semibold file:text-ink"
              />
              <button
                onClick={uploadPhotos}
                disabled={busy === "photos"}
                className="td-btn td-btn-secondary w-full"
              >
                <Icon name="ImagePlus" size={14} />
                {busy === "photos" ? "Uploading…" : "Upload photos"}
              </button>

              {photos.length > 0 ? (
                <div className="grid grid-cols-2 gap-2.5">
                  {photos.map((p, i) => (
                    <div key={p.id} className="group relative overflow-hidden rounded-[12px] border border-border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" className="h-24 w-full object-cover" />
                      {p.key === cover && (
                        <span className="absolute left-1.5 top-1.5 rounded-full bg-[var(--primary)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--on-primary)]">
                          Cover
                        </span>
                      )}
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/65 p-1.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                        <div className="flex gap-1">
                          <button
                            onClick={() => move(i, -1)}
                            aria-label="Move left"
                            className="rounded-[5px] bg-white/10 p-1 text-white hover:bg-white/25"
                          >
                            <Icon name="ChevronRight" size={11} className="rotate-180" />
                          </button>
                          <button
                            onClick={() => move(i, 1)}
                            aria-label="Move right"
                            className="rounded-[5px] bg-white/10 p-1 text-white hover:bg-white/25"
                          >
                            <Icon name="ChevronRight" size={11} />
                          </button>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => patchPhotos({ cover: p.id })}
                            aria-label="Set cover"
                            className="rounded-[5px] bg-[var(--primary)] p-1 text-[var(--on-primary)] hover:brightness-110"
                          >
                            <Icon name="Star" size={11} />
                          </button>
                          <button
                            onClick={() => removePhoto(p.id)}
                            aria-label="Remove photo"
                            className="rounded-[5px] bg-[var(--danger)] p-1 text-white hover:brightness-110"
                          >
                            <Icon name="Trash2" size={11} />
                          </button>
                          <button
                            onClick={() => setScanPhotoId((id) => (id === p.id ? null : p.id))}
                            aria-label="Run AI damage scan"
                            title="Run AI damage scan"
                            className="rounded-[5px] bg-[var(--primary)] p-1 text-[var(--on-primary)] hover:brightness-110"
                          >
                            <Icon name="ScanSearch" size={11} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[12px] border border-dashed border-border bg-surface-tint px-4 py-8 text-center">
                  <Icon name="ImagePlus" size={22} className="mx-auto text-muted" />
                  <p className="mt-2 text-[12.5px] text-muted">No photos uploaded yet.</p>
                </div>
              )}

              {scanPhotoId && (
                <AiDamageScan
                  vehicleId={vehicle.id}
                  photoId={scanPhotoId}
                  onReviewed={() => router.refresh()}
                />
              )}
            </div>
          </SectionCard>

          <SectionCard title="Listing activity" description="Most recent events on this listing.">
            {detail.events.length ? (
              <ol className="space-y-3">
                {detail.events.slice(0, 6).map((e, i) => (
                  <li key={e.id} className="flex items-start gap-2.5">
                    <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center">
                      <span className={cn("h-1.5 w-1.5 rounded-full", i === 0 ? "bg-[var(--primary)]" : "bg-border")} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-semibold capitalize leading-snug text-ink">
                        {e.type.replace(/_/g, " ")}
                      </p>
                      <p className="text-[11px] text-muted">
                        {new Date(e.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="rounded-[12px] bg-surface-tint px-4 py-6 text-center text-[12.5px] text-muted">
                No listing events yet.
              </p>
            )}
          </SectionCard>
        </div>
      </div>

      <AiAssistant vehicleId={vehicle.id} vehicleLabel={`${vehicle.make} ${vehicle.model}`} />
    </div>
  );
}
