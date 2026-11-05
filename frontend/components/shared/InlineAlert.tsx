import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

const tones = {
  warning: { bg: "var(--warning-bg)", fg: "var(--warning)", icon: "AlertTriangle", border: "color-mix(in srgb, var(--warning) 28%, transparent)" },
  danger: { bg: "var(--danger-bg)", fg: "var(--danger)", icon: "ShieldAlert", border: "color-mix(in srgb, var(--danger) 28%, transparent)" },
  success: { bg: "var(--success-bg)", fg: "var(--success)", icon: "CheckCircle2", border: "color-mix(in srgb, var(--success) 28%, transparent)" },
  info: { bg: "var(--info-bg)", fg: "var(--primary)", icon: "Info", border: "color-mix(in srgb, var(--primary) 28%, transparent)" },
  neutral: { bg: "var(--surface-tint)", fg: "var(--muted)", icon: "HelpCircle", border: "var(--border)" },
} as const;

export function InlineAlert({
  tone = "info",
  title,
  detail,
  action,
  icon,
  className,
}: {
  tone?: keyof typeof tones;
  title: string;
  detail?: string;
  action?: ReactNode;
  icon?: string;
  className?: string;
}) {
  const t = tones[tone];
  return (
    <div
      className={cn("flex flex-col gap-3 rounded-[14px] border px-4 py-3.5 sm:flex-row sm:items-center", className)}
      style={{ background: t.bg, borderColor: t.border }}
      role={tone === "danger" || tone === "warning" ? "status" : undefined}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/55"
        style={{ color: t.fg }}
      >
        <Icon name={icon ?? t.icon} size={16} strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-snug text-ink">{title}</p>
        {detail && <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{detail}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
