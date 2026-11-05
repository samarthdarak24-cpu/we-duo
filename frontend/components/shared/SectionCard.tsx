import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * One surface, one job. Use SectionCard instead of nesting `.card` inside
 * `.card`; the body is intentionally padding-free so sections can own their
 * own rhythm (lists flush to the edge, charts with their own inset).
 */
export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
  flush = false,
  id,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  flush?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className={cn("card overflow-hidden", className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="td-h2">{title}</h2>}
            {description && <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={cn(flush ? "" : "p-5", bodyClassName)}>{children}</div>
    </section>
  );
}
