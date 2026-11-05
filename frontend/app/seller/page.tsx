import type { Metadata } from "next";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { EmptyState } from "@/components/shared/EmptyState";
import { Viewer3DLazy } from "@/components/shared/Viewer3DLazy";
import { ProgressChecklist } from "@/components/ui/ProgressChecklist";
import { MileageChart } from "@/components/ui/MileageChart";
import { PriceRangeBar } from "@/components/ui/PriceRangeBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StatCard } from "@/components/ui/StatCard";
import { VehiclePhoto } from "@/components/ui/VehiclePhoto";
import { Icon } from "@/components/ui/Icon";
import { portalUser } from "@/lib/server/page";
import { getSellerOverview } from "@/lib/server/data";
import { formatKm, formatINR, formatINRCompact } from "@/lib/format";

export const metadata: Metadata = { title: "TrustDrive — Seller Portal" };
export const dynamic = "force-dynamic";

export default function SellerOverview() {
  const user = portalUser("seller")!;
  const data = getSellerOverview(user.id);
  const v = data.vehicle;

  if (!v) {
    return (
      <PortalShell portal="seller" activeLabel="Overview" profile={user.profile} unread={user.unread} title="Seller overview">
        <PageHeader title="Welcome to TrustDrive" subtitle="Add your first vehicle to unlock verification and the marketplace." />
        <EmptyState
          icon="Car"
          title="No vehicles yet"
          detail="Register a vehicle to start verification, upload documents and publish a trusted listing."
          action={
            <a href="/seller/add-vehicle" className="td-btn td-btn-primary mt-2">
              <Icon name="Plus" size={15} /> Add your first vehicle
            </a>
          }
        />
      </PortalShell>
    );
  }

  const pricing = data.pricing;
  const latestKm = data.mileage.length ? data.mileage[data.mileage.length - 1].km : 0;
  const latestVerifiedKm = v.last_verified_km || 0;
  const lastVerificationLabel = data.stats.lastVerificationAt
    ? new Date(data.stats.lastVerificationAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })
    : "Not run";
  const topAlert = data.alerts.find((a) => a.status === "suspicious" || a.status === "needs_correction") ?? data.alerts[0];
  const firstName = user.me.name.split(" ")[0];

  const secondary = [
    { label: "Verified vehicles", value: String(data.stats.verifiedVehicles), icon: "BadgeCheck", href: "/seller/verification" },
    { label: "Open alerts", value: String(data.stats.alerts), icon: "ShieldAlert", href: "/seller/fraud" },
    { label: "Listing views", value: String(data.stats.views), icon: "Eye", href: "/seller/listings" },
    { label: "Saved by buyers", value: String(data.stats.saves), icon: "Heart", href: "/seller/listings" },
    { label: "Verifications · 30d", value: String(data.stats.verificationActivity30d), icon: "ScanSearch", href: "/seller/verification" },
    { label: "Last verification", value: lastVerificationLabel, icon: "Clock", href: "/seller/verification" },
    { label: "Document completeness", value: `${data.stats.documentCompleteness}%`, icon: "FolderOpen", href: "/seller/documents" },
    { label: "Listing readiness", value: `${data.stats.listingReadiness}%`, icon: "ClipboardCheck", href: "/seller/listings" },
  ];

  return (
    <PortalShell
      portal="seller"
      activeLabel="Overview"
      profile={user.profile}
      unread={user.unread}
      title="Seller portfolio"
      selector={{ label: `${v.make} ${v.model}`, sub: v.reg_no }}
    >
      <PageHeader
        eyebrow="Seller workspace"
        title={`Portfolio overview`}
        subtitle={`Welcome back, ${firstName}. Track verification, clear blockers and keep every listing evidence-ready.`}
        meta={
          <>
            <span className="td-chip">
              <Icon name="Car" size={12} /> {data.stats.totalVehicles} vehicles
            </span>
            <span className="td-chip">
              <Icon name="Store" size={12} /> {data.stats.activeListings} live
            </span>
            <span className="td-chip">
              <Icon name="ShieldAlert" size={12} /> {data.stats.alerts} open findings
            </span>
          </>
        }
      >
        <a href="/seller/add-vehicle" className="td-btn td-btn-secondary">
          <Icon name="Plus" size={15} /> Add vehicle
        </a>
        <a href={`/seller/vehicles/${v.id}`} className="td-btn td-btn-primary">
          <Icon name="Eye" size={15} /> Open vehicle
        </a>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon="Car" value={data.stats.totalVehicles} label="Total vehicles" hint="In your portfolio" href="/seller/vehicles" />
        <StatCard icon="Store" value={data.stats.activeListings} label="Active listings" hint="Published on marketplace" href="/seller/listings" tone="success" />
        <StatCard icon="FileClock" value={data.stats.pendingVerification} label="Pending verification" hint="Documents or checks awaiting review" href="/seller/documents" tone="warning" />
        <StatCard icon="MessageSquare" value={data.stats.inquiries} label="Buyer inquiries" hint="Open conversations" href="/seller/inquiries" tone="gold" />
      </div>

      {topAlert ? (
        <InlineAlert
          tone={topAlert.status === "suspicious" || topAlert.status === "needs_correction" ? "danger" : "warning"}
          title={`${topAlert.title} — needs your attention`}
          detail={topAlert.detail}
          action={
            <a href="/seller/fraud" className="td-btn td-btn-sm td-btn-secondary">
              Review finding <Icon name="ArrowUpRight" size={13} />
            </a>
          }
        />
      ) : (
        <InlineAlert
          tone="success"
          title="No open blockers in the current record"
          detail="Keep documents current — a complete record is what buyers can verify."
          action={
            <a href="/seller/documents" className="td-btn td-btn-sm td-btn-secondary">
              Check documents
            </a>
          }
        />
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="min-w-0 space-y-5">
          <SectionCard
            title="Verification pipeline"
            description="Every vehicle, its evidence coverage and the state of its listing."
            action={
              <a href="/seller/vehicles" className="td-link">
                Manage vehicles <Icon name="ChevronRight" size={14} strokeWidth={2.4} />
              </a>
            }
            flush
          >
            <div className="overflow-x-auto td-scroll">
              <table className="w-full min-w-[680px] text-left">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted">Vehicle</th>
                    <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted">Trust</th>
                    <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted">Coverage</th>
                    <th className="px-3 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted">Listing</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {data.vehicles.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 transition hover:bg-surface-tint">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <VehiclePhoto make={row.make} model={row.model} year={row.year} size={42} rounded={9} />
                          <div className="min-w-0">
                            <a href={`/seller/vehicles/${row.id}`} className="block truncate text-[13px] font-semibold text-ink hover:text-primary">
                              {row.make} {row.model}
                            </a>
                            <div className="truncate text-[11px] text-muted">
                              {row.regNo} · {formatKm(row.km)}
                              {row.findings > 0 ? ` · ${row.findings} finding${row.findings === 1 ? "" : "s"}` : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className="pill"
                          style={{
                            color: row.trustScore >= 65 ? "var(--success)" : row.trustScore >= 40 ? "var(--warning)" : "var(--danger)",
                            background: row.trustScore >= 65 ? "var(--success-bg)" : row.trustScore >= 40 ? "var(--warning-bg)" : "var(--danger-bg)",
                          }}
                        >
                          {row.trustScore}/100
                        </span>
                      </td>
                      <td className="px-3 py-3 text-[12.5px] text-ink">{row.coverage}%</td>
                      <td className="px-3 py-3">
                        <StatusBadge
                          status={row.listingStatus === "published" ? "verified" : row.listingStatus === "sold" ? "unverified" : "pending"}
                          label={row.listingStatus === "published" ? "Published" : row.listingStatus === "pending_review" ? "In review" : row.listingStatus === "draft" ? "Draft" : row.listingStatus}
                        />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <a href={`/seller/vehicles/${row.id}`} className="td-icon-btn h-8 w-8" aria-label={`Open ${row.make} ${row.model}`} title="Open vehicle">
                          <Icon name="ChevronRight" size={15} />
                        </a>
                      </td>
                    </tr>
                  ))}
                  {!data.vehicles.length && (
                    <tr>
                      <td colSpan={5} className="px-5 py-10 text-center text-[13px] text-muted">
                        No vehicles yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SectionCard title="Portfolio signals" description="Secondary metrics live here, not in the KPI row." bodyClassName="p-0">
              <div className="divide-y divide-border">
                {secondary.map((m) => (
                  <a key={m.label} href={m.href} className="flex items-center gap-3 px-5 py-2.5 transition hover:bg-surface-tint">
                    <Icon name={m.icon} size={15} className="text-primary" />
                    <span className="flex-1 text-[12.5px] text-muted">{m.label}</span>
                    <span className="td-metric text-[13px] text-ink">{m.value}</span>
                    <Icon name="ChevronRight" size={13} className="text-muted" />
                  </a>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="Document completeness"
              description={`${data.completeness.percent}% of the required evidence is on file.`}
              action={
                <a href="/seller/documents" className="td-link">
                  Manage
                </a>
              }
              bodyClassName="p-5"
            >
              <ProgressChecklist percent={data.completeness.percent} items={data.completeness.items} />
              <p className="mt-3 text-[11px] leading-relaxed text-muted">
                Missing documents are shown as unknown. A complete set improves coverage; it does not certify authenticity.
              </p>
            </SectionCard>
          </div>

          <SectionCard
            title="Alerts needing attention"
            description="Warnings to investigate — not proof of fraud."
            action={
              <a href="/seller/fraud" className="td-link">
                All findings <Icon name="ChevronRight" size={14} strokeWidth={2.4} />
              </a>
            }
            bodyClassName="p-0"
          >
            <ul className="divide-y divide-border">
              {data.alerts.slice(0, 5).map((a, idx) => (
                <li key={`${a.title}-${idx}`}>
                  <a href="/seller/fraud" className="flex flex-wrap items-center gap-3 px-5 py-3 transition hover:bg-surface-tint">
                    <StatusBadge status={a.status} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-ink">{a.title}</div>
                      {a.detail && <div className="line-clamp-1 text-[11.5px] text-muted">{a.detail}</div>}
                    </div>
                    <span className="td-btn td-btn-sm td-btn-secondary hidden sm:inline-flex">Review</span>
                    <Icon name="ChevronRight" size={15} className="shrink-0 text-muted" />
                  </a>
                </li>
              ))}
              {!data.alerts.length && (
                <li className="px-5 py-8 text-center text-[13px] text-muted">No alerts for this vehicle.</li>
              )}
            </ul>
          </SectionCard>

          <SectionCard
            title="Mileage history"
            description={`Latest recorded ${latestKm ? formatKm(latestKm) : "—"}${latestVerifiedKm ? ` · verified ${formatKm(latestVerifiedKm)}` : ""}`}
            action={
              <a href={`/seller/history?vehicle=${v.id}`} className="td-link">
                Full history
              </a>
            }
            bodyClassName="p-4"
          >
            {data.mileage.length ? (
              <MileageChart data={data.mileage} />
            ) : (
              <p className="py-8 text-center text-[13px] text-muted">No odometer readings recorded yet.</p>
            )}
            <p className="mt-2 text-[11px] text-muted">
              Claimed and verified readings are tracked separately. A reading lower than the previous one is flagged for review.
            </p>
          </SectionCard>
        </div>

        {/* Right rail */}
        <aside className="space-y-5">
          <SectionCard
            title="Listing readiness"
            description={data.listingStatus.headline}
            action={
              <a href={`/seller/listings?vehicle=${v.id}`} className="td-link">
                Edit
              </a>
            }
            bodyClassName="p-5"
          >
            <ul className="space-y-2.5">
              {data.listingStatus.items.map((it) => (
                <li key={it.label} className="flex items-center justify-between gap-3">
                  <span className="text-[12.5px] text-ink">{it.label}</span>
                  <StatusBadge status={it.status} />
                </li>
              ))}
            </ul>
            {data.listingStatus.gate.blockers.length > 0 && (
              <div className="mt-3 rounded-[10px] bg-danger-bg px-3 py-2 text-[11.5px] font-semibold leading-relaxed text-danger">
                {data.listingStatus.gate.blockers.length} blocker{data.listingStatus.gate.blockers.length === 1 ? "" : "s"} before publishing
              </div>
            )}
            <a href={`/seller/listings?vehicle=${v.id}`} className="td-btn td-btn-primary mt-4 w-full">
              <Icon name="Store" size={15} /> Manage listing
            </a>
          </SectionCard>

          <SectionCard
            title="Buyer interest"
            action={
              <a href="/seller/inquiries" className="td-link">
                Inbox
              </a>
            }
            bodyClassName="p-4"
          >
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: "Eye", value: data.buyerInterest.views, label: "Views" },
                { icon: "Heart", value: data.buyerInterest.saves, label: "Saves" },
                { icon: "MessageSquare", value: data.buyerInterest.inquiries, label: "Inquiries" },
              ].map((s) => (
                <div key={s.label} className="rounded-[10px] bg-surface-tint px-2 py-2.5 text-center">
                  <Icon name={s.icon} size={15} className="mx-auto text-primary" />
                  <div className="td-metric mt-1 text-[17px] text-ink">{s.value}</div>
                  <div className="text-[10.5px] text-muted">{s.label}</div>
                </div>
              ))}
            </div>
            <ul className="mt-3 space-y-1.5">
              {data.buyerInterest.recent.map((m) => (
                <li key={`${m.name}-${m.time}`} className="flex items-start gap-2.5 rounded-[10px] p-1.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-info-bg text-[10.5px] font-bold text-primary">
                    {m.avatarInitials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12px] font-semibold text-ink">{m.name}</span>
                      <span className="shrink-0 text-[10px] text-muted">{m.time}</span>
                    </div>
                    <p className="truncate text-[11px] text-muted">{m.message}</p>
                  </div>
                </li>
              ))}
              {!data.buyerInterest.recent.length && <li className="py-4 text-center text-[12px] text-muted">No inquiries yet.</li>}
            </ul>
          </SectionCard>

          {pricing && (
            <SectionCard title="Market price estimate" bodyClassName="p-5">
              <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-[10px] bg-surface-tint p-2">
                  <div className="text-[10.5px] text-muted">Low</div>
                  <div className="mt-0.5 text-[12.5px] font-bold text-ink">{formatINRCompact(pricing.low)}</div>
                </div>
                <div className="rounded-[10px] border border-primary/25 bg-info-bg p-2">
                  <div className="text-[10.5px] text-primary">Suggested</div>
                  <div className="mt-0.5 text-[12.5px] font-bold text-primary">{formatINRCompact(pricing.suggested)}</div>
                </div>
                <div className="rounded-[10px] bg-surface-tint p-2">
                  <div className="text-[10.5px] text-muted">High</div>
                  <div className="mt-0.5 text-[12.5px] font-bold text-ink">{formatINRCompact(pricing.high)}</div>
                </div>
              </div>
              <PriceRangeBar
                low={pricing.low}
                high={pricing.high}
                marker={pricing.askingPrice}
                estimate={pricing.suggested}
                chip={{ text: "Suggested", color: "var(--primary)", bg: "var(--info-bg)" }}
                note={pricing.note}
                disclaimer={`${pricing.comparables} comparable vehicles · confidence ${pricing.confidence}. Estimate, not a valuation.`}
              />
            </SectionCard>
          )}

          <SectionCard
            title="3D inspection"
            description={`${data.hotspots.filter((h) => h.damage.length).length} damage panel(s) mapped on 3D studio.`}
            action={
              <a href="#viewer" className="td-link">
                View Studio
              </a>
            }
            bodyClassName="p-4 space-y-3"
          >
            <div className="rounded-xl border border-border bg-surface-tint p-3 text-[12px] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted font-medium">Diagnostic Studio</span>
                <span className="td-chip font-bold">Live 3D</span>
              </div>
              <p className="text-[11.5px] text-muted leading-relaxed">
                Full 360° interactive car inspection with Exploded, Damage, and X-Ray diagnostic modes.
              </p>
              <a href="#viewer" className="td-btn td-btn-primary w-full text-[12px]">
                <Icon name="Layers" size={14} /> Open 3D Inspection Studio
              </a>
            </div>
          </SectionCard>
        </aside>
      </div>

      {/* Expansive Full-Width 3D Vehicle Damage Inspection Studio */}
      <section id="viewer" className="mt-8 overflow-hidden rounded-[18px] border border-border bg-surface shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
              <h2 className="td-h2">Vehicle 3D Damage Inspection Studio</h2>
            </div>
            <p className="mt-0.5 text-[12.5px] text-muted">
              Interactive spatial diagnostic model for {v.make} {v.model}. Raycast panels to inspect verified records, or explore Exploded &amp; X-Ray modes.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="td-chip">
              <Icon name="ScanSearch" size={13} /> {data.hotspots.filter((h) => h.damage.length).length} recorded damage panel{data.hotspots.filter((h) => h.damage.length).length === 1 ? "" : "s"}
            </span>
            <a href={`/seller/vehicles/${v.id}#viewer`} className="td-btn td-btn-sm td-btn-secondary">
              Detailed Vehicle Report <Icon name="ArrowRight" size={13} />
            </a>
          </div>
        </div>

        <div className="p-3 sm:p-4">
          <Viewer3DLazy mode="seller" hotspots={data.hotspots} height={600} />
        </div>

        <div className="flex flex-wrap items-center justify-between border-t border-border px-5 py-3 text-[11.5px] text-muted">
          <span>Khronos CC BY 4.0 Executive Sedan GLB. Hotspots map directly to verified SQLite database damage rows.</span>
          <span className="font-mono text-primary">Spatial Diagnostic Studio</span>
        </div>
      </section>
    </PortalShell>
  );
}
