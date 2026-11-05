import { cn } from "@/lib/cn";
import type { Status } from "@/lib/seed";
import { Icon } from "./Icon";

const statusConfig: Record<
  Status,
  { label: string; color: string; bg: string; icon: string }
> = {
  verified: { label: "Verified", color: "var(--success)", bg: "var(--success-bg)", icon: "CheckCircle2" },
  pending: { label: "Pending", color: "var(--warning)", bg: "var(--warning-bg)", icon: "CircleDot" },
  suspicious: { label: "Suspicious", color: "var(--danger)", bg: "var(--danger-bg)", icon: "AlertTriangle" },
  unverified: { label: "Unverified", color: "var(--muted)", bg: "var(--surface-tint)", icon: "HelpCircle" },
  unavailable: { label: "Unavailable", color: "var(--muted)", bg: "var(--surface-tint)", icon: "HelpCircle" },
  needs_correction: { label: "Needs correction", color: "var(--danger)", bg: "var(--danger-bg)", icon: "ShieldAlert" },
  draft: { label: "Draft", color: "var(--muted)", bg: "var(--surface-tint)", icon: "FileText" },
  published: { label: "Published", color: "var(--success)", bg: "var(--success-bg)", icon: "Store" },
  sold: { label: "Sold", color: "var(--muted)", bg: "var(--surface-tint)", icon: "Tag" },
  processing: { label: "Processing", color: "var(--warning)", bg: "var(--warning-bg)", icon: "Clock" },
  cleared: { label: "Cleared", color: "var(--success)", bg: "var(--success-bg)", icon: "ShieldCheck" },
  explained: { label: "Explained", color: "var(--warning)", bg: "var(--warning-bg)", icon: "MessageSquare" },
  open: { label: "Open", color: "var(--danger)", bg: "var(--danger-bg)", icon: "CircleDot" },
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: Status | string;
  label?: string;
  className?: string;
}) {
  const known = statusConfig[status as Status];
  const c = known ?? statusConfig.unverified;
  // Never display an unrecognised status as "Unverified" — show what it actually is.
  const text = label ?? known?.label ?? status.replace(/_/g, " ");
  return (
    <span
      className={cn("pill", className)}
      style={{ color: c.color, background: c.bg }}
    >
      <Icon name={c.icon} size={13} strokeWidth={2} />
      {text}
    </span>
  );
}
