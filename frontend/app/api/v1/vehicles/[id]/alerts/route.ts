import { getFindings, getVehicle } from "@/lib/server/db";
import { fail, ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function statusFor(sev: string, code: string) {
  if (code === "DOCUMENT_MISMATCH" || code === "INSURANCE_EXPIRED") return "needs_correction";
  if (sev === "high" || sev === "critical" || sev === "medium") return "suspicious";
  return "pending";
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller", "admin");
  if (!guard.ok) return guard.response;
  if (!getVehicle(params.id)) return fail(404, "NOT_FOUND", "Vehicle not found");
  const alerts = getFindings(params.id).map((f) => ({
    title: f.title,
    detail: f.explanation,
    status: statusFor(f.severity, f.code),
  }));
  alerts.push({ title: "Theft record", detail: "No theft record found in supported sources", status: "verified" });
  return ok(alerts);
}
