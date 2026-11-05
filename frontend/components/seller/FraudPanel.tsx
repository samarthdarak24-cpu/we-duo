"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { RiskGauge } from "@/components/ui/RiskGauge";
import { SectionCard } from "@/components/shared/SectionCard";
import { InlineAlert } from "@/components/shared/InlineAlert";

export interface FindingView {
  id: string;
  code: string;
  severity: string;
  title: string;
  explanation: string;
  recommendation: string;
  status: string;
  points: number;
  createdAt: string;
  evidence?: Record<string, unknown>;
}

const severityStyle: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: "Critical", color: "var(--danger)", bg: "var(--danger-bg)" },
  high: { label: "High", color: "var(--danger)", bg: "var(--danger-bg)" },
  medium: { label: "Medium", color: "var(--warning)", bg: "var(--warning-bg)" },
  low: { label: "Low", color: "var(--muted)", bg: "var(--surface-tint)" },
};

export function FraudPanel({
  vehicleName,
  regNo,
  riskScore,
  bandLabel,
  findings,
  recommendedAction,
  disclaimer,
  documents,
}: {
  vehicleName: string;
  regNo: string;
  riskScore: number;
  bandLabel: string;
  findings: FindingView[];
  recommendedAction: string;
  disclaimer: string;
  documents: { id: string; type: string; file_name: string; status: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(findings[0]?.id ?? null);
  const [disputeFor, setDisputeFor] = useState<string | null>(null);
  const [explanation, setExplanation] = useState("");
  const [evidence, setEvidence] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const openCount = findings.filter((f) => f.status !== "cleared").length;
  const bySeverity = (sev: string) => findings.filter((f) => f.severity === sev).length;

  async function submitDispute() {
    if (!disputeFor) return;
    if (explanation.trim().length < 10) {
      setError("Please explain the context (at least 10 characters).");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/v1/findings/${disputeFor}/dispute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ explanation: explanation.trim(), evidenceDocumentIds: evidence }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    setBusy(false);
    if (!res.ok) {
      setError(json.error?.message ?? "Could not submit the dispute.");
      return;
    }
    setInfo("Dispute submitted. The finding stays open until an admin reviews it.");
    setDisputeFor(null);
    setExplanation("");
    setEvidence([]);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <SectionCard className="h-fit">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="td-eyebrow">Risk score</span>
            <RiskGauge risk={riskScore} />
            <p className="text-[14px] font-semibold text-ink">{bandLabel}</p>
            <p className="text-[11.5px] text-muted">Deterministic score · no LLM</p>
            <div className="mt-1 w-full rounded-[10px] border border-border bg-surface-tint px-3 py-2">
              <p className="truncate text-[12px] font-semibold text-ink">{vehicleName}</p>
              <p className="text-[11px] text-muted">{regNo}</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Findings"
          description={`${openCount} open finding${openCount === 1 ? "" : "s"} need investigation`}
          action={
            <div className="flex flex-wrap gap-1.5">
              {["critical", "high", "medium", "low"].map((s) => (
                <span key={s} className="pill" style={{ color: severityStyle[s].color, background: severityStyle[s].bg }}>
                  {severityStyle[s].label}: {bySeverity(s)}
                </span>
              ))}
            </div>
          }
        >
          <InlineAlert tone="info" title="Recommended next step" detail={recommendedAction} />
          <div className="mt-4 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {["critical", "high", "medium", "low"].map((s) => (
              <div key={s} className="rounded-[10px] border border-border bg-surface-tint px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em]" style={{ color: severityStyle[s].color }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: severityStyle[s].color }} />
                  {severityStyle[s].label}
                </div>
                <div className="mt-1 text-[20px] font-bold leading-none text-ink">{bySeverity(s)}</div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {(error || info) && (
        <div className="space-y-2" aria-live="polite">
          {error && <InlineAlert tone="danger" title="Action failed" detail={error} />}
          {info && <InlineAlert tone="success" title="Submitted" detail={info} />}
        </div>
      )}

      <div className="space-y-3">
        {findings.map((f) => {
          const sev = severityStyle[f.severity] ?? severityStyle.low;
          const isOpen = open === f.id;
          return (
            <article key={f.id} className="card overflow-hidden">
              <button
                onClick={() => setOpen(isOpen ? null : f.id)}
                aria-expanded={isOpen}
                className="flex w-full items-start gap-3 px-5 py-4 text-left transition hover:bg-surface-tint/50"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]" style={{ color: sev.color, background: sev.bg }}>
                  <Icon name={f.severity === "low" ? "CircleAlert" : "AlertTriangle"} size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold text-ink">{f.title}</span>
                    <span className="pill" style={{ color: sev.color, background: sev.bg }}>
                      {sev.label} · −{f.points} pts
                    </span>
                    <StatusBadge status={f.status} />
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted">{f.explanation}</span>
                  <span className="mt-1 block font-mono text-[11px] text-muted">{f.code}</span>
                </span>
                <Icon name="ChevronDown" size={18} className={cn("mt-1 shrink-0 text-muted transition", isOpen && "rotate-180")} />
              </button>

              {isOpen && (
                <div className="space-y-4 border-t border-border bg-surface-tint/40 px-5 py-4">
                  <div>
                    <div className="td-eyebrow mb-1">Recommended action</div>
                    <p className="text-[13px] leading-relaxed text-muted">{f.recommendation}</p>
                  </div>

                  {f.evidence && Object.keys(f.evidence).length > 0 && (
                    <div>
                      <div className="td-eyebrow mb-1">Evidence</div>
                      <pre className="td-scroll overflow-x-auto rounded-[10px] border border-border bg-surface p-3 font-mono text-[11px] leading-relaxed text-muted">
                        {JSON.stringify(f.evidence, null, 2)}
                      </pre>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => {
                        setDisputeFor(f.id);
                        setOpen(f.id);
                        setError(null);
                        setInfo(null);
                      }}
                      className="td-btn td-btn-secondary td-btn-sm"
                    >
                      <Icon name="MessageSquare" size={13} /> Add context / dispute
                    </button>
                    <span className="text-[11px] text-muted">An admin reviews disputes; verified records are never edited.</span>
                  </div>

                  {disputeFor === f.id && (
                    <div className="space-y-3 rounded-[12px] border border-border bg-surface p-4">
                      <label className="block">
                        <span className="td-label">Your explanation</span>
                        <textarea
                          value={explanation}
                          onChange={(e) => setExplanation(e.target.value)}
                          rows={3}
                          placeholder="e.g. The odometer was replaced by the service centre; invoice attached."
                          className="td-textarea"
                        />
                      </label>

                      {documents.length > 0 && (
                        <div>
                          <span className="td-label">Supporting documents</span>
                          <div className="mt-1 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                            {documents.map((d) => (
                              <label
                                key={d.id}
                                className="flex items-center gap-2 rounded-[8px] border border-border bg-surface-tint px-2.5 py-2 text-[11.5px] text-muted"
                              >
                                <input
                                  type="checkbox"
                                  checked={evidence.includes(d.id)}
                                  onChange={(e) =>
                                    setEvidence((list) => (e.target.checked ? [...list, d.id] : list.filter((x) => x !== d.id)))
                                  }
                                />
                                <span className="truncate">
                                  {d.type.toUpperCase()} · {d.file_name}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <button onClick={submitDispute} disabled={busy} className="td-btn td-btn-primary td-btn-sm">
                          {busy ? (
                            <>
                              <Icon name="Loader2" size={13} className="animate-spin" /> Submitting…
                            </>
                          ) : (
                            <>
                              <Icon name="Send" size={13} /> Submit dispute
                            </>
                          )}
                        </button>
                        <button onClick={() => setDisputeFor(null)} className="td-btn td-btn-ghost td-btn-sm">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}

        {!findings.length && (
          <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success-bg text-success">
              <Icon name="ShieldCheck" size={22} />
            </span>
            <p className="text-[14px] font-semibold text-ink">No open findings</p>
            <p className="max-w-md text-[12.5px] leading-relaxed text-muted">
              No anomalies were detected in the records available to the engine. This does not guarantee the vehicle has no hidden issues.
            </p>
          </div>
        )}
      </div>

      <p className="td-help">{disclaimer}</p>
      <p className="text-[11.5px] leading-relaxed text-muted">
        Findings are generated by deterministic rules from the records on file for {vehicleName} ({regNo}). They are warnings that need
        investigation — not proof of fraud.
      </p>
    </div>
  );
}
