"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { SectionCard } from "@/components/shared/SectionCard";

interface Run {
  id: string;
  status: string;
  graph: string;
  modelVersion: string;
  rulesetVersion: string;
  startedAt: string;
  finishedAt: string | null;
}

interface Citation {
  kind: string;
  id: string;
  label: string;
  detail: string;
}

interface Result {
  id: string;
  answer: string;
  citations: Citation[];
  findings: { id: string; title: string; severity: string }[];
  trust: { score: number; coverage: number };
  engine: string;
  status: string;
  disclaimer: string;
}

/**
 * Runs the deterministic 12-node evidence review and shows its persisted runs.
 * The agent explains stored evidence; it never clears a finding or sets the score.
 */
export function InvestigationPanel({ vehicleId }: { vehicleId: string }) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/vehicles/${vehicleId}/ai-investigations`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { data?: { items?: Run[] } };
      if (res.ok && json.data?.items) setRuns(json.data.items);
    } catch {
      /* keep the last list */
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/vehicles/${vehicleId}/ai-investigations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "Summarise the verified evidence and open findings." }),
      });
      const json = (await res.json().catch(() => ({}))) as { data?: Result; error?: { message?: string } };
      if (!res.ok || !json.data) {
        setError(json.error?.message ?? "Could not run the investigation.");
        return;
      }
      setResult(json.data);
      await load();
    } catch {
      setError("Network error — the investigation was not started.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      title="AI investigation"
      description="Deterministic review of stored evidence: findings, citations and missing data. It cannot approve a document or clear a finding."
      action={
        <button type="button" onClick={run} disabled={busy} className="td-btn td-btn-primary td-btn-sm">
          {busy ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Sparkles" size={14} />}
          {busy ? "Reviewing…" : "Run investigation"}
        </button>
      }
    >
      {error && (
        <p className="mb-3 rounded-[10px] border px-3 py-2 text-caption"
           style={{ borderColor: "color-mix(in srgb, var(--danger) 35%, var(--border))", color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {result && (
        <div className="mb-4 rounded-[12px] border border-border bg-surface-tint p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="td-chip">trust {result.trust.score}/100</span>
            <span className="td-chip">coverage {result.trust.coverage}%</span>
            <span className="td-chip">{result.findings.length} finding(s)</span>
            <span className="td-chip">{result.engine}</span>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-ink">{result.answer}</p>
          {!!result.citations.length && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {result.citations.slice(0, 8).map((c) => (
                <span key={`${c.kind}-${c.id}`} title={c.detail}
                      className="rounded-full border border-border bg-surface px-2 py-1 font-mono text-[10px] text-muted">
                  {c.kind}: {c.label}
                </span>
              ))}
            </div>
          )}
          <p className="mt-3 text-[10.5px] leading-relaxed text-muted">{result.disclaimer}</p>
        </div>
      )}

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Previous runs</p>
        {loading ? (
          <p className="text-caption text-muted">Loading runs…</p>
        ) : runs.length === 0 ? (
          <p className="text-caption text-muted">No investigation has been run for this vehicle yet.</p>
        ) : (
          <ul className="divide-y divide-border/70">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[12px]">
                <span className="font-mono text-[11px] text-muted">{r.id}</span>
                <span className="td-chip">{r.status}</span>
                <span className="text-muted">{r.graph}</span>
                <span className="text-muted">{new Date(r.startedAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}
