"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Timeline } from "@/components/ui/Timeline";
import { SectionCard } from "@/components/shared/SectionCard";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { formatKm } from "@/lib/format";

export interface HistoryEventRow {
  id: string;
  category: string;
  event_date: string;
  mileage_km: number;
  title: string;
  description: string;
  source: string;
  status: string;
  supersedes_id: string | null;
}

export interface MileageRow {
  id: string;
  year: string;
  km: number;
  source: string;
  date: string;
  flagged: boolean;
  verified: boolean;
  sellerClaim: boolean;
}

export function HistoryManager({
  vehicleId,
  events,
  mileage,
  verifiedKm,
  claimedKm,
}: {
  vehicleId: string;
  events: HistoryEventRow[];
  mileage: MileageRow[];
  verifiedKm: number;
  claimedKm: number;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    category: "service",
    date: new Date().toISOString().slice(0, 10),
    km: "",
    title: "",
    description: "",
  });
  const [reading, setReading] = useState({ date: new Date().toISOString().slice(0, 10), km: "", source: "seller_submitted" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function addEvent() {
    if (!form.title || !form.date) {
      setError("Title and date are required.");
      return;
    }
    setBusy("history");
    setError(null);
    setInfo(null);
    const res = await fetch(`/api/v1/vehicles/${vehicleId}/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, km: form.km ? Number(form.km) : undefined }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    setBusy(null);
    if (!res.ok) {
      setError(json.error?.message ?? "Could not add the event.");
      return;
    }
    setInfo("Event submitted as Pending until verified.");
    setForm({ ...form, title: "", description: "", km: "" });
    router.refresh();
  }

  async function addReading() {
    if (!reading.km || !reading.date) {
      setError("Enter the reading date and the odometer reading.");
      return;
    }
    setBusy("mileage");
    setError(null);
    setInfo(null);
    const res = await fetch(`/api/v1/vehicles/${vehicleId}/mileage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...reading, km: Number(reading.km) }),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: { flagged?: boolean }; error?: { message?: string } };
    setBusy(null);
    if (!res.ok) {
      setError(json.error?.message ?? "Could not save the reading.");
      return;
    }
    setInfo(json.data?.flagged ? "Reading saved and flagged as a possible rollback." : "Reading saved as a seller claim.");
    setReading({ ...reading, km: "" });
    router.refresh();
  }

  async function requestCorrection(e: HistoryEventRow) {
    const description = window.prompt(`Describe the correction for “${e.title}”:`);
    if (!description) return;
    setBusy(e.id);
    setError(null);
    const res = await fetch(`/api/v1/history/${e.id}/correction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });
    setBusy(null);
    if (!res.ok) {
      setError("Could not submit the correction request.");
      return;
    }
    setInfo("Correction submitted as a new pending event. The original record is preserved.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {(error || info) && (
        <div className="space-y-2" aria-live="polite">
          {error && <InlineAlert tone="danger" title="Action failed" detail={error} />}
          {info && <InlineAlert tone="success" title="Saved" detail={info} />}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.45fr_1fr]">
        <SectionCard
          title="Timeline"
          description="Every event keeps its source and status. Verified rows are locked; corrections appear as new pending rows."
          className="h-fit"
        >
          <Timeline events={events as never} />

          {events.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-[12px] border border-border">
              {events.map((e) => (
                <div
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-3.5 py-2.5 text-[12px] last:border-0 hover:bg-surface-tint/60"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon name="History" size={13} className="shrink-0 text-muted" />
                    <span className="truncate font-medium text-ink">{e.title}</span>
                    <span className="hidden truncate text-muted sm:inline">· {e.source.replace(/_/g, " ")}</span>
                  </span>
                  <button
                    onClick={() => requestCorrection(e)}
                    disabled={busy === e.id}
                    className="td-btn td-btn-ghost td-btn-sm"
                  >
                    {busy === e.id ? <Icon name="Loader2" size={13} className="animate-spin" /> : <Icon name="PenLine" size={13} />}
                    Request correction
                  </button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Add history event" description="Seller submissions are stored as Pending until verified.">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="td-label">Category</span>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="td-input td-select"
                  >
                    {["service", "repair", "accident", "insurance_claim", "ownership", "inspection", "odometer"].map((c) => (
                      <option key={c} value={c}>
                        {c.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="td-label">Date</span>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="td-input"
                  />
                </label>
              </div>
              <label className="block">
                <span className="td-label">Title</span>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. 40,000 km service"
                  className="td-input"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="td-label">Mileage (km)</span>
                  <input
                    type="number"
                    value={form.km}
                    onChange={(e) => setForm({ ...form, km: e.target.value })}
                    className="td-input"
                  />
                </label>
                <label className="block">
                  <span className="td-label">Description</span>
                  <input
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="td-input"
                  />
                </label>
              </div>
              <button onClick={addEvent} disabled={busy === "history"} className="td-btn td-btn-primary w-full">
                {busy === "history" ? (
                  <>
                    <Icon name="Loader2" size={14} className="animate-spin" /> Saving…
                  </>
                ) : (
                  <>
                    <Icon name="Plus" size={14} /> Submit event
                  </>
                )}
              </button>
            </div>
          </SectionCard>

          <SectionCard title="Odometer readings" description="A reading below the previous one is flagged as a possible rollback.">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-[11px] border border-border bg-surface-tint px-3 py-2.5">
                <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted">Last verified</div>
                <div className="mt-1 text-[16px] font-bold text-ink">{verifiedKm ? formatKm(verifiedKm) : "—"}</div>
              </div>
              <div className="rounded-[11px] border border-border bg-surface-tint px-3 py-2.5">
                <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted">Seller claimed</div>
                <div className="mt-1 text-[16px] font-bold text-ink">{claimedKm ? formatKm(claimedKm) : "—"}</div>
              </div>
            </div>

            <div className="td-scroll mt-3 max-h-48 space-y-1 overflow-y-auto pr-1">
              {mileage.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 rounded-[8px] px-1.5 py-1.5 text-[12px] hover:bg-surface-tint">
                  <span className="min-w-0 truncate text-muted">
                    {new Date(m.date).toLocaleDateString("en-IN", { month: "short", year: "numeric" })} · {m.source.replace(/_/g, " ")}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="font-semibold text-ink">{formatKm(m.km)}</span>
                    {m.flagged ? (
                      <StatusBadge status="suspicious" label="Flagged" />
                    ) : m.verified ? (
                      <StatusBadge status="verified" />
                    ) : (
                      <StatusBadge status="pending" label="Claim" />
                    )}
                  </span>
                </div>
              ))}
              {!mileage.length && <p className="py-4 text-center text-[12px] text-muted">No odometer readings on file.</p>}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <input
                type="date"
                value={reading.date}
                onChange={(e) => setReading({ ...reading, date: e.target.value })}
                className="td-input"
                aria-label="Reading date"
              />
              <input
                type="number"
                value={reading.km}
                onChange={(e) => setReading({ ...reading, km: e.target.value })}
                placeholder="km"
                className="td-input"
                aria-label="Odometer reading in kilometres"
              />
            </div>
            <button onClick={addReading} disabled={busy === "mileage"} className="td-btn td-btn-secondary mt-2.5 w-full">
              {busy === "mileage" ? (
                <>
                  <Icon name="Loader2" size={14} className="animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Icon name="Gauge" size={14} /> Add reading
                </>
              )}
            </button>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
