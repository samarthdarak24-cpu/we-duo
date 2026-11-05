import { cn } from "@/lib/cn";
import { formatINRCompact } from "@/lib/format";

/**
 * Price range bar (Section 3.3). Marker = asking price vs estimated range.
 * `chip` conveys Fair / Above / Below market. A disclaimer is always shown.
 */
export function PriceRangeBar({
  low,
  high,
  marker,
  estimate,
  chip,
  note,
  disclaimer,
  className,
}: {
  low: number;
  high: number;
  marker: number;
  estimate?: number;
  chip?: { text: string; color: string; bg: string };
  note?: string;
  disclaimer?: string;
  className?: string;
}) {
  const span = high - low || 1;
  const pct = Math.max(0, Math.min(100, ((marker - low) / span) * 100));

  return (
    <div className={cn("w-full", className)}>
      {chip && (
        <div className="mb-3 flex items-center justify-between">
          <span className="pill" style={{ color: chip.color, background: chip.bg }}>
            {chip.text}
          </span>
          {estimate !== undefined && (
            <span className="text-card-title font-bold text-ink">{formatINRCompact(estimate)}</span>
          )}
        </div>
      )}

      <div className="relative h-2.5 w-full rounded-full bg-gradient-to-r from-[var(--info-bg)] via-[var(--surface)] to-[var(--success-bg)]">
        {/* Fair-price zone */}
        <div
          className="absolute inset-y-0 rounded-full bg-[var(--success-bg)]"
          style={{ left: `${Math.max(0, ((estimate ?? marker) - low) / span * 100 - 12)}%`, right: "12%" }}
        />
        {/* Marker */}
        <div
          className="absolute -top-1.5 h-5 w-5 -translate-x-1/2 rounded-full border-[3px] border-white shadow"
          style={{ left: `${pct}%`, background: "var(--primary)" }}
          aria-label={`Asking price marker at ${formatINRCompact(marker)}`}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-caption text-muted">
        <span>{formatINRCompact(low)}</span>
        <span>{formatINRCompact(high)}</span>
      </div>

      {note && <p className="mt-3 text-caption text-muted">{note}</p>}
      {disclaimer && (
        <p className="mt-1 text-[11px] leading-snug text-muted/80">
          <span className="font-semibold">Estimate:</span> {disclaimer}
        </p>
      )}
    </div>
  );
}
