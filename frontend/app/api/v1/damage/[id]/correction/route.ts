import { requestDamageCorrection } from "@/lib/server/data";
import { created, fail, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/v1/damage/:id/correction — creates a superseding pending record. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "seller");
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as { description?: string; repairStatus?: string } | null;
  if (!body?.description) return fail(400, "VALIDATION_FAILED", "description is required");
  const result = requestDamageCorrection(guard.user.sub, params.id, {
    description: body.description,
    repairStatus: body.repairStatus,
  });
  if (!result.ok) return fail(result.code === "NOT_FOUND" ? 404 : 403, result.code, result.message);
  return created(result);
}
