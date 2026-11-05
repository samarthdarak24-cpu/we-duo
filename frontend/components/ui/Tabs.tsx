"use client";

import { cn } from "@/lib/cn";

export interface TabItem {
  label: string;
  value: string;
  icon?: string;
}

export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: TabItem[];
  active: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "td-scroll flex items-center gap-0.5 overflow-x-auto rounded-[11px] border border-border bg-surface-tint p-1",
        className
      )}
      role="tablist"
    >
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={active === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] px-3 text-[12.5px] font-semibold transition",
            active === t.value
              ? "bg-primary text-[var(--on-primary)]"
              : "text-muted hover:bg-surface hover:text-ink"
          )}
        >
          {t.icon && (
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: active === t.value ? "var(--on-primary)" : "var(--primary)" }}
            />
          )}
          {t.label}
        </button>
      ))}
    </div>
  );
}
