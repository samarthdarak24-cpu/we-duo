import type { Metadata } from "next";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { VehicleRowCompact } from "@/components/shared/VehicleRowCompact";
import { TrustRing } from "@/components/ui/TrustRing";
import { VehiclePhoto } from "@/components/ui/VehiclePhoto";
import { InsightRow } from "@/components/ui/InsightRow";
import { PriceRangeBar } from "@/components/ui/PriceRangeBar";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { portalUser } from "@/lib/server/page";
import { getBuyerOverview } from "@/lib/server/data";
import { formatINR, formatKm } from "@/lib/format";

export const metadata: Metadata = { title: "TrustDrive — Buyer Portal" };
export const dynamic = "force-dynamic";

export default function BuyerOverview() {
  const user = portalUser("buyer")!;
  const data = getBuyerOverview(user.id);
  const firstName = user.me.name.split(" ")[0];
  const v = data.reportVehicle;

  return (
    <PortalShell portal="buyer" activeLabel="Overview" profile={user.profile} unread={user.unread} title="Buyer overview">
      <PageHeader
        eyebrow="Buyer workspace"
        title={`Good to see you, ${firstName}`}
        subtitle="Discover a vehicle, inspect what is on record, and decide with evidence — not listing copy."
        meta={
          <>
            <span className="td-chip">
              <Icon name="Activity" size={12} /> {data.activity[0]?.value ?? 0} explored
            </span>
            <span className="td-chip">
              <Icon name="Heart" size={12} /> {data.activity[1]?.value ?? 0} saved
            </span>
            <span className="td-chip">
              <Icon name="ShieldCheck" size={12} /> Scores from verified records
            </span>
          </>
        }
      >
        <a href="/buyer/verification" className="td-btn td-btn-secondary">
          <Icon name="Search" size={15} /> Verify a vehicle
        </a>
        <a href="/buyer/explore" className="td-btn td-btn-primary">
          <Icon name="Compass" size={15} /> Explore vehicles
        </a>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {data.activity.map((s, i) => (
          <StatCard
            key={s.label}
            icon={s.icon}
            value={s.value}
            label={s.label}
            hint={
              i === 0 ? "Across the marketplace" : i === 1 ? "Shortlist ready" : i === 2 ? "Last 30 days" : "Reports in progress"
            }
            href={s.href}
            tone={i === 1 ? "danger" : i === 3 ? "warning" : "gold"}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          {/* Featured verification */}
          {v ? (
          <section className="card overflow-hidden">
            <div className="relative">
              <VehiclePhoto
                make={v.make}
                model={v.model}
                year={v.year}
                aspect="16 / 8"
                rounded={0}
                priority
                className="min-h-[240px]"
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(12,14,16,.86) 0%, rgba(12,14,16,.55) 46%, rgba(12,14,16,.08) 78%), linear-gradient(0deg, rgba(12,14,16,.72), transparent 55%)",
                }}
              />
              <div className="absolute inset-0 flex flex-col justify-between p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/30 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/90 backdrop-blur">
                    <Icon name="ShieldCheck" size={12} /> Featured verification
                  </span>
                  <span className="hidden rounded-full border border-white/20 bg-black/30 px-2.5 py-1 text-[10.5px] font-medium text-white/80 backdrop-blur sm:inline-flex">
                    {v.regNo}
                  </span>
                </div>
                <div className="max-w-[540px]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#D6BC8A]">
                    {v.year} · {v.fuel} · {v.transmission}
                  </p>
                  <h2 className="mt-1 font-display text-[26px] font-bold leading-tight text-white sm:text-[30px]">
                    {v.make} {v.model}
                    {v.variant ? ` ${v.variant}` : ""}
                  </h2>
                  <p className="mt-1.5 max-w-[460px] text-[12.5px] leading-relaxed text-white/75">
                    {formatKm(v.km)} claimed · {v.coverage}% evidence coverage. Open the report to see every source, finding and
                    missing record behind this score.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <a href={`/vehicle/${data.reportVehicleId}`} className="td-btn td-btn-primary td-btn-sm">
                      <Icon name="FileText" size={14} /> Open full report
                    </a>
                    <a
                      href={`/vehicle/${data.reportVehicleId}#viewer`}
                      className="td-btn td-btn-sm border-white/25 bg-white/10 text-white backdrop-blur hover:bg-white/20"
                    >
                      <Icon name="Move3d" size={14} /> 3D inspection
                    </a>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 divide-x divide-border border-t border-border sm:grid-cols-4">
              {[
                { label: "Trust score", value: `${v.trustScore}/100`, icon: "ShieldCheck", tone: "var(--success)" },
                { label: "Evidence coverage", value: `${v.coverage}%`, icon: "FolderOpen", tone: "var(--primary)" },
                { label: "Mileage claimed", value: formatKm(v.km), icon: "Gauge", tone: "var(--text)" },
                { label: "Market estimate", value: formatINR(v.marketPrice), icon: "TrendingUp", tone: "var(--text)" },
              ].map((m) => (
                <div key={m.label} className="px-4 py-3.5">
                  <div className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">
                    <span className="inline-flex" style={{ color: m.tone }}>
                      <Icon name={m.icon} size={12} />
                    </span>
                    {m.label}
                  </div>
                  <div className="td-metric mt-1 text-[16px] text-ink">{m.value}</div>
                </div>
              ))}
            </div>
          </section>
          ) : (
            <EmptyState
              icon="Car"
              title="No published vehicles yet"
              detail="Verified listings from sellers will appear here as soon as they are published. You can still look up any VIN or QR code directly."
              action={
                <a href="/buyer/verification" className="td-btn td-btn-primary mt-2">
                  <Icon name="Search" size={15} /> Verify a vehicle
                </a>
              }
            />
          )}

          <SectionCard
            title="Recommended for you"
            description="Ranked by evidence coverage, not by paid placement."
            action={
              <a href="/buyer/explore" className="td-link">
                View all <Icon name="ChevronRight" size={14} strokeWidth={2.4} />
              </a>
            }
            bodyClassName="p-3"
          >
            <div className="divide-y divide-border">
              {data.recommended.map((rec) => (
                <VehicleRowCompact key={rec.id} v={rec} />
              ))}
              {!data.recommended.length && (
                <p className="px-2 py-8 text-center text-[13px] text-muted">No recommendations yet. Explore the marketplace to begin.</p>
              )}
            </div>
          </SectionCard>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SectionCard
              title="How a score is built"
              description="Deterministic, versioned and auditable."
              bodyClassName="p-4"
            >
              <ol className="space-y-3">
                {[
                  { icon: "FolderOpen", t: "Documents on file", d: "RC, insurance, PUC and service records, each with a source and timestamp." },
                  { icon: "ScanSearch", t: "Rules and anomaly checks", d: "Mileage, identity, duplicates and dates are compared to the record." },
                  { icon: "Scale", t: "Explainable score", d: "Positive evidence, negative findings and unknown areas stay separate." },
                ].map((s, i) => (
                  <li key={s.t} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-info-bg text-[11px] font-bold text-primary">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-[12.5px] font-semibold text-ink">{s.t}</p>
                      <p className="text-[11.5px] leading-relaxed text-muted">{s.d}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </SectionCard>

            <SectionCard
              title="Saved vehicles needing attention"
              description="Open findings or a score change since you saved them."
              bodyClassName="p-3"
            >
              {data.suspicious.length ? (
                <ul className="space-y-1">
                  {data.suspicious.map((s) => (
                    <li key={s.id}>
                      <a href={`/vehicle/${s.id}`} className="flex items-center gap-3 rounded-[10px] p-2 transition hover:bg-surface-tint">
                        <StatusBadge status={s.status} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-semibold text-ink">{s.label}</span>
                          <span className="block truncate text-[11px] text-muted">{s.detail}</span>
                        </span>
                        <Icon name="ChevronRight" size={14} className="text-muted" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-2 py-6 text-center text-[12.5px] text-muted">
                  No saved vehicle has an open risk flag right now.
                </p>
              )}
            </SectionCard>
          </div>
        </div>

        {/* Right rail */}
        <aside className="space-y-5">
          {v && (
            <>
              <SectionCard
                title="Trust summary"
                action={
                  <a href="/buyer/risk" className="td-link">
                    Methodology
                  </a>
                }
                bodyClassName="p-5"
              >
                <div className="flex flex-col items-center">
                  <TrustRing score={v.trustScore} size={140} />
                  <p className="mt-3 text-center text-[11.5px] leading-relaxed text-muted">
                    {formatKm(v.km)} · {v.coverage}% evidence coverage
                    <br />
                    Versioned rules engine · last recalculated on record change
                  </p>
                </div>
                <div className="mt-4 space-y-0.5 border-t border-border pt-3">
                  {data.insights.slice(0, 5).map((i) => (
                    <InsightRow key={i.label} insight={i} />
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="Market price estimate" bodyClassName="p-5">
                <PriceRangeBar
                  low={v.priceLow}
                  high={v.priceHigh}
                  marker={v.marketPrice}
                  estimate={v.marketPrice}
                  chip={{ text: "Estimate", color: "var(--primary)", bg: "var(--info-bg)" }}
                  disclaimer="Comparable verified listings in your region. Confidence: moderate. This is an estimate, not an offer."
                />
              </SectionCard>
            </>
          )}

          <SectionCard
            title="Active inquiries"
            action={
              <a href="/buyer/inquiries" className="td-link">
                Inbox
              </a>
            }
            bodyClassName="p-3"
          >
            <ul className="space-y-1">
              {data.recentInquiries.map((q, idx) => (
                <li key={`${q.name}-${idx}`} className="flex items-start gap-2.5 rounded-[10px] p-2 transition hover:bg-surface-tint">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-info-bg text-[10.5px] font-bold text-primary">
                    {q.initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12.5px] font-semibold text-ink">{q.name}</span>
                      <span className="shrink-0 text-[10.5px] text-muted">{q.time}</span>
                    </div>
                    <p className="truncate text-[11px] text-muted">{q.message}</p>
                  </div>
                </li>
              ))}
              {!data.recentInquiries.length && (
                <li className="py-5 text-center text-[12.5px] text-muted">No active inquiries.</li>
              )}
            </ul>
          </SectionCard>

          <div className="rounded-[14px] border border-border bg-surface-tint px-4 py-3.5">
            <div className="flex items-start gap-2.5">
              <Icon name="Info" size={15} className="mt-0.5 shrink-0 text-primary" />
              <p className="text-[11.5px] leading-relaxed text-muted">
                <span className="font-semibold text-ink">No record found is not a guarantee.</span> Missing data is shown as unknown,
                never as clean.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </PortalShell>
  );
}
