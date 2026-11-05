import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  children,
  meta,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  children?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="td-eyebrow mb-1.5">{eyebrow}</p>}
        <h1 className="td-h1 break-words">{title}</h1>
        {subtitle && <p className="td-sub mt-1.5 max-w-3xl">{subtitle}</p>}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
