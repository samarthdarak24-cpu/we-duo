"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatKm } from "@/lib/format";

export interface HistoryEvidence {
  id: string;
  type: string;
  file_name: string;
  status: string;
  sha256: string;
  version: number;
  verified_at: string | null;
}

export interface HistoryEvent {
  id: string;
  title: string;
  description: string;
  event_date: string;
  mileage_km: number | null;
  source: string;
  status: string;
  evidence_document_id: string | null;
  evidence?: HistoryEvidence | null;
  chain?: { records: number; intact: boolean; latestHash: string | null };
}

type Filter = "all" | "verified" | "pending" | "attention";

export function HistoryExplorer({
  events,
  vehicleLabel,
  vehicleId,
}: {
  events: HistoryEvent[];
  vehicleLabel: string;
  vehicleId: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<HistoryEvent | null>(null);

  const counts = useMemo(
    () => ({
      all: events.length,
      verified: events.filter((e) => e.status === "verified").length,
      pending: events.filter((e) => e.status === "pending").length,
      attention: events.filter((e) => e.status !== "verified" && e.status !== "pending").length,
    }),
    [events]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (filter === "verified" && e.status !== "verified") return false;
      if (filter === "pending" && e.status !== "pending") return false;
      if (filter === "attention" && (e.status === "verified" || e.status === "pending")) return false;
      if (!q) return true;
      return [e.title, e.description, e.source].some((v) => v.toLowerCase().includes(q));
    });
  }, [events, filter, query]);

  return (
    <>
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { key: "all", label: "All events", count: counts.all },
                { key: "verified", label: "Verified", count: counts.verified },
                { key: "pending", label: "Pending", count: counts.pending },
                { key: "attention", label: "Needs attention", count: counts.attention },
              ] as { key: Filter; label: string; count: number }[]
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={cn(
                  "h-8 rounded-full border px-3 text-[11.5px] font-semibold transition",
                  filter === t.key
                    ? "border-primary/40 bg-info-bg text-primary"
                    : "border-border text-muted hover:bg-surface-tint hover:text-ink"
                )}
              >
                {t.label} <span className="opacity-70">{t.count}</span>
              </button>
            ))}
          </div>
          <div className="relative">
            <Icon name="Search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search events, sources…"
              className="td-input h-9 w-60 pl-8 text-[12px]"
            />
          </div>
        </div>

        <ol className="relative ml-4 border-l border-border p-4">
          {filtered.map((e) => {
            const tone = e.status === "verified" ? "var(--success)" : e.status === "pending" ? "var(--warning)" : "var(--danger)";
            const hasEvidence = !!e.evidence || !!e.evidence_document_id;
            return (
              <li key={e.id} className="relative mb-1 pl-6">
                <span className="absolute -left-[7px] top-4 h-3 w-3 rounded-full ring-4 ring-surface" style={{ background: tone }} />
                <button
                  onClick={() => setOpen(e)}
                  className="mb-2 w-full rounded-[10px] border border-transparent px-2.5 py-2 text-left transition hover:border-border hover:bg-surface-tint"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-semibold text-ink">{e.title}</span>
                    <StatusBadge status={e.status} />
                    {hasEvidence && (
                      <span className="flex items-center gap-1 rounded-full bg-info-bg px-2 py-0.5 text-[10px] font-semibold text-primary">
                        <Icon name="FileText" size={10} /> Evidence
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-muted">
                    {new Date(e.event_date).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })}
                    {e.mileage_km ? ` · ${formatKm(e.mileage_km)}` : ""} · {e.source}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-muted">{e.description}</p>
                </button>
              </li>
            );
          })}
          {!filtered.length && <li className="py-10 text-center text-[13px] text-muted">No events match this filter.</li>}
        </ol>
      </section>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end print:hidden">
          <button aria-label="Close details" onClick={() => setOpen(null)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <aside className="relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-surface shadow-2xl animate-fade-up">
            <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-border bg-surface p-5">
              <div>
                <div className="td-eyebrow">Evidence drawer</div>
                <h2 className="td-h2 mt-1">{open.title}</h2>
                <p className="text-[11.5px] text-muted">{vehicleLabel}</p>
              </div>
              <button
                onClick={() => setOpen(null)}
                aria-label="Close details"
                className="td-icon-btn h-8 w-8"
              >
                <Icon name="X" size={15} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={open.status} />
                <span className="td-chip">{open.source}</span>
                <span className="td-chip">{new Date(open.event_date).toLocaleDateString("en-IN", { dateStyle: "medium" })}</span>
                {open.mileage_km ? <span className="td-chip">{formatKm(open.mileage_km)}</span> : null}
              </div>

              <div>
                <div className="td-eyebrow mb-1">What happened</div>
                <p className="text-[13px] leading-relaxed text-muted">{open.description}</p>
              </div>

              {open.evidence ? (
                <div className="rounded-[12px] border border-border bg-surface-tint p-4">
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-ink">
                    <Icon name="FileCheck" size={14} className="text-primary" /> Linked document
                  </div>
                  <div className="mt-2 space-y-1.5 text-[12px]">
                    <Line label="File" value={open.evidence.file_name} />
                    <Line label="Type" value={open.evidence.type.replace(/_/g, " ")} />
                    <Line label="Version" value={`v${open.evidence.version}`} />
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted">Status</span>
                      <StatusBadge status={open.evidence.status} />
                    </div>
                    <Line label="Verified" value={open.evidence.verified_at ? new Date(open.evidence.verified_at).toLocaleString("en-IN") : "—"} />
                    <div>
                      <div className="text-muted">SHA-256</div>
                      <div className="mt-0.5 break-all rounded-[8px] border border-border bg-surface px-2 py-1.5 font-mono text-[10px] text-ink">
                        {open.evidence.sha256}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-[12px] border border-dashed border-border bg-surface-tint p-4 text-[12px] text-muted">
                  <Icon name="Info" size={14} className="mr-1 inline" /> No document is linked to this event. The record is sourced from{" "}
                  {open.source}.
                </div>
              )}

              {open.chain && (
                <div className="rounded-[12px] border border-border bg-surface-tint p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[12px] font-semibold text-ink">
                      <Icon name="ShieldCheck" size={14} className={open.chain.intact ? "text-success" : "text-danger"} /> Audit chain
                    </div>
                    <span className={cn("pill", open.chain.intact ? "bg-success-bg text-success" : "bg-danger-bg text-danger")}>
                      {open.chain.intact ? "Intact" : "Broken"}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1.5 text-[12px]">
                    <Line label="Records" value={String(open.chain.records)} />
                    <div>
                      <div className="text-muted">Latest hash</div>
                      <div className="mt-0.5 break-all rounded-[8px] border border-border bg-surface px-2 py-1.5 font-mono text-[10px] text-ink">
                        {open.chain.latestHash ?? "—"}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <a href={`/vehicle/${vehicleId}`} className="td-btn td-btn-primary w-full">
                <Icon name="ExternalLink" size={14} /> Open full vehicle report
              </a>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted">{label}</span>
      <span className="break-all text-right font-medium text-ink">{value}</span>
    </div>
  );
}
