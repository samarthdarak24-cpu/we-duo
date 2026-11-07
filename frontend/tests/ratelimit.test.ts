import { describe, expect, it } from "vitest";
import { enforceRateLimit } from "../lib/server/ratelimit";
import { getDb } from "../lib/server/db";

function req(ip: string) {
  return new Request("http://localhost/api/test", {
    headers: { "x-forwarded-for": ip },
  });
}

function unique(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describe("shared rate limiter", () => {
  it("blocks after the limit and persists hits in the shared database", async () => {
    const bucket = unique("test-bucket");
    const ip = unique("test-ip");
    const opts = { limit: 2, windowMs: 60_000 };

    expect(enforceRateLimit(req(ip), bucket, opts)).toBeNull();
    expect(enforceRateLimit(req(ip), bucket, opts)).toBeNull();

    const limited = enforceRateLimit(req(ip), bucket, opts);
    expect(limited).not.toBeNull();
    expect(limited!.status).toBe(429);
    expect(limited!.headers.get("Retry-After")).toBeTruthy();
    const body = await limited!.json();
    expect(body.error.code).toBe("RATE_LIMITED");

    const row = getDb()
      .prepare("SELECT COUNT(*) AS c FROM rate_limit_hits WHERE bucket = ? AND subject = ?")
      .get(bucket, ip) as { c: number };
    expect(row.c).toBe(2);
  });

  it("keeps buckets and client addresses independent", () => {
    const ip = unique("test-ip");
    const first = unique("bucket-a");
    const second = unique("bucket-b");
    const opts = { limit: 1, windowMs: 60_000 };

    expect(enforceRateLimit(req(ip), first, opts)).toBeNull();
    expect(enforceRateLimit(req(ip), first, opts)?.status).toBe(429);
    // Same IP, different bucket: still allowed.
    expect(enforceRateLimit(req(ip), second, opts)).toBeNull();
    // Same bucket, different IP: still allowed.
    expect(enforceRateLimit(req(unique("other-ip")), first, opts)).toBeNull();
  });

  it("can be configured to reject the very first request", () => {
    const limited = enforceRateLimit(req(unique("test-ip")), unique("zero-bucket"), {
      limit: 0,
      windowMs: 60_000,
    });
    expect(limited?.status).toBe(429);
  });
});
