import { getDocuments, getVehicle } from "@/lib/server/db";
import { computeCompleteness } from "@/lib/server/engine";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller");
  if (!guard.ok) return guard.response;
  if (!getVehicle(params.id)) return fail(404, "NOT_FOUND", "Vehicle not found");
  const docs = getDocuments(params.id);
  const percent = computeCompleteness(docs.map((d) => ({ type: d.type, status: d.status })));
  return ok({ percent, items: docs.map((d) => ({ type: d.type, status: d.status, consent: !!d.consent })) });
}
