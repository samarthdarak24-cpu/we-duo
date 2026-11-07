// ---------------------------------------------------------------------------
// Per-IP, per-bucket sliding-window rate limiting (design.md §13).
//
// The authoritative store is the shared SQLite database (`rate_limit_hits`), so
// two Next.js processes / a restart cannot double the allowance. If the DB is
// unavailable (read-only volume, locked file, early boot), the limiter degrades
// to the previous in-process map instead of failing the request open-endedly.
// The response contract (429 + Retry-After) is identical in both modes.
//
// A multi-region deployment that splits the database must move this to a shared
// Redis/gateway; the table is deliberately tiny and easy to replace.
// ---------------------------------------------------------------------------
import { NextResponse } from "next/server";
import { getDb } from "./db";

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

interface Decision {
  limited: boolean;
  retryAfter: number;
}

// In-process fallback only. Keyed `bucket:ip`.
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

/**
 * Atomically count + record one hit in the shared table. Returns null when the
 * database cannot be used, so the caller can fall back to the in-memory map.
 */
function dbDecision(bucket: string, subject: string, now: number, opts: RateLimitOptions): Decision | null {
  let conn: ReturnType<typeof getDb>;
  try {
    conn = getDb();
  } catch {
    return null;
  }
  try {
    conn.exec("BEGIN IMMEDIATE");
    try {
      // Bounded cleanup: only rows older than the longest supported window.
      conn.prepare("DELETE FROM rate_limit_hits WHERE hit_at < ?").run(now - MAX_AGE_MS);
      const row = conn
        .prepare(
          `SELECT COUNT(*) AS hits, MIN(hit_at) AS oldest
             FROM rate_limit_hits
            WHERE bucket = ? AND subject = ? AND hit_at >= ?`
        )
        .get(bucket, subject, now - opts.windowMs) as { hits: number; oldest: number | null };
      if (row.hits >= opts.limit) {
        conn.exec("COMMIT");
        const oldest = row.oldest ?? now;
        return {
          limited: true,
          retryAfter: Math.max(1, Math.ceil((opts.windowMs - (now - oldest)) / 1000)),
        };
      }
      conn
        .prepare("INSERT INTO rate_limit_hits (bucket, subject, hit_at) VALUES (?, ?, ?)")
        .run(bucket, subject, now);
      conn.exec("COMMIT");
      return { limited: false, retryAfter: 0 };
    } catch (error) {
      try {
        conn.exec("ROLLBACK");
      } catch {
        /* transaction already closed */
      }
      throw error;
    }
  } catch {
    return null;
  }
}

function memoryDecision(key: string, now: number, opts: RateLimitOptions): Decision {
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < opts.windowMs);
  if (hits.length >= opts.limit) {
    const oldest = hits[0] ?? now;
    return {
      limited: true,
      retryAfter: Math.max(1, Math.ceil((opts.windowMs - (now - oldest)) / 1000)),
    };
  }
  hits.push(now);
  buckets.set(key, hits);
  return { limited: false, retryAfter: 0 };
}

function limitedResponse(retryAfter: number) {
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

/** Returns a 429 response when the bucket is exhausted, otherwise null. */
export function enforceRateLimit(req: Request, bucket: string, opts: RateLimitOptions): NextResponse | null {
  const now = Date.now();
  sweep(now);
  const subject = clientIp(req);
  const key = `${bucket}:${subject}`;
  const decision = dbDecision(bucket, subject, now, opts) ?? memoryDecision(key, now, opts);
  return decision.limited ? limitedResponse(decision.retryAfter) : null;
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
