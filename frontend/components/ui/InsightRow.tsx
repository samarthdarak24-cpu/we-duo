import type { Status } from "@/lib/seed";
import { Icon } from "./Icon";

const cfg: Record<Status, { icon: string; color: string; bg: string }> = {
  verified: { icon: "CheckCircle2", color: "var(--success)", bg: "var(--success-bg)" },
  pending: { icon: "CircleDot", color: "var(--warning)", bg: "var(--warning-bg)" },
  suspicious: { icon: "AlertTriangle", color: "var(--danger)", bg: "var(--danger-bg)" },
  unverified: { icon: "HelpCircle", color: "var(--muted)", bg: "var(--surface-tint)" },
  unavailable: { icon: "HelpCircle", color: "var(--muted)", bg: "var(--surface-tint)" },
  needs_correction: { icon: "ShieldAlert", color: "var(--danger)", bg: "var(--danger-bg)" },
  draft: { icon: "FileText", color: "var(--muted)", bg: "var(--surface-tint)" },
  published: { icon: "Store", color: "var(--success)", bg: "var(--success-bg)" },
  sold: { icon: "Tag", color: "var(--muted)", bg: "var(--surface-tint)" },
  processing: { icon: "Clock", color: "var(--warning)", bg: "var(--warning-bg)" },
  cleared: { icon: "ShieldCheck", color: "var(--success)", bg: "var(--success-bg)" },
  explained: { icon: "MessageSquare", color: "var(--warning)", bg: "var(--warning-bg)" },
  open: { icon: "CircleDot", color: "var(--danger)", bg: "var(--danger-bg)" },
};

export interface InsightLike {
  label: string;
  detail: string;
  status: string;
}

export function InsightRow({ insight }: { insight: InsightLike }) {
  const c = cfg[insight.status as Status] ?? cfg.unverified;
  return (
    <div className="flex items-start gap-3 rounded-[11px] border border-transparent px-1 py-1.5 transition hover:border-border hover:bg-surface-tint">
      <span
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
        style={{ background: c.bg, color: c.color }}
      >
        <Icon name={c.icon} size={13} strokeWidth={2.4} />
      </span>
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold leading-snug text-ink">{insight.label}</div>
        <div className="mt-0.5 text-[12px] leading-relaxed text-muted">{insight.detail}</div>
      </div>
    </div>
  );
}
