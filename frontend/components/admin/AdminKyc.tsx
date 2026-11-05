"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";

export interface KycRow {
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  sellerType: string | null;
  businessName: string | null;
  status: string;
  emailVerified: boolean;
  docUrl: string | null;
  vehicleCount: number;
  joinedAt: string;
}

type Filter = "all" | "pending" | "verified" | "rejected" | "not_started";

const statusTone: Record<string, string> = {
  pending: "pending",
  verified: "verified",
  rejected: "suspicious",
  not_started: "unverified",
};

export function AdminKyc({
  items,
  counts,
}: {
  items: KycRow[];
  counts: { pending: number; verified: number; rejected: number; notStarted: number };
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("pending");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState(items);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!q) return true;
      return [r.name, r.email, r.businessName, r.city, r.phone].some((v) => (v ?? "").toLowerCase().includes(q));
    });
  }, [rows, filter, query]);

  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: "pending", label: "Pending", count: claims(rows, "pending", counts.pending) },
    { key: "verified", label: "Verified", count: claims(rows, "verified", counts.verified) },
    { key: "rejected", label: "Rejected", count: claims(rows, "rejected", counts.rejected) },
    { key: "not_started", label: "Not started", count: claims(rows, "not_started", counts.notStarted) },
    { key: "all", label: "All sellers", count: rows.length },
  ];

  async function decide(userId: string, status: "verified" | "rejected") {
    setBusy(userId);
    setError(null);
    const res = await fetch(`/api/v1/admin/kyc/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, note: notes[userId]?.trim() || undefined }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    setBusy(null);
    if (!res.ok) {
      setError(json.error?.message ?? "Could not update KYC status.");
      return;
    }
    setRows((list) => list.map((r) => (r.userId === userId ? { ...r, status } : r)));
    setNotes((n) => ({ ...n, [userId]: "" }));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Pending review" value={claims(rows, "pending", counts.pending)} tone="warning" icon="Clock" />
        <Stat label="Verified sellers" value={claims(rows, "verified", counts.verified)} tone="success" icon="BadgeCheck" />
        <Stat label="Needs re-upload" value={claims(rows, "rejected", counts.rejected)} tone="danger" icon="ShieldAlert" />
        <Stat label="Not started" value={claims(rows, "not_started", counts.notStarted)} tone="muted" icon="CircleDot" />
      </div>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div className="flex flex-wrap gap-1.5">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={cn(
                  "rounded-pill px-3 py-1.5 text-caption font-semibold transition",
                  filter === t.key ? "bg-primary text-[var(--on-primary)]" : "border border-border text-muted hover:bg-bg hover:text-ink"
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
              placeholder="Search name, email, business…"
              className="w-64 rounded-pill border border-border bg-bg py-2 pl-8 pr-3 text-caption outline-none focus:border-primary"
            />
          </div>
        </div>

        {error && <p className="mx-4 mt-3 rounded-pill bg-danger-bg px-3 py-2 text-caption font-semibold text-danger">{error}</p>}

        <div className="divide-y divide-border">
          {filtered.map((r) => (
            <article key={r.userId} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-tint text-caption font-bold text-primary">
                    {initials(r.name)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-body font-bold text-ink">{r.businessName || r.name}</h3>
                      <StatusBadge status={statusTone[r.status] ?? "unverified"} label={r.status.replace(/_/g, " ")} />
                      {r.emailVerified && (
                        <span className="flex items-center gap-1 rounded-pill bg-success-bg px-2 py-0.5 text-[11px] font-semibold text-success">
                          <Icon name="Check" size={11} /> Email
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-caption text-muted">
                      {r.name} · {r.email} · {r.phone || "No phone"}
                    </p>
                    <p className="mt-0.5 text-caption text-muted">
                      {[r.city, r.sellerType, `${r.vehicleCount} vehicle${r.vehicleCount === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {r.docUrl ? (
                    <a
                      href={r.docUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 rounded-pill border border-border px-3 py-1.5 text-caption font-semibold text-ink hover:bg-bg"
                    >
                      <Icon name="FileText" size={13} /> View KYC
                    </a>
                  ) : (
                    <span className="rounded-pill border border-dashed border-border px-3 py-1.5 text-caption text-muted">No document</span>
                  )}
                </div>
              </div>

              {r.status === "pending" && (
                <div className="mt-3 flex flex-col gap-2 border-t border-border/60 pt-3 md:flex-row md:items-center">
                  <input
                    value={notes[r.userId] ?? ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [r.userId]: e.target.value }))}
                    placeholder="Optional note sent to the seller…"
                    className="flex-1 rounded-pill border border-border bg-bg px-3.5 py-2 text-caption outline-none focus:border-primary"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => decide(r.userId, "verified")}
                      disabled={busy === r.userId || !r.docUrl}
                      title={!r.docUrl ? "A KYC document is required before approval." : undefined}
                      className="flex items-center gap-1.5 rounded-pill bg-success px-3.5 py-2 text-caption font-semibold text-[#08110c] hover:opacity-90 disabled:opacity-50"
                    >
                      <Icon name="Check" size={13} /> Approve
                    </button>
                    <button
                      onClick={() => decide(r.userId, "rejected")}
                      disabled={busy === r.userId}
                      className="flex items-center gap-1.5 rounded-pill border border-danger/40 bg-danger-bg px-3.5 py-2 text-caption font-semibold text-danger hover:bg-danger/15 disabled:opacity-50"
                    >
                      <Icon name="X" size={13} /> Reject
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))}
          {!filtered.length && (
            <div className="p-10 text-center">
              <Icon name="ShieldCheck" size={26} className="mx-auto text-muted" />
              <p className="mt-2 text-body font-semibold text-ink">Nothing here</p>
              <p className="text-caption text-muted">
                {filter === "pending" ? "No KYC submissions are waiting for review." : "No sellers match this filter."}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function claims(rows: KycRow[], status: string, fallback: number) {
  const live = rows.filter((r) => r.status === status).length;
  return rows.length ? live : fallback;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function Stat({ label, value, tone, icon }: { label: string; value: number; tone: "warning" | "success" | "danger" | "muted"; icon: string }) {
  const toneClass =
    tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-muted";
  const bg =
    tone === "warning" ? "bg-warning-bg" : tone === "success" ? "bg-success-bg" : tone === "danger" ? "bg-danger-bg" : "bg-surface-tint";
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className={cn("flex h-10 w-10 items-center justify-center rounded-full", bg, toneClass)}>
        <Icon name={icon} size={18} />
      </span>
      <div>
        <div className="text-title font-extrabold leading-none text-ink">{value}</div>
        <div className="mt-1 text-caption text-muted">{label}</div>
      </div>
    </div>
  );
}
