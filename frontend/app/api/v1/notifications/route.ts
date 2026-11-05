import { getNotificationsOffsetPageFor, getNotificationsPageFor } from "@/lib/server/data";
import {
  countNotifications,
  getUnreadCount,
  markAllNotificationsRead,
} from "@/lib/server/db";
import { readPageParams } from "@/lib/server/pagination";
import { ok, requireRole } from "@/lib/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/notifications
 *
 * Two supported shapes:
 *   * offset: `?page=2&pageSize=20` → `{ items, page: { page, pageSize, total, totalPages, hasNext, hasPrev } }`
 *   * keyset: `?limit=20&before=<createdAt>` → `{ items, nextBefore, hasMore }`
 *
 * `unread=1` filters in SQL (not after slicing), so the page size and total stay
 * correct. This matches the audit/marketplace pagination contract.
 */
export async function GET(req: Request) {
  const guard = requireRole(req);
  if (!guard.ok) return guard.response;
  const url = new URL(req.url);
  const unreadOnly = url.searchParams.get("unread") === "1";
  const before = url.searchParams.get("before");
  const unread = getUnreadCount(guard.user.sub);

  if (before) {
    const limit = Number(url.searchParams.get("limit") ?? 20);
    const page = getNotificationsPageFor(
      guard.user.sub,
      Number.isFinite(limit) ? limit : 20,
      before
    );
    return ok({
      ...page,
      items: unreadOnly ? page.items.filter((n) => !n.read) : page.items,
      unread,
      mode: "keyset",
    });
  }

  const { page, pageSize, offset } = readPageParams(url, { pageSize: 20 });
  const total = countNotifications(guard.user.sub, unreadOnly);
  const items = getNotificationsOffsetPageFor(guard.user.sub, pageSize, offset, unreadOnly);

  return ok({
    items,
    unread,
    mode: "offset",
    page: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      hasNext: offset + items.length < total,
      hasPrev: page > 1,
    },
  });
}

/** POST /api/v1/notifications — mark all read (also exposed at /read-all). */
export async function POST(req: Request) {
  const guard = requireRole(req);
  if (!guard.ok) return guard.response;
  markAllNotificationsRead(guard.user.sub);
  return ok({ read: true });
}
