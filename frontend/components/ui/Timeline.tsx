import { StatusBadge } from "./StatusBadge";
import { formatKm } from "@/lib/format";
import type { HistoryRow } from "@/lib/server/db";

export function Timeline({ events }: { events: HistoryRow[] }) {
  if (!events.length) {
    return <p className="py-8 text-center text-body text-muted">No history events recorded yet.</p>;
  }
  return (
    <ol className="relative ml-1.5 border-l border-border">
      {events.map((e) => (
        <li key={e.id} className="mb-5 ml-5 last:mb-0">
          <span
            className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full ring-4 ring-surface"
            style={{ background: e.status === "verified" ? "var(--success)" : "var(--warning)" }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-semibold text-ink">{e.title}</span>
            <StatusBadge status={e.status} />
          </div>
          <div className="mt-0.5 text-[12px] text-muted">
            {new Date(e.event_date).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })}
            {e.mileage_km ? ` · ${formatKm(e.mileage_km)}` : ""} · {e.source}
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{e.description}</p>
        </li>
      ))}
    </ol>
  );
}
