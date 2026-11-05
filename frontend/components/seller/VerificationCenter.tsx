"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StatCard } from "@/components/ui/StatCard";
import { SectionCard } from "@/components/shared/SectionCard";
import { InlineAlert } from "@/components/shared/InlineAlert";

export interface CheckRow {
  key: string;
  label: string;
  status: string;
  note: string;
  source: string;
}

export function VerificationCenter({
  vehicleId,
  checks,
  lastRun,
  chain,
  theft,
}: {
  vehicleId: string;
  checks: CheckRow[];
  lastRun: { id: string; status: string; finishedAt: string | null; summary: Record<string, unknown> } | null;
  chain: { records: number; intact: boolean; brokenAt?: number | null; latestHash: string | null };
  theft: { status: string; source: string; checkedAt: string } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const passed = checks.filter((c) => c.status === "verified").length;
  const needs = checks.length - passed;

  async function run() {
    setBusy(true);
    setError(null);
    setInfo(null);
    const res = await fetch(`/api/v1/vehicles/${vehicleId}/verify`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as {
      data?: { runId: string; summary?: { checks: number; passed: number; findings: number; newFindings: number } };
      error?: { message?: string };
    };
    setBusy(false);
    if (!res.ok || !json.data) {
      setError(json.error?.message ?? "Verification could not start.");
      return;
    }
    const s = json.data.summary;
    setInfo(`Run ${json.data.runId} complete — ${s?.passed ?? 0}/${s?.checks ?? 0} checks passed, ${s?.findings ?? 0} open finding(s).`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon="CheckCircle2" label="Checks passed" value={passed} hint={`of ${checks.length} supported checks`} tone="success" />
        <StatCard icon="AlertTriangle" label="Needs attention" value={needs} hint="Resolve before listing publicly" tone="warning" />
        <StatCard icon="ScanSearch" label="Total checks" value={checks.length} hint="Deterministic ruleset" tone="neutral" />
        <StatCard
          icon="ShieldCheck"
          label="Hash chain"
          value={chain.intact ? "Intact" : "Broken"}
          hint={`${chain.records} anchored record${chain.records === 1 ? "" : "s"}`}
          tone={chain.intact ? "success" : "danger"}
        />
      </div>

      <SectionCard
        title="Verification run"
        description="The engine recomputes completeness, identifier matches, duplicate hashes and mileage consistency."
        action={
          <button onClick={run} disabled={busy} className="td-btn td-btn-primary">
            <Icon name={busy ? "Loader2" : "RotateCw"} size={15} className={busy ? "animate-spin" : ""} />
            {busy ? "Running checks…" : "Re-run verification"}
          </button>
        }
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-muted">
          {lastRun ? (
            <>
              <span>
                Last run <span className="font-mono font-semibold text-ink">{lastRun.id}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                {lastRun.status}
              </span>
              {lastRun.finishedAt && <span>{new Date(lastRun.finishedAt).toLocaleString("en-IN")}</span>}
            </>
          ) : (
            <span>No verification run yet for this vehicle.</span>
          )}
          {theft && (
            <span className="td-chip">
              <Icon name="ShieldCheck" size={12} /> Theft source: {theft.source} · {theft.status.replace(/_/g, " ")}
            </span>
          )}
          {chain.latestHash && (
            <span className="td-chip font-mono">
              <Icon name="Layers" size={12} /> {chain.latestHash.slice(0, 12)}…
            </span>
          )}
        </div>

        {(error || info) && (
          <div className="mt-4 space-y-2" aria-live="polite">
            {error && <InlineAlert tone="danger" title="Verification failed" detail={error} />}
            {info && <InlineAlert tone="success" title="Run complete" detail={info} />}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Supported checks" description="Each check reports the source it used. A missing record is unverified coverage, not a pass." flush>
        <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-2">
          {checks.map((c) => (
            <div key={c.key} className="flex items-start justify-between gap-3 bg-surface px-5 py-4">
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold text-ink">{c.label}</div>
                <div className="mt-0.5 text-[12px] leading-relaxed text-muted">{c.note}</div>
                <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted">
                  <Icon name="Layers" size={11} /> Source: {c.source}
                </div>
              </div>
              <StatusBadge status={c.status} />
            </div>
          ))}
          {!checks.length && (
            <div className="col-span-full bg-surface px-5 py-12 text-center text-[13px] text-muted">
              No checks are available for this vehicle yet.
            </div>
          )}
        </div>
      </SectionCard>

      <InlineAlert
        tone="neutral"
        title="What a check can and cannot prove"
        detail="The verification engine is deterministic: it computes document completeness, identifier matches, duplicate hashes and mileage consistency. “No record found” means the supported sources returned nothing — it is not a guarantee."
      />
    </div>
  );
}
