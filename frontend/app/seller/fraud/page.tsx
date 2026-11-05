import type { Metadata } from "next";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { VehicleSelector } from "@/components/seller/VehicleSelector";
import { FraudPanel } from "@/components/seller/FraudPanel";
import { InvestigationPanel } from "@/components/seller/InvestigationPanel";
import { portalUser } from "@/lib/server/page";
import { getDocumentsView, getRiskAnalysis, getSellerVehicles } from "@/lib/server/data";

export const metadata: Metadata = { title: "AI Fraud Analysis — TrustDrive" };
export const dynamic = "force-dynamic";

export default function SellerFraudPage({ searchParams }: { searchParams: { vehicle?: string } }) {
  const user = portalUser("seller")!;
  const vehicles = getSellerVehicles(user.id);
  const selected = vehicles.find((v) => v.id === searchParams.vehicle) ?? vehicles[0];
  const risk = selected ? getRiskAnalysis(selected.id) : null;

  return (
    <PortalShell portal="seller" activeLabel="AI Fraud Analysis" profile={user.profile} unread={user.unread} title="TrustDrive — AI Fraud Analysis">
      <PageHeader
        eyebrow="Intelligence · Risk review"
        title="AI Fraud Analysis"
        subtitle="Deterministic findings ranked by severity and explained in plain language. Flags are warnings — not proof of fraud."
      />

      {!selected || !risk ? (
        <EmptyState
          icon="BrainCircuit"
          title="No vehicle selected"
          detail="Add a vehicle to run the deterministic risk analysis."
          action={
            <a href="/seller/add-vehicle" className="td-btn td-btn-primary mt-2">
              Add vehicle
            </a>
          }
        />
      ) : (
        <>
          <VehicleSelector vehicles={vehicles} selectedId={selected.id} basePath="/seller/fraud" />

          <InlineAlert
            tone="warning"
            title="Flags need investigation, not a verdict"
            detail="A finding is cleared only by an admin review or a deterministic re-check. A seller explanation does not remove it."
          />

          <FraudPanel
            vehicleName={`${risk.vehicle.make} ${risk.vehicle.model}`}
            regNo={risk.vehicle.reg_no}
            riskScore={risk.riskScore}
            bandLabel={risk.bandLabel}
            findings={risk.findings}
            recommendedAction={risk.recommendedAction}
            disclaimer={risk.disclaimer}
            documents={getDocumentsView(selected.id).map((d) => ({ id: d.id, type: d.type, file_name: d.file_name, status: d.status }))}
          />

          <InvestigationPanel vehicleId={selected.id} />
        </>
      )}
    </PortalShell>
  );
}
