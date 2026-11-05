"use client";

import { Icon } from "@/components/ui/Icon";

export function PrintButton({ label = "Print / Save as PDF" }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="flex items-center gap-1.5 rounded-pill bg-primary px-4 py-2.5 text-caption font-semibold text-[var(--on-primary)] hover:bg-primary-600"
    >
      <Icon name="FileDown" size={14} /> {label}
    </button>
  );
}
