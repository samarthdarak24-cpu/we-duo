import { getAuth, ok } from "@/lib/server/http";
import { getAnchoringStatus } from "@/lib/server/anchoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/anchoring/status — honest capability report.
 *
 * Reports WHICH engine is active. It never claims an on-chain anchor exists
 * when no confirmed transaction does, and it never exposes the signing key.
 */
export async function GET(req: Request) {
  const auth = getAuth(req);
  if (!auth) {
    return new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "Authentication required." } }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return ok(getAnchoringStatus());
}
