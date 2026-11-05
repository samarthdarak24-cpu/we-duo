"use client";

import { Icon } from "./Icon";

export function ActionTile({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-w-[150px] flex-col items-start gap-2.5 rounded-[12px] border border-border bg-surface px-4 py-3.5 text-left transition hover:border-primary/45 hover:bg-surface-tint"
    >
      <span className="td-icon-chip transition group-hover:scale-[1.03]">
        <Icon name={icon} size={18} />
      </span>
      <span className="flex w-full items-center justify-between gap-2 text-[12.5px] font-semibold text-ink">
        {label}
        <Icon name="ArrowUpRight" size={13} className="shrink-0 text-muted" />
      </span>
    </button>
  );
}
