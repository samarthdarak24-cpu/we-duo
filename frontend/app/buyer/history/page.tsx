import type { Metadata } from "next";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { VehicleSelector } from "@/components/seller/VehicleSelector";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Icon } from "@/components/ui/Icon";
import { HistoryExplorer } from "@/components/buyer/HistoryExplorer";
import { AiAssistant } from "@/components/shared/AiAssistant";
import { portalUser } from "@/lib/server/page";
import { getChainStatus, getHistoryView, getMarketplace, getMileageView, getVehicleReport } from "@/lib/server/data";
import { formatKm } from "@/lib/format";

export const metadata: Metadata = { title: "Vehicle History — TrustDrive" };
export const dynamic = "force-dynamic";

export default function BuyerHistoryPage({ searchParams }: { searchParams: { vehicle?: string } }) {
  const user = portalUser("buyer")!;
  const listing = getMarketplace({ pageSize: 12 }, user.id).items;
  // Default to a vehicle that actually has stored events so the demo timeline
  // is never presented as an empty "nothing happened" record.
  const defaultVehicle = listing.find((l) => getHistoryView(l.id).length > 0)?.id;
  const vehicleId = searchParams.vehicle ?? defaultVehicle ?? listing[0]?.id ?? "v-bmw";
  const report = getVehicleReport(vehicleId, user.id);

  if (!report) {
    return (
      <PortalShell portal="buyer" activeLabel="Vehicle History" profile={user.profile} unread={user.unread} title="TrustDrive — Vehicle History">
        <PageHeader eyebrow="Record" title="Vehicle History" subtitle="Chronological record of verified events." />
        <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
          <p className="text-[13px] text-muted">Vehicle not found.</p>
          <a href="/buyer/explore" className="td-btn td-btn-primary mt-2">
            Explore vehicles
          </a>
        </div>
      </PortalShell>
    );
  }

  const v = report.vehicle;
  const chain = getChainStatus(v.id);
  const mileage = getMileageView(v.id);
  const historyEvents = getHistoryView(v.id);

  const theftTone: "neutral" | "warning" | "danger" =
    report.theft?.status === "no_record" ? "neutral" : report.theft?.status === "unavailable" ? "warning" : "danger";
  const theftTitle =
    report.theft?.status === "no_record"
      ? "No theft record found in supported sources"
      : report.theft?.status === "unavailable"
        ? "Theft source unavailable"
        : "Theft record found — investigate";
  const theftDetail =
    report.theft?.status === "no_record"
      ? "This check completed, but an empty result does not guarantee the vehicle is not stolen."
      : report.theft?.status === "unavailable"
        ? "This check could not be completed. Treat the vehicle as unverified for theft."
        : "A supported source returned a theft record. Treat it as a warning that needs investigation, not proof of fraud.";

  return (
    <PortalShell portal="buyer" activeLabel="Vehicle History" profile={user.profile} unread={user.unread} title="TrustDrive — Vehicle History" hideAssistant>
      <PageHeader
        eyebrow="Record · Buyer view"
        title="Vehicle History"
        subtitle={`${v.make} ${v.model} · ${v.reg_no} — verified events from supported sources.`}
      >
        <a href={`/vehicle/${v.id}`} className="td-btn td-btn-primary">
          <Icon name="FileText" size={15} /> Full report
        </a>
      </PageHeader>

      <VehicleSelector
        vehicles={listing.map((l) => ({ id: l.id, make: l.make, model: l.model, year: l.year, regNo: l.regNo }))}
        selectedId={v.id}
        basePath="/buyer/history"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        <HistoryExplorer events={historyEvents} vehicleLabel={`${v.make} ${v.model} · ${v.reg_no}`} vehicleId={v.id} />

        <div className="space-y-4">
          <SectionCard title="Record integrity" description="Each event is chained to the previous record.">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between rounded-[10px] border border-border bg-surface-tint px-3 py-2 text-[12px]">
                <span className="text-muted">Hash chain</span>
                <span className={"font-semibold " + (chain.intact ? "text-success" : "text-danger")}>
                  {chain.intact ? "Intact" : `Broken at ${chain.brokenAt}`}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-[10px] border border-border bg-surface-tint px-3 py-2 text-[12px]">
                <span className="text-muted">Records</span>
                <span className="font-semibold text-ink">{chain.records}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-[10px] border border-border bg-surface-tint px-3 py-2 text-[12px]">
                <span className="text-muted">Latest hash</span>
                <span className="max-w-[150px] truncate font-mono text-[11px] text-ink">{chain.latestHash ?? "—"}</span>
              </div>
            </div>
            <p className="td-help mt-2.5">A broken chain means a record was altered outside the audit flow.</p>
          </SectionCard>

          <SectionCard title="Odometer" description={`Verified ${mileage.verifiedKm ? formatKm(mileage.verifiedKm) : "—"} · claimed ${mileage.claimedKm ? formatKm(mileage.claimedKm) : "—"}`}>
            <div className="td-scroll max-h-64 space-y-1 overflow-y-auto pr-1">
              {mileage.readings.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-[8px] px-1.5 py-1.5 text-[12px] hover:bg-surface-tint">
                  <span className="text-muted">{new Date(m.date).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</span>
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
              {!mileage.readings.length && <p className="py-6 text-center text-[12px] text-muted">No odometer readings on file.</p>}
            </div>
          </SectionCard>
        </div>
      </div>

      <InlineAlert tone={theftTone} title={theftTitle} detail={theftDetail} />

      <AiAssistant vehicleId={v.id} vehicleLabel={`${v.make} ${v.model}`} />
    </PortalShell>
  );
}
