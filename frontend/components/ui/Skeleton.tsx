import { cn } from "@/lib/cn";

/** Shimmer primitives — `loading:` is never a bare word or an empty box. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("skeleton block rounded-pill", className)} />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <span aria-hidden className={cn("block space-y-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="skeleton block h-3 rounded-pill" style={{ width: `${100 - i * 9}%` }} />
      ))}
    </span>
  );
}

export function SkeletonStat({ label }: { label: string }) {
  return (
    <div className="card space-y-2 p-4">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-7 w-14" />
      <span className="sr-only">Loading {label}</span>
    </div>
  );
}

export function SkeletonCard({ avatar = false }: { avatar?: boolean }) {
  return (
    <div className="card flex items-start gap-3 p-4">
      {avatar && <Skeleton className="h-10 w-10 shrink-0 rounded-full" />}
      <span className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/5" />
        <SkeletonText lines={2} />
      </span>
    </div>
  );
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card divide-y divide-border overflow-hidden">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <SkeletonText lines={2} className="flex-1" />
          <Skeleton className="h-6 w-20 shrink-0" />
        </div>
      ))}
    </div>
  );
}
