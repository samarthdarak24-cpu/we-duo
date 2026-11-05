import { createSavedSearchForBuyer, deleteSavedSearchForBuyer, getSavedSearchesFor } from "@/lib/server/data";
import { created, fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = requireRole(req, "buyer");
  if (!guard.ok) return guard.response;
  return ok(getSavedSearchesFor(guard.user.sub));
}

/** POST /api/v1/saved-searches — body { name, filters, alertsEnabled } */
export async function POST(req: Request) {
  const guard = requireRole(req, "buyer");
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as { name?: string; filters?: Record<string, unknown>; alertsEnabled?: boolean } | null;
  if (!body) return fail(400, "VALIDATION_FAILED", "A JSON body is required.");
  const result = createSavedSearchForBuyer(guard.user.sub, { name: body.name ?? "", filters: body.filters ?? {}, alertsEnabled: body.alertsEnabled });
  if (!result.ok) return fail(400, result.code, result.message);
  return created(result);
}

/** DELETE /api/v1/saved-searches?id=... */
export async function DELETE(req: Request) {
  const guard = requireRole(req, "buyer");
  if (!guard.ok) return guard.response;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return fail(400, "VALIDATION_FAILED", "id is required");
  return ok(deleteSavedSearchForBuyer(guard.user.sub, id));
}
