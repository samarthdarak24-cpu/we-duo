"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";

export interface AdminDispute {
  id: string;
  findingId: string;
  findingTitle: string;
  severity: string;
  vehicle: string;
  sellerId: string;
  explanation: string;
  status: string;
  reviewNote: string | null;
  createdAt: string;
}

export interface AdminListing {
  id: string;
  vehicle: string;
  sellerId: string;
  status: string;
  createdAt: string;
}

export interface AdminDocument {
  id: string;
  vehicleId: string;
  type: string;
  status: string;
  reason: string | null;
}

export interface AdminQueueData {
  disputes: AdminDispute[];
  listings: AdminListing[];
  documents: AdminDocument[];
  counts: { disputes: number; listings: number; documents: number };
}

const tabs = [
  { key: "disputes", label: "Disputes" },
  { key: "listings", label: "Listings" },
  { key: "documents", label: "Documents" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

const severityTone: Record<string, string> = {
  critical: "bg-danger-bg text-danger",
  high: "bg-danger-bg text-danger",
  medium: "bg-warning-bg text-warning",
  low: "bg-bg text-muted",
};

export function AdminQueue({ data }: { data: AdminQueueData }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("disputes");
  const [openDispute, setOpenDispute] = useState<string | null>(data.disputes[0]?.id ?? null);
  const [note, setNote] = useState("");
  const [suspendFor, setSuspendFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const pendingDisputes = data.disputes.filter((d) => d.status === "pending");

  async function resolve(disputeId: string, decision: "resolved" | "rejected") {
    if (note.trim().length < 5) {
      setError("Add a short review note before deciding.");
      return;
    }
    setBusy(`${disputeId}-${decision}`);
    setError(null);
    setInfo(null);
    const res = await fetch(`/api/v1/admin/disputes/${disputeId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note: note.trim() }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    setBusy(null);
    if (!res.ok) {
      setError(json.error?.message ?? "Could not record the decision.");
      return;
    }
    setInfo(
      decision === "resolved"
        ? "Dispute resolved. The finding is cleared and the seller has been notified."
        : "Dispute rejected. The finding stays open and the seller has been notified."
    );
    setNote("");
    setOpenDispute(null);
    router.refresh();
  }

  async function suspend(listingId: string) {
    if (reason.trim().length < 5) {
      setError("Add a reason for suspending this listing.");
      return;
    }
    setBusy(listingId);
    setError(null);
    setInfo(null);
    const res = await fetch(`/api/v1/admin/listings/${listingId}/suspend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    setBusy(null);
    if (!res.ok) {
      setError(json.error?.message ?? "Could not suspend the listing.");
      return;
    }
    setInfo("Listing suspended. The seller has been notified with the reason.");
    setSuspendFor(null);
    setReason("");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "Pending disputes", value: data.counts.disputes, icon: "Scale" },
          { label: "Listings in review", value: data.counts.listings, icon: "Store" },
          { label: "Documents needing review", value: data.counts.documents, icon: "FolderOpen" },
        ].map((s) => (
          <div key={s.label} className="card flex items-center gap-3 p-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-pill bg-surface-tint text-primary">
              <Icon name={s.icon} size={20} />
            </span>
            <div>
              <div className="text-[24px] font-extrabold leading-none text-ink">{s.value}</div>
              <div className="mt-1 text-[11px] text-muted">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-card border border-info/30 bg-info-bg px-4 py-3 text-caption text-ink">
        <Icon name="Info" size={14} className="mr-1 inline text-primary" />
        Admin decisions are recorded in the audit log. Resolving a dispute clears the finding; rejecting it keeps the finding open.
        Neither action edits a verified record.
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-pill px-3.5 py-2 text-caption font-semibold transition",
              tab === t.key ? "bg-primary text-[var(--on-primary)]" : "bg-surface text-muted hover:text-ink"
            )}
          >
            {t.label}
            <span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]", tab === t.key ? "bg-[var(--primary)]/15" : "bg-bg")}>
              {data.counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {error && <p className="rounded-pill bg-danger-bg px-4 py-2 text-caption font-semibold text-danger">{error}</p>}
      {info && <p className="rounded-pill bg-success-bg px-4 py-2 text-caption font-semibold text-success">{info}</p>}

      {tab === "disputes" && (
        <section id="disputes" className="space-y-3">
          {data.disputes.map((d) => {
            const open = openDispute === d.id;
            const pending = d.status === "pending";
            return (
              <article key={d.id} className="card overflow-hidden">
                <button
                  onClick={() => {
                    setOpenDispute(open ? null : d.id);
                    setNote("");
                    setError(null);
                  }}
                  aria-expanded={open}
                  className="flex w-full items-start gap-3 p-4 text-left transition hover:bg-bg"
                >
                  <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-pill", severityTone[d.severity] ?? severityTone.low)}>
                    <Icon name="Scale" size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-body font-bold text-ink">{d.findingTitle}</span>
                      <span className={cn("pill", severityTone[d.severity] ?? severityTone.low)}>{d.severity}</span>
                      <StatusBadge status={d.status === "pending" ? "pending" : d.status === "resolved" ? "verified" : "suspicious"} label={d.status} />
                    </span>
                    <span className="mt-0.5 block text-caption text-muted">
                      {d.vehicle} · submitted {new Date(d.createdAt).toLocaleDateString("en-IN")}
                    </span>
                  </span>
                  <Icon name="ChevronDown" size={18} className={cn("mt-1 shrink-0 text-muted transition", open && "rotate-180")} />
                </button>

                {open && (
                  <div className="space-y-3 border-t border-border p-4 text-caption">
                    <div>
                      <div className="font-semibold text-ink">Seller explanation</div>
                      <p className="text-muted">{d.explanation || "No explanation provided."}</p>
                    </div>
                    {d.reviewNote && (
                      <div>
                        <div className="font-semibold text-ink">Previous review note</div>
                        <p className="text-muted">{d.reviewNote}</p>
                      </div>
                    )}
                    <p className="font-mono text-[11px] text-muted">
                      finding {d.findingId} · seller {d.sellerId}
                    </p>

                    {pending ? (
                      <div className="space-y-2 rounded-card border border-border bg-bg p-3">
                        <label className="block">
                          <span className="font-semibold text-ink">Review note</span>
                          <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={3}
                            placeholder="Summarise the evidence you reviewed and why you reached this decision."
                            className="mt-1 w-full rounded-card border border-border bg-surface px-3 py-2 text-body outline-none focus:border-primary"
                          />
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => resolve(d.id, "resolved")}
                            disabled={busy !== null}
                            className="rounded-pill bg-primary px-3.5 py-2 text-caption font-semibold text-[var(--on-primary)] hover:bg-primary-600 disabled:opacity-60"
                          >
                            {busy === `${d.id}-resolved` ? "Recording…" : "Resolve & clear finding"}
                          </button>
                          <button
                            onClick={() => resolve(d.id, "rejected")}
                            disabled={busy !== null}
                            className="rounded-pill border border-border px-3.5 py-2 text-caption font-semibold text-ink hover:bg-bg disabled:opacity-60"
                          >
                            {busy === `${d.id}-rejected` ? "Recording…" : "Reject dispute"}
                          </button>
                          <span className="text-[11px] text-muted">A note is required for both decisions.</span>
                        </div>
                      </div>
                    ) : (
                      <p className="rounded-pill bg-bg px-3 py-2 text-muted">
                        This dispute has been {d.status}. The decision is recorded in the audit log.
                      </p>
                    )}
                  </div>
                )}
              </article>
            );
          })}
          {!data.disputes.length && (
            <EmptyState icon="Scale" title="No disputes" detail="Seller explanations for AI findings will appear here for review." />
          )}
        </section>
      )}

      {tab === "listings" && (
        <section id="listings" className="card overflow-hidden">
          <div className="border-b border-border p-4">
            <h2 className="text-card-title font-bold text-ink">Listings in review</h2>
            <p className="text-caption text-muted">{pendingDisputes.length} pending dispute(s) elsewhere in the queue.</p>
          </div>
          <div className="divide-y divide-border">
            {data.listings.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-3 p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-surface-tint text-primary">
                  <Icon name="Store" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-body font-semibold text-ink">{l.vehicle}</div>
                  <div className="text-caption text-muted">
                    Listing {l.id} · submitted {new Date(l.createdAt).toLocaleDateString("en-IN")}
                  </div>
                </div>
                <StatusBadge status="pending" label="Pending review" />
                <button
                  onClick={() => {
                    setSuspendFor(suspendFor === l.id ? null : l.id);
                    setReason("");
                    setError(null);
                  }}
                  className="rounded-pill border border-border px-3 py-1.5 text-[11px] font-semibold text-ink hover:bg-bg"
                >
                  Suspend
                </button>
              </div>
            ))}
            {!data.listings.length && <p className="p-10 text-center text-body text-muted">No listings are waiting for review.</p>}
          </div>

          {suspendFor && (
            <div className="space-y-2 border-t border-border bg-bg p-4">
              <label className="block text-caption">
                <span className="font-semibold text-ink">Reason for suspension</span>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="e.g. Photos do not match the registered vehicle."
                  className="mt-1 w-full rounded-card border border-border bg-surface px-3 py-2 text-body outline-none focus:border-primary"
                />
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => suspend(suspendFor)}
                  disabled={busy !== null}
                  className="rounded-pill bg-danger px-3.5 py-2 text-caption font-semibold text-white hover:bg-danger/90 disabled:opacity-60"
                >
                  {busy === suspendFor ? "Suspending…" : "Confirm suspension"}
                </button>
                <button onClick={() => setSuspendFor(null)} className="text-caption font-semibold text-muted hover:text-ink">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {tab === "documents" && (
        <section id="documents" className="card overflow-hidden">
          <div className="border-b border-border p-4">
            <h2 className="text-card-title font-bold text-ink">Documents needing review</h2>
            <p className="text-caption text-muted">Pending and suspicious documents across all vehicles.</p>
          </div>
          <div className="divide-y divide-border">
            {data.documents.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-3 p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-surface-tint text-primary">
                  <Icon name="FileText" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-body font-semibold text-ink">{d.type.toUpperCase()}</div>
                  <div className="text-caption text-muted">{d.reason || "Awaiting verification"}</div>
                </div>
                <StatusBadge status={d.status} />
                <a
                  href={`/vehicle/${d.vehicleId}`}
                  className="flex items-center gap-1 rounded-pill border border-border px-3 py-1.5 text-[11px] font-semibold text-ink hover:bg-bg"
                >
                  View vehicle <Icon name="ChevronRight" size={12} />
                </a>
              </div>
            ))}
            {!data.documents.length && <p className="p-10 text-center text-body text-muted">No documents need review.</p>}
          </div>
        </section>
      )}

      <p className="text-caption text-muted">
        AI findings are warnings that need investigation, not proof of fraud. Decisions here change review status only — verified
        records and their hash chain are never rewritten.
      </p>
    </div>
  );
}
