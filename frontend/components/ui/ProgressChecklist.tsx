import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

export interface ChecklistItem {
  label: string;
  status: string;
  meta?: string;
}

export function ProgressChecklist({
  percent,
  items,
}: {
  percent: number;
  items: ChecklistItem[];
}) {
  const color =
    percent >= 90 ? "var(--success)" : percent >= 60 ? "var(--warning)" : "var(--danger)";
  return (
    <div>
      <div className="mb-2 flex items-end justify-between">
        <span className="td-metric text-[34px] leading-none text-ink">{percent}%</span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Complete</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-tint">
        <div
          className="h-full rounded-full"
          style={{ width: `${percent}%`, background: color, transition: "width 0.9s ease-out" }}
        />
      </div>
      <ul className="mt-4 space-y-2.5">
        {items.map((it) => (
          <li key={it.label} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2.5 text-[12.5px] text-ink">
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                )}
                style={{
                  background:
                    it.status === "verified"
                      ? "var(--success-bg)"
                      : it.status === "pending"
                      ? "var(--warning-bg)"
                      : "var(--danger-bg)",
                  color:
                    it.status === "verified"
                      ? "var(--success)"
                      : it.status === "pending"
                      ? "var(--warning)"
                      : "var(--danger)",
                }}
              >
                <Icon
                  name={it.status === "verified" ? "CheckCircle2" : it.status === "pending" ? "CircleDot" : "AlertTriangle"}
                  size={14}
                  strokeWidth={2.2}
                />
              </span>
              {it.label}
            </span>
            {it.meta && <span className="shrink-0 text-[11.5px] text-muted">{it.meta}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
