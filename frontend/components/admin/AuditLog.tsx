"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { EmptyState } from "@/components/shared/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";

interface AuditRow {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  ip: string | null;
  at: string;
  before: string | null;
  after: string | null;
}

interface Facet {
  action: string;
  c: number;
}

interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

const tone: Record<string, string> = {
  login: "bg-success-bg text-success",
  logout: "bg-bg text-muted",
  create: "bg-[#B99A60]/12 text-primary",
  update: "bg-warning-bg text-warning",
  delete: "bg-danger-bg text-danger",
  verify: "bg-success-bg text-success",
  reject: "bg-danger-bg text-danger",
};

function toneFor(action: string) {
  const key = Object.keys(tone).find((k) => action.toLowerCase().includes(k));
  return key ? tone[key] : "bg-bg text-muted";
}

function diffCount(row: AuditRow) {
  if (!row.before && !row.after) return 0;
  try {
    const b = row.before ? Object.keys(JSON.parse(row.before)).length : 0;
    const a = row.after ? Object.keys(JSON.parse(row.after)).length : 0;
    return Math.max(b, a);
  } catch {
    return 0;
  }
}

export function AuditLog({ actors }: { actors: { id: string; name: string }[] }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [facets, setFacets] = useState<Facet[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    const q = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (action) q.set("action", action);
    if (actor) q.set("actor", actor);
    const res = await fetch(`/api/v1/admin/audit?${q.toString()}`);
    const json = (await res.json().catch(() => ({}))) as {
      data?: { items: AuditRow[]; page: PageMeta; facets: Facet[] };
      error?: { message?: string };
    };
    setBusy(false);
    if (!res.ok || !json.data) {
      setError(json.error?.message ?? "Could not load the audit trail.");
      return;
    }
    setRows(json.data.items);
    setMeta(json.data.page);
    setFacets(json.data.facets);
  }, [action, actor, page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="text-card-title font-bold text-ink">Audit trail</h2>
        <span className="pill bg-bg text-muted">
          <Icon name="History" size={12} /> {meta?.total ?? 0} entries
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by action"
            className="rounded-pill border border-border bg-surface-tint px-3 py-1.5 text-caption text-ink outline-none focus:border-primary"
          >
            <option value="">All actions</option>
            {facets.map((f) => (
              <option key={f.action} value={f.action}>
                {f.action} ({f.c})
              </option>
            ))}
          </select>
          <select
            value={actor}
            onChange={(e) => {
              setActor(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by actor"
            className="rounded-pill border border-border bg-surface-tint px-3 py-1.5 text-caption text-ink outline-none focus:border-primary"
          >
            <option value="">All actors</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => void load()}
            disabled={busy}
            className="rounded-pill border border-border px-3 py-1.5 text-caption font-semibold text-muted hover:bg-surface-tint disabled:opacity-40"
          >
            <Icon name="RefreshCw" size={12} /> Refresh
          </button>
        </div>
      </div>

      {error && <p className="mx-4 mt-3 rounded-pill bg-danger-bg px-4 py-2 text-caption font-semibold text-danger">{error}</p>}

      {busy && !rows.length ? (
        <SkeletonRows rows={6} />
      ) : !rows.length ? (
        <EmptyState
          icon="FileText"
          title="No matching audit entries"
          detail="Every privileged action writes an append-only audit row. Clear the filters to see the full trail."
          action={
            <button
              onClick={() => {
                setAction("");
                setActor("");
                setPage(1);
              }}
              className="mt-1 rounded-pill border border-border px-3 py-1.5 text-caption font-semibold text-muted hover:bg-surface-tint"
            >
              Clear filters
            </button>
          }
        />
      ) : (
        <div className="divide-y divide-border">
          {rows.map((r) => {
            const expanded = open === r.id;
            return (
              <div key={r.id}>
                <button
                  onClick={() => setOpen(expanded ? null : r.id)}
                  className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left hover:bg-surface-tint"
                >
                  <span className={cn("pill", toneFor(r.action))}>{r.action}</span>
                  <span className="text-caption font-semibold text-ink">
                    {actors.find((a) => a.id === r.actor_id)?.name ?? r.actor_id ?? "system"}
                  </span>
                  <span className="text-caption text-muted">
                    {r.entity_type ? `${r.entity_type}${r.entity_id ? ` · ${r.entity_id}` : ""}` : "no entity"}
                  </span>
                  {diffCount(r) > 0 && (
                    <span className="text-[10px] text-muted">{diffCount(r)} field(s) captured</span>
                  )}
                  <span className="ml-auto text-[11px] text-muted">{new Date(r.at).toLocaleString("en-IN")}</span>
                  <Icon name="ChevronDown" size={13} className={cn("text-muted", expanded && "rotate-180")} />
                </button>
                {expanded && (
                  <div className="grid grid-cols-1 gap-2 bg-surface-tint px-4 py-3 sm:grid-cols-2">
                    {[
                      { label: "Before", value: r.before },
                      { label: "After", value: r.after },
                    ].map((side) => (
                      <div key={side.label}>
                        <div className="text-[10px] uppercase tracking-wide text-muted">{side.label}</div>
                        <pre className="mt-1 max-h-40 overflow-auto rounded-card border border-border bg-bg p-2 text-[11px] leading-relaxed text-ink">
                          {side.value ? JSON.stringify(JSON.parse(side.value), null, 2) : "—"}
                        </pre>
                      </div>
                    ))}
                    <p className="text-[11px] text-muted sm:col-span-2">
                      id {r.id} · ip {r.ip ?? "not recorded"} · rows are append-only and cannot be edited or removed.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={!meta.hasPrev || busy}
            className="rounded-pill border border-border px-3 py-1.5 text-caption font-semibold text-muted hover:bg-surface-tint disabled:opacity-40"
          >
            <Icon name="ArrowLeft" size={12} /> Previous
          </button>
          <span className="text-caption text-muted">
            Page {meta.page} of {meta.totalPages} · {meta.total} entries
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!meta.hasNext || busy}
            className="rounded-pill border border-border px-3 py-1.5 text-caption font-semibold text-muted hover:bg-surface-tint disabled:opacity-40"
          >
            Next <Icon name="ChevronRight" size={12} />
          </button>
        </div>
      )}
    </section>
  );
}
