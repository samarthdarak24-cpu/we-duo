import { randomUUID } from "node:crypto";
import { all, getVehicle, run } from "@/lib/server/db";
import { created, fail, ok, requireRole } from "@/lib/server/http";
import { LIMITS, enforceRateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ProviderCheckRow {
  id: string;
  provider: string;
  kind: string;
  status: string;
  fields_queried: string;
  result: string;
  checked_at: string;
}

/**
 * GET /api/v1/vehicles/:id/provider-checks
 * Every row states its provider and status; `unavailable` is reported as such.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller", "admin");
  if (!guard.ok) return guard.response;
  if (!getVehicle(params.id)) return fail(404, "NOT_FOUND", "Vehicle not found");
  const rows = all<ProviderCheckRow>(
    "SELECT * FROM provider_checks WHERE vehicle_id = ? ORDER BY checked_at DESC LIMIT 50",
    params.id
  );
  return ok({
    items: rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      kind: r.kind,
      status: r.status,
      fieldsQueried: JSON.parse(r.fields_queried || "[]"),
      result: JSON.parse(r.result || "{}"),
      checkedAt: r.checked_at,
    })),
    configured: Boolean(process.env.TD_PROVIDER_URL),
    note: process.env.TD_PROVIDER_URL
      ? "Checks are performed by the configured provider. Results are stored exactly as returned."
      : "No external provider is configured. Checks return `unavailable` and never a clean result.",
  });
}

/**
 * POST /api/v1/vehicles/:id/provider-checks — admin-only provider query.
 * Without TD_PROVIDER_URL the check is recorded as unavailable, not as clean.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const limited = enforceRateLimit(req, "provider-check", LIMITS.write);
  if (limited) return limited;
  const guard = requireRole(req, "admin");
  if (!guard.ok) return guard.response;
  if (!getVehicle(params.id)) return fail(404, "NOT_FOUND", "Vehicle not found");

  const body = (await req.json().catch(() => ({}))) as { kind?: string; fields?: string[] };
  const kind = body.kind === "insurance" ? "insurance" : "theft";
  const fields = Array.isArray(body.fields) ? body.fields.slice(0, 10).map(String) : ["registrationNumber", "vin"];
  const url = process.env.TD_PROVIDER_URL?.trim();
  const id = `pc-${randomUUID()}`;
  const now = new Date().toISOString();

  let provider = "not_configured";
  let status = "unavailable";
  let result: Record<string, unknown> = {
    reason: "No provider is configured for this deployment.",
    fieldsQueried: fields,
  };

  if (url) {
    provider = process.env.TD_PROVIDER_NAME?.trim() || "external";
    try {
      const vehicle = getVehicle(params.id)!;
      const res = await fetch(`${url.replace(/\/$/, "")}/checks/${kind}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(process.env.TD_PROVIDER_TOKEN ? { authorization: `Bearer ${process.env.TD_PROVIDER_TOKEN}` } : {}),
        },
        body: JSON.stringify({ registrationNumber: vehicle.reg_no, vin: vehicle.vin, fields }),
        signal: AbortSignal.timeout(10_000),
      });
      const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      status = res.ok ? (typeof payload.status === "string" ? payload.status : "completed") : "error";
      result = res.ok ? payload : { reason: `Provider returned ${res.status}.`, payload };
    } catch (error) {
      status = "error";
      result = { reason: `Provider request failed: ${(error as Error).message}` };
    }
  }

  run(
    "INSERT INTO provider_checks (id, vehicle_id, provider, kind, request_ref, status, fields_queried, result, checked_at) VALUES (?,?,?,?,?,?,?,?,?)",
    id,
    params.id,
    provider,
    kind,
    null,
    status,
    JSON.stringify(fields),
    JSON.stringify(result),
    now
  );
  const payload = { id, provider, kind, status, fieldsQueried: fields, result, checkedAt: now };
  return status === "unavailable" ? ok(payload) : created(payload);
}
