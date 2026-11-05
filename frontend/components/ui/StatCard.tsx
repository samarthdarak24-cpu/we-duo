import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

export function StatCard({
  icon,
  value,
  label,
  hint,
  href,
  tone = "gold",
  className,
}: {
  icon: string;
  value: number | string;
  label: string;
  hint?: string;
  href?: string;
  tone?: "gold" | "success" | "warning" | "danger" | "neutral";
  className?: string;
}) {
  const tones = {
    gold: { bg: "var(--info-bg)", fg: "var(--primary)" },
    success: { bg: "var(--success-bg)", fg: "var(--success)" },
    warning: { bg: "var(--warning-bg)", fg: "var(--warning)" },
    danger: { bg: "var(--danger-bg)", fg: "var(--danger)" },
    neutral: { bg: "var(--surface-tint)", fg: "var(--muted)" },
  } as const;
  const t = tones[tone];
  const Wrapper = href ? "a" : "div";
  return (
    <Wrapper
      href={href}
      className={cn("td-kpi no-underline", href && "cursor-pointer", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[12px] font-semibold leading-snug text-muted">{label}</span>
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]"
          style={{ background: t.bg, color: t.fg }}
        >
          <Icon name={icon} size={16} strokeWidth={2} />
        </span>
      </div>
      <div className="mt-auto flex items-end justify-between gap-2">
        <span className="td-metric text-[30px] text-ink">{value}</span>
        {href && <Icon name="ArrowUpRight" size={15} className="mb-1 text-muted" />}
      </div>
      {hint && <span className="text-[11.5px] leading-tight text-muted">{hint}</span>}
    </Wrapper>
  );
}
