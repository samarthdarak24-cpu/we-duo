import type { Metadata } from "next";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { VehicleSelector } from "@/components/seller/VehicleSelector";
import { RiskGauge } from "@/components/ui/RiskGauge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Icon } from "@/components/ui/Icon";
import { AiAssistant } from "@/components/shared/AiAssistant";
import { InvestigationPanel } from "@/components/seller/InvestigationPanel";
import { portalUser } from "@/lib/server/page";
import { getMarketplace, getRiskAnalysis } from "@/lib/server/data";

export const metadata: Metadata = { title: "AI Risk Analysis — TrustDrive" };
export const dynamic = "force-dynamic";

export default function BuyerRiskPage({ searchParams }: { searchParams: { vehicle?: string } }) {
  const user = portalUser("buyer")!;
  const listing = getMarketplace({ pageSize: 12 }, user.id).items;
  const vehicleId = searchParams.vehicle ?? listing[0]?.id ?? "v-bmw";
  const risk = getRiskAnalysis(vehicleId);

  if (!risk) {
    return (
      <PortalShell portal="buyer" activeLabel="AI Risk Analysis" profile={user.profile} unread={user.unread} title="TrustDrive — AI Risk Analysis">
        <PageHeader eyebrow="Intelligence" title="AI Risk Analysis" subtitle="Deterministic rules, explained in plain language." />
        <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
          <p className="text-[13px] text-muted">Vehicle not found.</p>
          <a href="/buyer/explore" className="td-btn td-btn-primary mt-2">
            Explore vehicles
          </a>
        </div>
      </PortalShell>
    );
  }

  const v = risk.vehicle;

  return (
    <PortalShell portal="buyer" activeLabel="AI Risk Analysis" profile={user.profile} unread={user.unread} title="TrustDrive — AI Risk Analysis" hideAssistant>
      <PageHeader
        eyebrow="Intelligence · Buyer view"
        title="AI Risk Analysis"
        subtitle={`${v.make} ${v.model} · ${v.reg_no} — deterministic rules, explained in plain language.`}
      >
        <a href={`/vehicle/${v.id}`} className="td-btn td-btn-primary">
          <Icon name="FileText" size={15} /> Full report
        </a>
      </PageHeader>

      <VehicleSelector
        vehicles={listing.map((l) => ({ id: l.id, make: l.make, model: l.model, year: l.year, regNo: l.regNo }))}
        selectedId={v.id}
        basePath="/buyer/risk"
      />

      <InlineAlert tone="warning" title="What this score means" detail={risk.disclaimer} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <SectionCard className="h-fit">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="td-eyebrow">Risk score</span>
            <RiskGauge risk={risk.riskScore} />
            <p className="text-[14px] font-semibold text-ink">{risk.bandLabel}</p>
            <p className="text-[11.5px] text-muted">100 − trust score</p>
          </div>
          <div className="mt-4 space-y-1.5">
            <RailRow label="Trust score" value={`${risk.trust.trustScore}/100`} />
            <RailRow label="Evidence coverage" value={`${risk.trust.evidenceCoverage}%`} />
            <RailRow label="Open findings" value={String(risk.findings.length)} />
            <RailRow label="Hash chain" value={risk.chain.intact ? "Intact" : "Broken"} tone={risk.chain.intact ? "success" : "danger"} />
          </div>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Recommended action" description="What a careful buyer should verify next.">
            <p className="text-[13px] leading-relaxed text-muted">{risk.recommendedAction}</p>
          </SectionCard>

          <SectionCard
            title="How is this calculated?"
            description="Every point comes from stored document and finding records."
            action={<span className="td-chip font-mono">{risk.calculation.version} · deterministic</span>}
          >
            <p className="rounded-[10px] border border-border bg-surface-tint px-4 py-3 font-mono text-[12px] text-primary">
              {risk.calculation.formula}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <CalcStat label="Evidence coverage points" value={risk.calculation.coveragePoints} tone="text-ink" />
              <CalcStat label="Open finding penalties" value={`−${risk.calculation.penaltyPoints}`} tone="text-danger" />
              <CalcStat label="Trust score" value={`${risk.calculation.trustScore}/100`} tone="text-success" />
            </div>

            <div className="mt-4">
              <div className="td-label">Bands</div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {risk.calculation.bands.map((b) => (
                  <div
                    key={b.band}
                    className={
                      "rounded-[10px] border px-3 py-2 text-[11.5px] " +
                      (b.band === risk.calculation.band
                        ? "border-primary/45 bg-info-bg text-ink"
                        : "border-border bg-surface-tint text-muted")
                    }
                  >
                    <div className="font-semibold">{b.band}</div>
                    <div className="font-mono text-[10.5px]">{b.range}</div>
                  </div>
                ))}
              </div>
            </div>

            <details className="group mt-4 rounded-[10px] border border-border bg-surface-tint">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[12px] font-semibold text-ink">
                <span className="flex items-center gap-2">
                  <Icon name="Layers" size={14} className="text-primary" /> Document weight ledger
                </span>
                <Icon name="ChevronDown" size={14} className="text-muted transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-border bg-surface">
                {risk.calculation.documentation.map((d) => (
                  <div key={d.type} className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-2 text-[12px] last:border-b-0">
                    <span className="text-ink">{d.type.replace(/_/g, " ")}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[10.5px] text-muted">
                        {d.counted}/{d.weight} pts
                      </span>
                      <StatusBadge
                        status={d.status === "verified" ? "verified" : d.status === "pending" ? "pending" : "unverified"}
                        label={d.status.replace(/_/g, " ")}
                      />
                    </span>
                  </div>
                ))}
              </div>
            </details>

            {risk.calculation.deductions.length > 0 && (
              <details className="group mt-2 rounded-[10px] border border-border bg-surface-tint">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[12px] font-semibold text-ink">
                  <span className="flex items-center gap-2">
                    <Icon name="Minus" size={14} className="text-danger" /> Applied deductions ({risk.calculation.deductions.length})
                  </span>
                  <Icon name="ChevronDown" size={14} className="text-muted transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-border bg-surface">
                  {risk.calculation.deductions.map((d, i) => (
                    <div key={`${d.code}-${i}`} className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-2 text-[12px] last:border-b-0">
                      <span className="font-mono text-[11px] text-ink">{d.code}</span>
                      <span className="font-semibold text-danger">−{d.points} pts</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            <p className="td-help mt-3">
              The engine is fully grounded: every point comes from stored document and finding records. Changing a record re-runs the
              calculation — there is no opaque model in this loop.
            </p>
          </SectionCard>

          <SectionCard title="Rules triggered" description="Open findings that subtract from the trust score.">
            <div className="space-y-2">
              {risk.rules.map((r) => (
                <div key={r.code} className="rounded-[10px] border border-border bg-surface-tint px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-ink">{r.title}</span>
                    <span className="flex items-center gap-1.5">
                      <span className="td-chip">−{r.weight} pts</span>
                      <StatusBadge status={r.status} />
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{r.explanation}</p>
                  <p className="mt-0.5 font-mono text-[10.5px] text-muted">
                    {r.code} · severity {r.severity}
                  </p>
                </div>
              ))}
              {!risk.rules.length && (
                <div className="flex items-center gap-2 rounded-[10px] bg-success-bg px-4 py-3 text-[12px] font-semibold text-success">
                  <Icon name="CheckCircle2" size={14} /> No open rules. The score is based on evidence coverage alone.
                </div>
              )}
            </div>
          </SectionCard>
        </div>
      </div>

      <AiAssistant vehicleId={v.id} vehicleLabel={`${v.make} ${v.model}`} />
      <InvestigationPanel vehicleId={vehicleId} />
    </PortalShell>
  );
}

function RailRow({ label, value, tone }: { label: string; value: string; tone?: "success" | "danger" }) {
  return (
    <div className="flex items-center justify-between rounded-[10px] border border-border bg-surface-tint px-3 py-2 text-[12px]">
      <span className="text-muted">{label}</span>
      <span className={tone === "success" ? "font-semibold text-success" : tone === "danger" ? "font-semibold text-danger" : "font-semibold text-ink"}>
        {value}
      </span>
    </div>
  );
}

function CalcStat({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="rounded-[10px] border border-border bg-surface-tint px-4 py-3">
      <div className={`text-[22px] font-bold leading-none ${tone}`}>{value}</div>
      <div className="mt-1 text-[11px] text-muted">{label}</div>
    </div>
  );
}
