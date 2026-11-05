import { getPricing, getVehicle } from "@/lib/server/db";
import { estimatePrice } from "@/lib/server/engine";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller");
  if (!guard.ok) return guard.response;
  const v = getVehicle(params.id);
  if (!v) return fail(404, "NOT_FOUND", "Vehicle not found");
  const stored = getPricing(params.id);
  if (stored) return ok({ low: stored.low, estimate: stored.estimate, high: stored.high, confidence: stored.confidence });
  const computed = estimatePrice({
    base: v.base_value,
    ageYears: new Date().getFullYear() - v.year,
    km: v.km_claimed,
    conditionScore: v.condition_score,
  });
  return ok({ ...computed, note: "Estimated from comparable vehicles." });
}
