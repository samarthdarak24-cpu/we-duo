// ---------------------------------------------------------------------------
// Shared pagination for collection endpoints.
//
// Two shapes are used across the API and both are documented here:
//   * offset pages  — browse/admin screens (`?page=2&pageSize=20`)
//   * keyset/cursor — infinite feeds (`?before=<sortKey>`, notifications)
// `paginate()` slices in memory; tables that can grow past a screenful and are
// read directly from SQL page at the query level instead (see getAuditPage).
// ---------------------------------------------------------------------------

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface Paged<T> {
  items: T[];
  page: PageMeta;
}

const MAX_PAGE_SIZE = 100;

export function readPageParams(url: URL, defaults: { page?: number; pageSize?: number } = {}) {
  const rawPage = Number(url.searchParams.get("page") ?? defaults.page ?? 1);
  const rawSize = Number(url.searchParams.get("pageSize") ?? url.searchParams.get("limit") ?? defaults.pageSize ?? 20);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const pageSize = Number.isFinite(rawSize) && rawSize > 0 ? Math.min(MAX_PAGE_SIZE, Math.floor(rawSize)) : 20;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** Slices a fully-materialised list and returns the envelope the API documents. */
export function paginate<T>(rows: T[], url: URL, defaults?: { page?: number; pageSize?: number }): Paged<T> {
  const { page, pageSize, offset } = readPageParams(url, defaults);
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const from = (clampedPage - 1) * pageSize;
  return {
    items: rows.slice(from, from + pageSize),
    page: {
      page: clampedPage,
      pageSize,
      total,
      totalPages,
      hasNext: clampedPage < totalPages,
      hasPrev: clampedPage > 1,
    },
  };
}
