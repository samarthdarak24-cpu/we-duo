"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { SectionCard } from "@/components/shared/SectionCard";
import { apiCall } from "@/lib/client/api";

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

interface Finding {
  id: string;
  title: string;
  severity: string;
  explanation?: string | null;
  evidence?: string[];
  method?: string | null;
  modelVersion?: string | null;
  confidence?: number | null;
  recommendation?: string | null;
}

interface Result {
  id: string;
  investigationId?: string;
  answer: string;
  citations: Citation[];
  findings: Finding[];
  trust: { score: number; coverage: number };
  engine: string;
  status: string;
  disclaimer: string;
  graph?: string;
  orchestrator?: string;
  checkpointing?: boolean;
  nodes?: string[];
  humanReview?: { required?: boolean; id?: string | null; policy?: string };
  modelVersions?: Record<string, string>;
  limitations?: string[];
  fallbackReason?: string;
  source?: string;
}

const severityTone: Record<string, string> = {
  high: "var(--danger)",
  medium: "var(--warning)",
  low: "var(--muted)",
};

function orchestratorLabel(orchestrator?: string) {
  if (orchestrator === "langgraph") return "LangGraph 15/16-node conditional graph";
  if (orchestrator === "sequential-fallback") return "15/16-node conditional sequential fallback (LangGraph not installed)";
  if (orchestrator === "deterministic-next") return "Next.js deterministic fallback (agent unavailable)";
  return "Orchestrator not reported";
}

/**
 * Runs the real 15/16-node conditional evidence investigator (Python intelligence service)
 * and shows its persisted runs. The agent explains stored evidence; it never
 * clears a finding, sets the trust score or certifies a vehicle. If the agent
 * cannot answer, the payload says so and the Next.js deterministic review runs
 * in its place — both are labelled.
 */
export function InvestigationPanel({ vehicleId }: { vehicleId: string }) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await apiCall<{ items?: Run[] }>(
      `/api/v1/vehicles/${vehicleId}/ai-investigations`,
      { cache: "no-store" },
      "Could not load the investigation runs."
    );
    if (r.ok && r.data?.items) {
      setRuns(r.data.items);
      setError(null);
    } else if (!r.ok) {
      setError(r.message);
    }
    setLoading(false);
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

  const humanReview = result?.humanReview;

  return (
    <SectionCard
      title="AI investigation"
      description="15/16-node conditional evidence review over stored records: findings, citations, conflicts and missing data. It cannot approve a document, clear a finding or set the trust score."
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
            <span className="td-chip" title={result.engine}>{result.engine}</span>
            <span
              className="td-chip"
              style={{
                color: result.orchestrator === "langgraph" ? "var(--success)" : "var(--warning)",
              }}
            >
              {orchestratorLabel(result.orchestrator)}
            </span>
            {result.status === "awaiting_review" && (
              <span className="td-chip" style={{ color: "var(--warning)" }}>awaiting human review</span>
            )}
          </div>

          {result.investigationId && (
            <p className="mt-2 font-mono text-[10.5px] text-muted">investigation: {result.investigationId}</p>
          )}

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

          {!!result.nodes?.length && (
            <div className="mt-4">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                Node timeline ({result.nodes.length}/{result.nodes.length})
              </p>
              <ol className="grid gap-1 sm:grid-cols-2">
                {result.nodes.map((node, index) => (
                  <li key={`${node}-${index}`} className="flex items-center gap-2 text-[11px] text-muted">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--success-bg)] text-[9px] font-semibold text-[var(--success)]">
                      {index + 1}
                    </span>
                    <span className="font-mono">{node}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {humanReview?.required && (
            <div className="mt-4 rounded-[10px] border px-3 py-2"
                 style={{ borderColor: "color-mix(in srgb, var(--warning) 35%, var(--border))" }}>
              <p className="text-[12px] font-semibold text-[var(--warning)]">Human review required</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                {humanReview.policy ?? "High-impact unresolved findings are held for authorised human review."}
                {humanReview.id ? ` Review queue: ${humanReview.id}.` : ""}
              </p>
            </div>
          )}

          {!!result.findings.length && (
            <div className="mt-4">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                Detected anomalies
              </p>
              <ul className="space-y-2">
                {result.findings.map((f) => (
                  <li key={f.id} className="rounded-[10px] border border-border bg-surface px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={{ color: severityTone[f.severity] ?? "var(--muted)" }}
                      >
                        {f.severity}
                      </span>
                      <span className="text-[12px] font-semibold text-ink">{f.title}</span>
                      {typeof f.confidence === "number" && (
                        <span className="text-[10px] text-muted">confidence {Math.round(f.confidence * 100)}%</span>
                      )}
                    </div>
                    {f.explanation && (
                      <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{f.explanation}</p>
                    )}
                    {!!f.evidence?.length && (
                      <p className="mt-1 font-mono text-[10px] text-muted">evidence: {f.evidence.join(", ")}</p>
                    )}
                    <p className="mt-1 text-[10px] text-muted">
                      {f.method ?? "method not reported"}
                      {f.modelVersion ? ` · model ${f.modelVersion}` : ""}
                    </p>
                    {f.recommendation && (
                      <p className="mt-1 text-[11px] text-ink">Next: {f.recommendation}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!!result.limitations?.length && (
            <div className="mt-4">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Limitations</p>
              <ul className="list-disc pl-4 text-[11px] leading-relaxed text-muted">
                {result.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {result.fallbackReason && (
            <p className="mt-3 rounded-[8px] border border-border px-2.5 py-1.5 text-[10.5px] text-muted">
              Agent unavailable: {result.fallbackReason}
            </p>
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
