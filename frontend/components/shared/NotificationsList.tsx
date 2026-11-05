"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

export interface Notif {
  id: string;
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

const iconFor: Record<string, string> = {
  document: "FolderOpen",
  mileage: "Gauge",
  saved: "Heart",
  inquiry: "MessageSquare",
  verification: "ShieldCheck",
  admin: "ShieldAlert",
  report: "FileText",
  price: "TrendingDown",
};

export function NotificationsList({
  items,
  initialHasMore = false,
  initialBefore = null,
}: {
  items: Notif[];
  initialHasMore?: boolean;
  initialBefore?: string | null;
}) {
  const router = useRouter();
  const [list, setList] = useState(items);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [before, setBefore] = useState(initialBefore);
  const [loadingMore, setLoadingMore] = useState(false);
  const unread = list.filter((n) => !n.read).length;
  const visible = filter === "unread" ? list.filter((n) => !n.read) : list;

  async function markAll() {
    setList((l) => l.map((n) => ({ ...n, read: true })));
    await fetch("/api/v1/notifications/read-all", { method: "POST" });
    router.refresh();
  }

  async function markOne(id: string) {
    setList((l) => l.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await fetch(`/api/v1/notifications/${id}/read`, { method: "PATCH" });
    router.refresh();
  }

  async function loadOlder() {
    if (!before || loadingMore) return;
    setLoadingMore(true);
    const res = await fetch(`/api/v1/notifications?limit=20&before=${encodeURIComponent(before)}`);
    const json = (await res.json().catch(() => ({}))) as {
      data?: { items?: Notif[]; nextBefore?: string | null; hasMore?: boolean };
      error?: { message?: string };
    };
    setLoadingMore(false);
    const page = json.data;
    if (!res.ok || !page?.items?.length) {
      setHasMore(false);
      return;
    }
    const incoming = page.items;
    setList((current) => {
      const seen = new Set(current.map((n) => n.id));
      return [...current, ...incoming.filter((n) => !seen.has(n.id))];
    });
    setBefore(page.nextBefore ?? null);
    setHasMore(!!page.hasMore);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {(["all", "unread"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                "h-8 rounded-full border px-3 text-[11.5px] font-semibold capitalize transition " +
                (filter === f
                  ? "border-primary/40 bg-info-bg text-primary"
                  : "border-border bg-surface text-muted hover:text-ink")
              }
            >
              {f} {f === "unread" && unread > 0 ? `(${unread})` : ""}
            </button>
          ))}
        </div>
        <button onClick={markAll} disabled={!unread} className="td-btn td-btn-ghost td-btn-sm">
          <Icon name="CheckCheck" size={13} /> Mark all read
        </button>
      </div>

      <div className="card divide-y divide-border overflow-hidden">
        {visible.map((n) => (
          <button
            key={n.id}
            onClick={() => !n.read && markOne(n.id)}
            className={"flex w-full items-start gap-3 p-4 text-left transition " + (n.read ? "hover:bg-surface-tint/60" : "bg-info-bg/40 hover:bg-info-bg/70")}
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]"
              style={{ background: "var(--surface-tint)", color: "var(--primary)" }}
            >
              <Icon name={iconFor[n.type] ?? "Bell"} size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-[13px] font-medium text-ink">{n.title}</span>
                {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
              </span>
              {n.body && <span className="mt-0.5 block text-[12px] leading-relaxed text-muted">{n.body}</span>}
              <span className="mt-1 block text-[10.5px] text-muted">
                {new Date(n.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            </span>
          </button>
        ))}
        {!visible.length && (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-tint text-primary">
              <Icon name="Bell" size={22} />
            </span>
            <p className="text-[13px] text-muted">{filter === "unread" ? "You're all caught up." : "No notifications yet."}</p>
          </div>
        )}
      </div>

      {hasMore && filter === "all" && (
        <div className="flex justify-center">
          <button onClick={loadOlder} disabled={loadingMore} className="td-btn td-btn-secondary">
            <Icon name={loadingMore ? "Loader2" : "History"} size={14} className={loadingMore ? "animate-spin" : ""} />
            {loadingMore ? "Loading…" : "Load older notifications"}
          </button>
        </div>
      )}
    </div>
  );
}
