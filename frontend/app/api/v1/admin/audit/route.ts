import { countAuditLogs, getAuditFacets, getAuditPage } from "@/lib/server/db-intelligence";
import { readPageParams } from "@/lib/server/pagination";
import { ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/audit?action=&actor=&page=&pageSize=
 *
 * Admin-only read of the append-only audit trail. Pagination happens in SQL
 * (`LIMIT/OFFSET`), so the response stays correct as the log grows.
 *
 * Response: `{ items, page: { page, pageSize, total, totalPages, hasNext, hasPrev }, facets }`
 */
export async function GET(req: Request) {
  const guard = requireRole(req, "admin");
  if (!guard.ok) return guard.response;

  const url = new URL(req.url);
  const filter = {
    action: url.searchParams.get("action") || undefined,
    actor: url.searchParams.get("actor") || undefined,
  };
  const { page, pageSize, offset } = readPageParams(url, { pageSize: 50 });

  const items = getAuditPage(pageSize, offset, filter);
  const total = countAuditLogs(filter);

  return ok({
    items,
    page: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      hasNext: offset + items.length < total,
      hasPrev: page > 1,
    },
    facets: getAuditFacets(),
  });
}
