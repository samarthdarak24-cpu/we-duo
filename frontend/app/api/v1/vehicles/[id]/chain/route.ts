import { getChainStatus } from "@/lib/server/data";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/vehicles/:id/chain — hash chain + integrity verification. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller", "admin");
  if (!guard.ok) return guard.response;
  const status = getChainStatus(params.id);
  if (!status.records) return fail(404, "NO_RECORDS", "No chain records for this vehicle");
  return ok(status);
}
