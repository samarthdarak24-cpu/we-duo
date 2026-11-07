"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { apiCall } from "@/lib/client/api";
import { formatINR } from "@/lib/format";

export interface InquirySummary {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  buyerName: string;
  sellerName: string;
  sellerInitials: string;
  initials: string;
  message: string;
  type: string;
  status: string;
  createdAt: string;
  lastActivityAt: string;
  vehicle: string;
  regNo: string;
  price: number;
  messageCount: number;
}

interface ThreadMessage {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  offerAmount: number | null;
  scheduledAt: string | null;
  createdAt: string;
}

interface ThreadDetail extends Omit<InquirySummary, "vehicle"> {
  messages: ThreadMessage[];
  vehicle: { id: string; make: string; model: string; regNo: string; price: number; listingId?: string } | null;
}

export function Inbox({
  items,
  viewerId,
  role,
  initialSelected,
}: {
  items: InquirySummary[];
  viewerId: string;
  role: "seller" | "buyer";
  initialSelected?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(
    initialSelected && items.some((i) => i.id === initialSelected) ? initialSelected : items[0]?.id ?? null
  );
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [reply, setReply] = useState("");
  const [offer, setOffer] = useState("");
  const [schedule, setSchedule] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [list, setList] = useState(items);

  useEffect(() => {
    if (!selected) {
      setThread(null);
      return;
    }
    let active = true;
    setError(null);
    fetch(`/api/v1/inquiries/${selected}`)
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as { data?: ThreadDetail; error?: { message?: string } };
        if (!active) return;
        if (res.status === 401) {
          setThread(null);
          setAuthRequired(true);
          return;
        }
        if (json.data) {
          setAuthRequired(false);
          setThread(json.data);
        } else setError(json.error?.message ?? "Could not load this conversation.");
      })
      .catch(() => active && setError("Network error loading the conversation."));
    return () => {
      active = false;
    };
  }, [selected]);

  async function send() {
    if (!selected || !reply.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/v1/inquiries/${selected}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: reply.trim(),
        offerAmount: offer ? Number(offer) : undefined,
        scheduledAt: schedule ? new Date(schedule).toISOString() : undefined,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    setBusy(false);
    if (!res.ok) {
      setError(json.error?.message ?? "Message could not be sent.");
      return;
    }
    setReply("");
    setOffer("");
    setSchedule("");
    const refreshed = await fetch(`/api/v1/inquiries/${selected}`).then((r) => r.json());
    if (refreshed.data) setThread(refreshed.data);
    router.refresh();
  }

  async function setStatus(status: string) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    const r = await apiCall(`/api/v1/inquiries/${selected}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }, "Could not change the inquiry status.");
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setList((l) => l.map((i) => (i.id === selected ? { ...i, status } : i)));
    setThread((t) => (t ? { ...t, status } : t));
    router.refresh();
  }

  const counterpart = (i: InquirySummary) => (role === "seller" ? i.buyerName : i.sellerName);
  const initials = (i: InquirySummary) => (role === "seller" ? i.initials : i.sellerInitials);

  function openThread(id: string) {
    setSelected(id);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/${role}/inquiries/${id}`);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3.5">
          <div>
            <h2 className="td-h2">Inquiries</h2>
            <p className="text-[11.5px] text-muted">{list.length} conversations</p>
          </div>
          <span className="td-icon-chip h-8 w-8">
            <Icon name="MessageSquare" size={15} />
          </span>
        </div>
        <ul className="td-scroll max-h-[560px] overflow-y-auto">
          {list.map((i) => {
            const active = selected === i.id;
            return (
              <li key={i.id}>
                <button
                  onClick={() => openThread(i.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex w-full items-start gap-3 border-b border-border/70 p-3.5 text-left transition",
                    active ? "bg-info-bg" : "hover:bg-surface-tint"
                  )}
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-primary"
                    style={{ background: "var(--info-bg)" }}
                  >
                    {initials(i)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-semibold text-ink">{counterpart(i)}</span>
                      <span className="shrink-0 text-[10.5px] text-muted">
                        {new Date(i.lastActivityAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                    </span>
                    <span className="block truncate text-[11.5px] text-muted">
                      {i.vehicle} · {i.regNo}
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-2">
                      <span className="truncate text-[11.5px] text-muted">{i.message}</span>
                      <StatusBadge status={i.status === "open" ? "pending" : i.status === "resolved" ? "verified" : "pending"} label={i.status} />
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {!list.length && <li className="px-4 py-10 text-center text-[13px] text-muted">No inquiries yet.</li>}
        </ul>
      </section>

      <section className="card flex min-h-[460px] flex-col overflow-hidden">
        {thread ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-full text-[11px] font-bold text-primary"
                  style={{ background: "var(--info-bg)" }}
                >
                  {role === "seller" ? thread.initials : thread.sellerInitials}
                </span>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold text-ink">{role === "seller" ? thread.buyerName : thread.sellerName}</div>
                  <div className="truncate text-[11.5px] text-muted">
                    {thread.vehicle ? `${thread.vehicle.make} ${thread.vehicle.model}` : "Vehicle"} · {thread.vehicle?.regNo ?? thread.regNo} ·{" "}
                    {formatINR(thread.price)}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={thread.status === "resolved" ? "verified" : "pending"} label={thread.status} />
                <a href={`/vehicle/${thread.vehicle?.id ?? ""}`} className="td-btn td-btn-secondary td-btn-sm">
                  <Icon name="Car" size={13} /> View vehicle
                </a>
              </div>
            </div>

            <div className="td-scroll flex-1 space-y-3 overflow-y-auto bg-surface-tint/50 px-5 py-4">
              {thread.messages.map((m) => {
                const mine = m.senderId === viewerId;
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "max-w-[78%] rounded-[14px] px-3.5 py-2.5 text-[13px] leading-relaxed",
                      mine
                        ? "ml-auto rounded-br-[4px] bg-primary text-[#17191B]"
                        : "rounded-bl-[4px] border border-border bg-surface text-ink"
                    )}
                  >
                    <div className={cn("mb-1 text-[10.5px] font-semibold", mine ? "text-[#17191B]/75" : "text-muted")}>{m.senderName}</div>
                    <div>{m.body}</div>
                    {m.offerAmount != null && (
                      <div className={cn("mt-1 text-[11.5px] font-semibold", mine ? "text-[#17191B]/90" : "text-primary")}>
                        Offer: {formatINR(m.offerAmount)}
                      </div>
                    )}
                    {m.scheduledAt && (
                      <div className={cn("mt-1 flex items-center gap-1 text-[11.5px]", mine ? "text-[#17191B]/90" : "text-muted")}>
                        <Icon name="Calendar" size={12} /> {new Date(m.scheduledAt).toLocaleString("en-IN")}
                      </div>
                    )}
                    <div className={cn("mt-1 text-[10px]", mine ? "text-[#17191B]/65" : "text-muted")}>
                      {new Date(m.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                );
              })}
              {!thread.messages.length && <p className="py-10 text-center text-[12.5px] text-muted">No messages yet.</p>}
            </div>

            <div className="border-t border-border px-5 py-3.5">
              {error && (
                <div className="mb-2">
                  <InlineAlert tone="danger" title="Message not sent" detail={error} />
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Type a message…"
                  aria-label="Message"
                  className="td-input flex-1"
                />
                <button onClick={send} disabled={busy || !reply.trim()} className="td-btn td-btn-primary">
                  {busy ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Send" size={14} />}
                  Send
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-[11.5px] text-muted">
                  Offer ₹
                  <input
                    type="number"
                    value={offer}
                    onChange={(e) => setOffer(e.target.value)}
                    placeholder="optional"
                    className="td-input h-8 w-28 text-[11.5px]"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-[11.5px] text-muted">
                  <Icon name="Calendar" size={13} /> Test drive
                  <input
                    type="datetime-local"
                    value={schedule}
                    onChange={(e) => setSchedule(e.target.value)}
                    className="td-input h-8 w-auto text-[11.5px]"
                  />
                </label>
                <div className="ml-auto flex gap-1.5">
                  {thread.status !== "resolved" && (
                    <button onClick={() => setStatus("resolved")} disabled={busy} className="td-btn td-btn-ghost td-btn-sm" style={{ color: "var(--success)" }}>
                      Mark resolved
                    </button>
                  )}
                  {thread.status !== "cancelled" && (
                    <button onClick={() => setStatus("cancelled")} disabled={busy} className="td-btn td-btn-ghost td-btn-sm">
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-tint text-primary">
              <Icon name="MessageSquare" size={22} />
            </span>
            <p className="max-w-sm text-[13px] text-muted">
              {authRequired ? "Sign in to open this conversation." : error ?? "Select a conversation to read the thread."}
            </p>
            {authRequired && (
              <a href="/login" className="td-btn td-btn-primary">
                Sign in
              </a>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
