/** Format an integer rupee amount with Indian digit grouping (₹ 26,00,000). */
export function formatINR(amount: number): string {
  return "₹ " + new Intl.NumberFormat("en-IN").format(amount);
}

/** Compact rupee with L/Cr suffix for tight spaces (₹26L, ₹5.8L). */
export function formatINRCompact(amount: number): string {
  if (amount >= 10_000_000) {
    return "₹" + (amount / 10_000_000).toFixed(2).replace(/\.?0+$/, "") + "Cr";
  }
  if (amount >= 100_000) {
    return "₹" + (amount / 100_000).toFixed(1).replace(/\.0$/, "") + "L";
  }
  return formatINR(amount);
}

/** Format kilometres with Indian grouping + "km". */
export function formatKm(km: number): string {
  return new Intl.NumberFormat("en-IN").format(km) + " km";
}

const MONTHS_UTC = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Calendar date from UTC parts so server markup equals client markup.
 * `toLocaleDateString()` reads the runtime locale and zone, which differs
 * between the render and hydration pass and breaks React hydration.
 */
export function formatDateUTC(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getUTCDate()} ${MONTHS_UTC[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Relative time label (e.g. "2h ago", "4h ago"). */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
