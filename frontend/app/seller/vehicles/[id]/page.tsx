import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { VehicleSelector } from "@/components/seller/VehicleSelector";
import { DamageEditor } from "@/components/seller/DamageEditor";
import { DamageAiAnalyzer } from "@/components/seller/DamageAiAnalyzer";
import { ClaimsPanel } from "@/components/seller/ClaimsPanel";
import { ProviderChecksPanel } from "@/components/seller/ProviderChecksPanel";
import { EvidenceGraph } from "@/components/shared/EvidenceGraph";
import { Viewer3DLazy } from "@/components/shared/Viewer3DLazy";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TrustRing } from "@/components/ui/TrustRing";
import { Timeline } from "@/components/ui/Timeline";
import { Icon } from "@/components/ui/Icon";
import { portalUser } from "@/lib/server/page";
import { BAND_COLOR } from "@/lib/server/engine";
import { getListingByVehicle, getListingImages } from "@/lib/server/db";
import {
  getChainStatus,
  getDocumentsView,
  getMileageView,
  getSellerVehicles,
  getVehicleReport,
  hotspotsFor,
} from "@/lib/server/data";
import { buildEvidenceGraph, getVehicleClaims } from "@/lib/server/evidence";
import { formatINR, formatKm } from "@/lib/format";

export const metadata: Metadata = { title: "Vehicle Details — TrustDrive" };
export const dynamic = "force-dynamic";

export default function SellerVehicleDetailPage({ params }: { params: { id: string } }) {
  const user = portalUser("seller")!;
  const report = getVehicleReport(params.id);
  if (!report || report.vehicle.owner_id !== user.id) notFound();

  const v = report.vehicle;
  const chain = getChainStatus(v.id);
  const docs = getDocumentsView(v.id);
  const mileage = getMileageView(v.id);
  const hotspots = hotspotsFor(v.id);
  const listing = getListingByVehicle(v.id);
  const photos = listing ? getListingImages(listing.id).map((p: { id: string; file_key: string }) => ({
    id: p.id,
    key: p.file_key,
    url: `/api/v1/files/${p.file_key}`,
  })) : [];
  const openFindings = report.findings.filter((f) => !["cleared", "explained", "resolved"].includes(f.status));
  const siblings = getSellerVehicles(user.id);
  const bandColor = BAND_COLOR[report.trust.band];
  const claims = getVehicleClaims(v.id);
  const graph = buildEvidenceGraph(v.id, { id: user.id, role: "seller" });
  const damageCount = hotspots.reduce((total, hotspot) => total + hotspot.damage.length, 0);
  const damageRecords = hotspots
    .flatMap((h) =>
      h.damage.map((d) => ({
        id: d.id,
        zoneLabel: h.label,
        severity: d.severity,
        description: d.description,
        repairStatus: d.repairStatus,
        status: d.status,
        inspectionDate: d.inspectionDate,
      }))
    )
    .sort((a, b) => (a.status === "pending" ? -1 : 0) - (b.status === "pending" ? -1 : 0))
    .slice(0, 40);

  return (
    <PortalShell
      portal="seller"
      activeLabel="My Vehicles"
      profile={user.profile}
      unread={user.unread}
      title="TrustDrive — Vehicle Details"
      selector={{ label: `${v.make} ${v.model}`, sub: v.reg_no }}
    >
      <PageHeader
        eyebrow="Garage · Vehicle record"
        title={`${v.make} ${v.model}${v.variant ? ` ${v.variant}` : ""}`}
        subtitle={`${v.year} · ${v.reg_no} · ${v.fuel} · ${v.transmission} · ${formatKm(v.km_claimed)}`}
      >
        <a href={`/vehicle/${v.id}`} target="_blank" rel="noreferrer" className="td-btn td-btn-secondary">
          <Icon name="Eye" size={15} /> Buyer view
        </a>
        <a href={`/seller/history?vehicle=${v.id}`} className="td-btn td-btn-primary">
          <Icon name="History" size={15} /> History
        </a>
      </PageHeader>

      <VehicleSelector
        vehicles={siblings.map((s) => ({ id: s.id, make: s.make, model: s.model, year: s.year, regNo: s.regNo }))}
        selectedId={v.id}
        basePath="/seller/vehicles"
      />

      {/* Expanded 3D Vehicle Damage Inspection Studio */}
      <section id="viewer" className="overflow-hidden rounded-[18px] border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
              <h2 className="td-h2">Vehicle 3D Inspection Studio</h2>
            </div>
            <p className="mt-0.5 text-[12.5px] text-muted">
              Interactive spatial diagnostic model. Raycast any panel to inspect verified records, or explore Exploded &amp; X-Ray modes.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="td-chip">
              <Icon name="ScanSearch" size={13} /> {hotspots.filter((h) => h.damage.length).length} damage panel{hotspots.filter((h) => h.damage.length).length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div className="p-3 sm:p-4">
          <Viewer3DLazy mode="seller" vehicleId={v.id} hotspots={hotspots} height={620} />
        </div>

        <div className="flex flex-wrap items-center justify-between border-t border-border px-5 py-3 text-[11.5px] text-muted">
          <span>The model is an illustrative executive sedan asset with CC BY 4.0 licensing. Hotspots map directly to verified SQLite database damage rows.</span>
          <span className="font-mono text-primary">Spatial Diagnostic Studio</span>
        </div>
      </section>

      {/* Trust & Integrity + Claims Summary */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
        <SectionCard title="Trust &amp; integrity" description="Deterministic score, versioned and additive.">
          <div className="flex flex-col items-center">
            <TrustRing score={report.trust.trustScore} size={150} />
            <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
              <span className="pill" style={{ color: bandColor.color, background: bandColor.bg }}>
                {report.trust.bandLabel}
              </span>
              <span className="td-chip">{report.coverage}% evidence coverage</span>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-[10px] border border-border bg-surface-tint px-2 py-2.5">
              <div className="text-[20px] font-bold leading-none text-ink">{openFindings.length}</div>
              <div className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">Open findings</div>
            </div>
            <div className="rounded-[10px] border border-border bg-surface-tint px-2 py-2.5">
              <div className="text-[20px] font-bold leading-none text-ink">{chain.records}</div>
              <div className="mt-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted">Chain records</div>
            </div>
          </div>
          <p className={"mt-3 flex items-center gap-1.5 text-[12px] font-semibold " + (chain.intact ? "text-success" : "text-danger")}>
            <Icon name={chain.intact ? "ShieldCheck" : "ShieldAlert"} size={14} />
            {chain.intact ? "Hash chain intact" : `Hash chain broken at record ${chain.brokenAt}`}
          </p>
        </SectionCard>

        <ClaimsPanel vehicleId={v.id} claims={claims} />
        <ProviderChecksPanel vehicleId={v.id} role="seller" />
      </div>

      <div>
        <DamageEditor
          vehicleId={v.id}
          zones={hotspots.map((h) => ({ id: h.id, label: h.label }))}
          recordCount={damageCount}
          records={damageRecords}
        />
      </div>

      {photos.length > 0 && (
        <div>
          <DamageAiAnalyzer vehicleId={v.id} photos={photos} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SectionCard title="Vehicle">
          <div className="space-y-1.5">
            {[
              ["Registration", v.reg_no],
              ["VIN", v.vin || "—"],
              ["TrustDrive ID", v.trustdrive_id],
              ["Colour", v.color || "—"],
              ["Ownership", v.ownership_count === 1 ? "First owner" : `${v.ownership_count} owners`],
              ["Location", v.location || "—"],
              ["Claimed mileage", formatKm(v.km_claimed)],
              ["Verified mileage", v.last_verified_km ? formatKm(v.last_verified_km) : "—"],
              ["Asking price", formatINR(v.asking_price)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="text-muted">{label}</span>
                <span className="text-right font-semibold text-ink">{value}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Documents"
          description={`${docs.length} on file`}
          action={
            <a href={`/seller/documents?vehicle=${v.id}`} className="td-link">
              Manage <Icon name="ChevronRight" size={12} />
            </a>
          }
        >
          <div className="space-y-1.5">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 rounded-[8px] px-1 py-1.5 hover:bg-surface-tint">
                <span className="min-w-0 truncate text-[11.5px] text-ink">
                  {d.type.toUpperCase()} · {d.file_name}
                </span>
                <StatusBadge status={d.status} />
              </div>
            ))}
            {!docs.length && <p className="py-6 text-center text-[12px] text-muted">No documents uploaded.</p>}
          </div>
        </SectionCard>

        <SectionCard
          title="Findings"
          description={`${openFindings.length} open`}
          action={
            <a href={`/seller/fraud?vehicle=${v.id}`} className="td-link">
              Review <Icon name="ChevronRight" size={12} />
            </a>
          }
        >
          <div className="space-y-2">
            {openFindings.slice(0, 4).map((f) => (
              <div key={f.id} className="rounded-[9px] border border-border bg-surface-tint px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11.5px] font-semibold text-ink">{f.title}</span>
                  <StatusBadge status={f.status} />
                </div>
                <p className="truncate text-[11px] text-muted">{f.explanation}</p>
              </div>
            ))}
            {!openFindings.length && (
              <p className="flex items-center justify-center gap-1.5 py-6 text-center text-[12px] text-success">
                <Icon name="CheckCircle2" size={14} /> No open findings.
              </p>
            )}
          </div>
        </SectionCard>
      </div>

      <EvidenceGraph graph={graph} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <SectionCard title="History" description="Immutable, chained event record.">
          <Timeline events={report.history} />
        </SectionCard>

        <SectionCard title="Odometer readings" description={`Verified ${mileage.verifiedKm ? formatKm(mileage.verifiedKm) : "—"} · claimed ${mileage.claimedKm ? formatKm(mileage.claimedKm) : "—"}`}>
          <div className="td-scroll max-h-72 space-y-1 overflow-y-auto pr-1">
            {mileage.readings.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-[8px] px-1.5 py-1.5 text-[12px] hover:bg-surface-tint">
                <span className="text-muted">
                  {new Date(m.date).toLocaleDateString("en-IN", { month: "short", year: "numeric" })} · {m.source.replace(/_/g, " ")}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="font-semibold text-ink">{formatKm(m.km)}</span>
                  {m.flagged ? (
                    <StatusBadge status="suspicious" label="Flagged" />
                  ) : m.verified ? (
                    <StatusBadge status="verified" />
                  ) : (
                    <StatusBadge status="pending" label="Claim" />
                  )}
                </span>
              </div>
            ))}
            {!mileage.readings.length && <p className="py-6 text-center text-[12px] text-muted">No readings yet.</p>}
          </div>
        </SectionCard>
      </div>

      <div className="flex flex-wrap gap-2">
        <a href={`/seller/documents?vehicle=${v.id}`} className="td-btn td-btn-secondary td-btn-sm">
          <Icon name="FolderOpen" size={13} /> Documents
        </a>
        <a href={`/seller/history?vehicle=${v.id}`} className="td-btn td-btn-secondary td-btn-sm">
          <Icon name="History" size={13} /> History
        </a>
        <a href={`/seller/verification?vehicle=${v.id}`} className="td-btn td-btn-secondary td-btn-sm">
          <Icon name="ShieldCheck" size={13} /> Verification center
        </a>
        <a href={`/seller/listings?vehicle=${v.id}`} className="td-btn td-btn-secondary td-btn-sm">
          <Icon name="Store" size={13} /> Listing
        </a>
      </div>
    </PortalShell>
  );
}
