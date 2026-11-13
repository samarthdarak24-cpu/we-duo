// ---------------------------------------------------------------------------
// Public platform counters.
//
// design.md §0.3 and AGENTS.md §1.5: every number shown to visitors must come
// from the shared database, never from a constant. These counters are used by
// public marketing sections so a freshly-seeded or production database always
// shows its own real figures.
// ---------------------------------------------------------------------------
import { getDb } from "./db";

export type PublicPlatformStats = {
  /** Vehicles registered in this workspace. */
  vehicles: number;
  /** Listings currently visible in the public marketplace. */
  publishedListings: number;
  /** Documents with a stored SHA-256 integrity hash (integrity, not authenticity). */
  hashedDocuments: number;
  /** Verification runs recorded on the platform. */
  verificationRuns: number;
};

export function getPublicPlatformStats(): PublicPlatformStats {
  const conn = getDb();
  const count = (sql: string, ...params: (string | number)[]): number => {
    const row = conn.prepare(sql).get(...params) as { c?: number } | undefined;
    return Number(row?.c ?? 0);
  };
  return {
    vehicles: count("SELECT COUNT(*) AS c FROM vehicles"),
    publishedListings: count("SELECT COUNT(*) AS c FROM listings WHERE status = 'published'"),
    hashedDocuments: count(
      "SELECT COUNT(*) AS c FROM documents WHERE deleted_at IS NULL AND sha256 IS NOT NULL AND sha256 <> ''"
    ),
    verificationRuns: count("SELECT COUNT(*) AS c FROM verification_runs"),
  };
}
