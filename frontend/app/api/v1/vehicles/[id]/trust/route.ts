import { ensureTrustScoreSnapshot } from "@/lib/server/data";
import { getTrustScoreHistory } from "@/lib/server/db-intelligence";
import { getVehicle } from "@/lib/server/db";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  // Admin is included: RBAC_MATRIX.md grants moderation staff the verification
  // summary, and the review queue cannot explain a hold without the score.
  const guard = requireRole(req, "buyer", "seller", "admin");
  if (!guard.ok) return guard.response;
  if (!getVehicle(params.id)) return fail(404, "NOT_FOUND", "Vehicle not found");
  // Every read persists an immutable snapshot when the scored state changed.
  // The score is deterministic; the caller id is recorded for audit provenance.
  const snapshot = ensureTrustScoreSnapshot(params.id, guard.user.sub);
  const history = getTrustScoreHistory(params.id, 10).map((row) => ({
    id: row.id,
    score: row.score,
    band: row.band,
    version: row.version,
    method: row.method,
    evidenceCoverage: row.evidence_coverage,
    computedAt: row.computed_at,
  }));
  return ok({
    ...snapshot.trust,
    snapshot: { id: snapshot.id, created: snapshot.created, computedAt: snapshot.computedAt },
    history,
  });
}
