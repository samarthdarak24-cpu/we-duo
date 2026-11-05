// ---------------------------------------------------------------------------
// Per-IP, per-bucket sliding-window rate limiting (design.md §13).
// In-process by design: one Next.js instance. A multi-instance deployment must
// move this to the gateway/Redis; the response contract stays the same.
// ---------------------------------------------------------------------------
import { NextResponse } from "next/server";

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

const buckets = new Map<string, number[]>();
let lastSweep = 0;
const SWEEP_EVERY_MS = 60_000;
const MAX_AGE_MS = 5 * 60_000;

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || "local";
}

function sweep(now: number) {
  if (now - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = now;
  for (const [key, hits] of buckets) {
    const keep = hits.filter((t) => now - t < MAX_AGE_MS);
    if (keep.length) buckets.set(key, keep);
    else buckets.delete(key);
  }
}

/** Returns a 429 response when the bucket is exhausted, otherwise null. */
export function enforceRateLimit(req: Request, bucket: string, opts: RateLimitOptions): NextResponse | null {
  const now = Date.now();
  sweep(now);
  const key = `${bucket}:${clientIp(req)}`;
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < opts.windowMs);
  if (hits.length >= opts.limit) {
    const retryAfter = Math.max(1, Math.ceil((opts.windowMs - (now - hits[0])) / 1000));
    const res = NextResponse.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: `Too many requests. Try again in ${retryAfter} second${retryAfter === 1 ? "" : "s"}.`,
        },
      },
      { status: 429 }
    );
    res.headers.set("Retry-After", String(retryAfter));
    return res;
  }
  hits.push(now);
  buckets.set(key, hits);
  return null;
}

export const LIMITS = {
  /** Credential endpoints: slow down guessing. */
  auth: { limit: 12, windowMs: 60_000 },
  /** Cheap reads (search, marketplace). */
  read: { limit: 120, windowMs: 60_000 },
  /** Mutations: uploads, verification runs, publishing. */
  write: { limit: 45, windowMs: 60_000 },
  /** PDF generation/download. */
  report: { limit: 12, windowMs: 60_000 },
} as const;
