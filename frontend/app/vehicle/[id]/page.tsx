import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TrustRing } from "@/components/ui/TrustRing";
import { VehicleDetailPanel } from "@/components/buyer/VehicleDetailPanel";
import { Viewer3DLazy } from "@/components/shared/Viewer3DLazy";
import { AiAssistant } from "@/components/shared/AiAssistant";
import { getSessionUser } from "@/lib/server/session";
import { getVehicleDetail, hotspotsFor } from "@/lib/server/data";
import { EvidenceGraph } from "@/components/shared/EvidenceGraph";
import { ProviderChecksPanel } from "@/components/seller/ProviderChecksPanel";
import { buildEvidenceGraph, crossModalMileage } from "@/lib/server/evidence";
import { formatINR, formatKm } from "@/lib/format";
import { trustBand } from "@/lib/trust";
import { cn } from "@/lib/cn";
import { categoryForVehicle, categoryLabel, modelAssetForCategory } from "@/lib/vehicle-categories";

export const metadata: Metadata = { title: "Vehicle Report — TrustDrive" };
export const dynamic = "force-dynamic";

/* ----- small presentational helpers (no hooks, safe in a server component) ----- */

const INSIGHT_TONE: Record<string, { color: string; bg: string; icon: string }> = {
  verified: { color: "var(--success)", bg: "var(--success-bg)", icon: "CheckCircle2" },
  suspicious: { color: "var(--danger)", bg: "var(--danger-bg)", icon: "AlertTriangle" },
  pending: { color: "var(--warning)", bg: "var(--warning-bg)", icon: "CircleDot" },
  unverified: { color: "var(--muted)", bg: "var(--surface-tint)", icon: "HelpCircle" },
};

function KpiCard({
  label,
  icon,
  value,
  suffix,
  footnote,
  valueClassName,
  accent,
}: {
  label: string;
  icon: string;
  value: ReactNode;
  suffix?: string;
  footnote?: string;
  valueClassName?: string;
  accent?: string;
}) {
  const tint = accent ? `color-mix(in srgb, ${accent} 9%, var(--surface))` : undefined;
  const chipBg = accent ? `color-mix(in srgb, ${accent} 16%, var(--surface))` : undefined;
  return (
    <div className="td-kpi relative overflow-hidden" style={accent ? { background: tint } : undefined}>
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
        style={{ background: accent ?? "var(--border)" }}
      />
      <div className="flex items-center justify-between">
        <span className="td-eyebrow">{label}</span>
        <span className="td-icon-chip" style={accent ? { background: chipBg, color: accent } : undefined}>
          <Icon name={icon} size={17} />
        </span>
      </div>
      <div className="flex items-end gap-1.5">
        <span className={cn("text-[38px] font-extrabold leading-none tracking-tight td-metric", valueClassName)}>
          {value}
        </span>
        {suffix && <span className="mb-1 text-[12px] text-muted">{suffix}</span>}
      </div>
      {footnote && <p className="mt-auto text-[12px] leading-snug text-muted">{footnote}</p>}
    </div>
  );
}

export default function PublicVehiclePage({ params }: { params: { id: string } }) {
  const session = getSessionUser("buyer");
  const detail = getVehicleDetail(params.id, session?.id);
  if (!detail) notFound();

  const v = detail.vehicle;
  const categoryId = categoryForVehicle(v).id;
  const categoryLabelText = categoryLabel(categoryId);
  const model3d = modelAssetForCategory(categoryId);
  const graph = buildEvidenceGraph(v.id, session ? { id: session.id, role: "buyer" } : undefined);
  const crossModal = crossModalMileage(v.id);

  const band = trustBand(detail.trust.trustScore);
  const openFindings = detail.findings.filter((f) => f.status !== "cleared");
  const damagePanels = hotspotsFor(v.id).filter((h) => h.damage.length).length;

  const panel = {
    id: v.id,
    make: v.make,
    model: v.model,
    variant: v.variant,
    year: v.year,
    regNo: v.reg_no,
    vin: v.vin,
    km: v.km_claimed,
    fuel: v.fuel,
    transmission: v.transmission,
    location: v.location,
    ownershipCount: v.ownership_count,
    color: v.color,
    trustdriveId: v.trustdrive_id,
    price: v.asking_price,
    trust: {
      trustScore: detail.trust.trustScore,
      riskScore: detail.trust.riskScore,
      band: detail.trust.band,
      bandLabel: detail.trust.bandLabel,
      evidenceCoverage: detail.trust.evidenceCoverage,
    },
    pricing: detail.pricing
      ? {
          estimate: detail.pricing.estimate,
          low: detail.pricing.low,
          high: detail.pricing.high,
          confidence: detail.pricing.confidence,
          comparables: detail.pricing.comparables,
        }
      : null,
    insights: detail.insights,
    documents: detail.publicDocuments.map((d) => ({
      id: d.id,
      type: d.type,
      file_name: d.file_name,
      status: d.status,
      consent: d.consent,
      verified_at: d.verified_at,
    })),
    history: detail.history,
    mileage: detail.mileage,
    damage: detail.damage,
    findings: detail.findings,
    listing: detail.listing
      ? {
          id: detail.listing.id,
          status: detail.listing.status,
          headline: detail.listing.headline,
          description: detail.listing.description,
          views: detail.listing.views,
          saves: detail.listing.saves,
          inquiries: detail.listing.inquiries,
        }
      : null,
    seller: detail.seller,
    chain: detail.chain,
    saved: detail.saved,
  };

  return (
    <div className="min-h-screen bg-bg">
      {/* Ambient page glow */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(1100px_520px_at_85%_-12%,rgba(185,154,96,0.06),transparent_62%)]" />

      {/* Sticky glass header */}
      <header className="sticky top-0 z-30 border-b border-border bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <a href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-primary text-[var(--on-primary)]">
              <Icon name="ShieldCheck" size={19} />
            </span>
            <span className="text-[15px] font-extrabold tracking-tight text-ink">TrustDrive</span>
          </a>
          <nav className="ml-auto flex flex-wrap items-center gap-1">
            <a
              href="/buyer/explore"
              className="rounded-[9px] px-3 py-2 text-[12.5px] font-semibold text-muted transition hover:bg-surface hover:text-ink"
            >
              Explore
            </a>
            <a
              href="/buyer/verification"
              className="rounded-[9px] px-3 py-2 text-[12.5px] font-semibold text-muted transition hover:bg-surface hover:text-ink"
            >
              Verify a vehicle
            </a>
            {session ? (
              <a
                href="/buyer"
                className="ml-1 inline-flex h-9 items-center rounded-[9px] bg-primary px-3.5 text-[12.5px] font-semibold text-[var(--on-primary)] transition hover:bg-primary-600"
              >
                My workspace
              </a>
            ) : (
              <a
                href="/login"
                className="ml-1 inline-flex h-9 items-center rounded-[9px] bg-primary px-3.5 text-[12.5px] font-semibold text-[var(--on-primary)] transition hover:bg-primary-600"
              >
                Sign in
              </a>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-7">
        {/* ---------------- Hero report identity ---------------- */}
        <section className="relative overflow-hidden rounded-[20px] border border-border bg-surface">
          <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,var(--primary),color-mix(in_srgb,var(--primary)_20%,transparent)_70%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1100px_320px_at_12%_-25%,rgba(185,154,96,0.10),transparent_60%)]" />
          <div className="relative flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="td-eyebrow">Vehicle verification report</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="td-h1">
                  {v.make} {v.model}
                </h1>
                {detail.listing && (
                  <StatusBadge
                    status={detail.listing.status === "published" ? "verified" : "pending"}
                    label={detail.listing.status.replace(/_/g, " ")}
                  />
                )}
              </div>
              <p className="mt-1.5 text-[14px] text-muted">
                {v.variant} · {v.year}
              </p>

              <div className="mt-4 flex flex-wrap gap-1.5">
                <span className="td-chip">
                  <Icon
                    name={
                      /scooter|motorcycle|bike/i.test(categoryId) ? "Bike" : "Car"
                    }
                    size={11}
                  />{" "}
                  {categoryLabelText}
                </span>
                {[
                  { icon: "Tag", label: v.reg_no },
                  { icon: "Gauge", label: `${formatKm(v.km_claimed)} claimed` },
                  { icon: "Fuel", label: v.fuel },
                  { icon: "Settings", label: v.transmission },
                  { icon: "MapPin", label: v.location || "Location not provided" },
                ].map((c) => (
                  <span key={c.label} className="td-chip">
                    <Icon name={c.icon} size={11} /> {c.label}
                  </span>
                ))}
              </div>

              <p className="mt-3 font-mono text-[11px] tracking-tight text-muted">
                TrustDrive ID {v.trustdrive_id} · VIN {v.vin || "not on file"}
              </p>
            </div>

            <div className="shrink-0 rounded-[16px] border border-border bg-surface-tint px-6 py-5 lg:text-right">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">Asking price</p>
              <p className="mt-1 text-[30px] font-extrabold leading-none tracking-tight text-ink td-metric">
                {formatINR(v.asking_price)}
              </p>
              <p className="mt-1.5 text-[11.5px] text-muted">Report generated from records on file</p>
            </div>
          </div>
        </section>

        {/* ---------------- At-a-glance KPI scoreboard ---------------- */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            label="Trust score"
            icon="ShieldCheck"
            value={detail.trust.trustScore}
            suffix="/ 100"
            footnote={band.label}
            valueClassName="text-ink"
            accent={band.color}
          />
          <KpiCard
            label="Evidence coverage"
            icon="FileSearch"
            value={detail.trust.evidenceCoverage}
            suffix="%"
            footnote="Verified document weight"
            valueClassName="text-ink"
            accent="var(--primary)"
          />
          <KpiCard
            label="Record integrity"
            icon={detail.chain.intact ? "Layers" : "ShieldX"}
            value={<span className="text-[20px] font-bold leading-tight">{detail.chain.intact ? "Hash chain intact" : "Chain broken"}</span>}
            footnote={`${detail.chain.records} verified records`}
            valueClassName={detail.chain.intact ? "text-[var(--success)]" : "text-[var(--danger)]"}
            accent={detail.chain.intact ? "var(--success)" : "var(--danger)"}
          />
          <KpiCard
            label="Open conflicts"
            icon="AlertTriangle"
            value={openFindings.length}
            suffix="finding(s)"
            footnote={openFindings.length ? "Review required" : "All clear"}
            valueClassName={openFindings.length ? "text-[var(--danger)]" : "text-[var(--success)]"}
            accent={openFindings.length ? "var(--danger)" : "var(--success)"}
          />
        </div>

        {/* ---------------- 3D Inspection Studio — inline centerpiece ---------------- */}
        <section className="overflow-hidden rounded-[20px] border border-border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
                <h2 className="td-h2">Vehicle 3D Inspection Studio</h2>
              </div>
              <p className="mt-0.5 text-[12.5px] text-muted">
                {model3d.status === "available"
                  ? "Interactive spatial diagnostic model — raycast any panel to inspect verified records, or explore Exploded & X-Ray modes."
                  : `Labelled ${categoryLabelText} schematic. No licensed 3D model exists for this category, so raycast, Exploded and X-Ray interactions are disabled.`}
              </p>
            </div>
            <span className="td-chip">
              <Icon name="ScanSearch" size={13} /> {damagePanels} damage panel{damagePanels === 1 ? "" : "s"}
            </span>
          </div>
          <div className="p-3 sm:p-4">
            <div className="rounded-[16px] bg-[linear-gradient(135deg,rgba(185,154,96,0.55),rgba(185,154,96,0.08)_38%,transparent_72%)] p-[1.5px]">
              <div className="rounded-[14px] bg-bg p-3 sm:p-4">
                <Viewer3DLazy mode="buyer" vehicleId={v.id} hotspots={hotspotsFor(v.id)} height={640} />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3 text-[11.5px] text-muted">
            <span>
              {model3d.status === "available"
                ? "Illustrative executive sedan asset with CC BY 4.0 licensing. Hotspots map directly to verified SQLite database damage rows."
                : `Labelled ${categoryLabelText} schematic — no licensed 3D model exists for this category, so no car GLB is substituted.`}
            </span>
            <span className="font-mono text-primary">Spatial Diagnostic Studio</span>
          </div>
        </section>

        {/* ---------------- Verification summary + Findings ---------------- */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <section
            className="relative flex flex-col overflow-hidden rounded-[18px] border border-border p-5"
            style={{ background: `color-mix(in srgb, ${band.color} 7%, var(--surface))` }}
          >
            <span
              className="pointer-events-none absolute inset-x-0 top-0 h-[3px]"
              style={{ background: band.color }}
            />
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="td-h2">Verification summary</h2>
                <p className="mt-0.5 text-[12.5px] text-muted">Deterministic rules engine · versioned</p>
              </div>
              <span className="td-icon-chip" style={{ background: `color-mix(in srgb, ${band.color} 16%, var(--surface))`, color: band.color }}>
                <Icon name="ShieldCheck" size={17} />
              </span>
            </div>

            <div className="flex flex-1 flex-col items-center justify-center py-4">
              <TrustRing score={detail.trust.trustScore} size={150} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-[11px] border border-border bg-surface-tint px-3.5 py-2.5 text-[12.5px]">
                <span className="text-muted">Evidence coverage</span>
                <span className="font-semibold text-ink td-metric">{detail.trust.evidenceCoverage}%</span>
              </div>
              <div className="flex items-center justify-between rounded-[11px] border border-border bg-surface-tint px-3.5 py-2.5 text-[12.5px]">
                <span className="text-muted">Record integrity</span>
                <span
                  className="inline-flex items-center gap-1.5 font-semibold"
                  style={{ color: detail.chain.intact ? "var(--success)" : "var(--danger)" }}
                >
                  <Icon name={detail.chain.intact ? "Layers" : "ShieldX"} size={12} />
                  {detail.chain.intact ? "Hash chain intact" : "Chain broken"}
                </span>
              </div>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              Missing data is unverified coverage — not proof of fraud. No accident or theft record in supported sources does not
              guarantee the vehicle has none.
            </p>
          </section>

          <section className="relative flex flex-col overflow-hidden rounded-[18px] border border-border bg-surface p-5">
            <span className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,var(--primary),color-mix(in_srgb,var(--primary)_20%,transparent)_70%)]" />
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="td-h2">Vehicle Findings &amp; Insights</h2>
                <p className="mt-0.5 text-[12.5px] text-muted">Deterministic evidence correlation</p>
              </div>
              <span className="td-icon-chip">
                <Icon name="AlertCircle" size={17} />
              </span>
            </div>
            <div className="mt-4 space-y-2.5 flex-1">
              {detail.insights.length > 0 ? (
                detail.insights.map((ins, idx) => {
                  const tone = INSIGHT_TONE[ins.status] ?? INSIGHT_TONE.unverified;
                  return (
                    <div
                      key={idx}
                      className="rounded-[11px] border border-border bg-surface-tint p-3 text-[12px]"
                      style={{ borderLeft: `3px solid ${tone.color}` }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span style={{ color: tone.color }}>
                          <Icon name={tone.icon} size={13} />
                        </span>
                        <span className="font-semibold text-ink">{ins.label}</span>
                      </div>
                      <div className="mt-1 text-muted text-[11px] leading-relaxed">{ins.detail}</div>
                    </div>
                  );
                })
              ) : (
                <div className="flex h-full items-center justify-center text-center text-muted text-[12px]">
                  No anomalies detected in verified records.
                </div>
              )}
            </div>
          </section>
        </div>

        {crossModal && (
          <section className="rounded-[18px] border border-border bg-surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="td-h2">Cross-modal odometer check</h2>
                <p className="mt-0.5 text-[12.5px] text-muted">
                  Declared, document-extracted and independent readings compared inside matching time windows.
                </p>
              </div>
              <StatusBadge
                status={crossModal.status === "conflict" ? "suspicious" : crossModal.status === "consistent" ? "verified" : "unverified"}
                label={crossModal.status.replace(/_/g, " ")}
              />
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                ["Seller declared", crossModal.inputs.sellerDeclared],
                ["Document extracted", crossModal.inputs.documentExtracted],
                ["Independent", crossModal.inputs.independent],
              ].map(([label, count]) => (
                <div key={String(label)} className="rounded-[10px] border border-border bg-surface-tint px-2 py-2.5">
                  <div className="text-[19px] font-bold leading-none text-ink td-metric">{count}</div>
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.05em] text-muted">{label}</div>
                </div>
              ))}
            </div>

            {crossModal.conflicts.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {crossModal.conflicts.slice(0, 4).map((conflict, index) => (
                  <li key={`${conflict.type}-${index}`} className="rounded-[9px] border border-danger/20 bg-danger-bg px-3 py-2 text-[11.5px] text-ink">
                    <span className="font-semibold uppercase tracking-[0.05em] text-danger">{conflict.severity}</span> · {conflict.detail}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-[11.5px] leading-relaxed text-muted">{crossModal.note}</p>
            )}
            <p className="mt-2 text-[10.5px] text-muted">Method: {crossModal.method} · rules {crossModal.version}</p>
          </section>
        )}

        <EvidenceGraph graph={graph} />

        <VehicleDetailPanel data={panel} />

        <p className="pb-4 text-[12px] leading-relaxed text-muted">
          TrustDrive reports are generated from records on file. Findings are warnings that need investigation — they are not proof
          of fraud. Always inspect a vehicle before purchase.
        </p>
      </main>

      {session && (
        <div className="mx-auto max-w-5xl px-4 pb-10 sm:px-6">
          <ProviderChecksPanel vehicleId={v.id} role="buyer" />
        </div>
      )}

      <AiAssistant vehicleId={v.id} vehicleLabel={`${v.make} ${v.model}`} />
    </div>
  );
}
