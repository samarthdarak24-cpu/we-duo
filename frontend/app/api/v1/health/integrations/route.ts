import { requireRole, ok } from "@/lib/server/http";
import { storageHealth } from "@/lib/server/files";
import { getScannerStatus } from "@/lib/server/scan";
import { getMailerStatus, getSmsStatus } from "@/lib/server/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/health/integrations — admin-only, live integration disclosure.
 *
 * Reports what is actually configured and reachable. A provider that is not
 * configured is shown as `configured:false`; nothing is labelled "working"
 * without a live probe. Secrets are never returned.
 */
export async function GET(req: Request) {
  const guard = requireRole(req, "admin");
  if (!guard.ok) return guard.response;

  const [storage, scanner] = await Promise.all([storageHealth(), getScannerStatus()]);
  return ok({
    database: {
      provider: process.env.TD_DB_URL?.startsWith("postgres") ? "postgres" : "sqlite",
      shared: true,
    },
    storage,
    scanner,
    email: getMailerStatus(),
    sms: getSmsStatus(),
    intelligence: {
      configured: Boolean(process.env.TD_INTELLIGENCE_URL),
      endpoint: process.env.TD_INTELLIGENCE_URL ?? null,
    },
    checkedAt: new Date().toISOString(),
  });
}
