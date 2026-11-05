import type { Metadata } from "next";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { VehicleSelector } from "@/components/seller/VehicleSelector";
import { HistoryManager } from "@/components/seller/HistoryManager";
import { portalUser } from "@/lib/server/page";
import { getHistory, getMileage } from "@/lib/server/db";
import { getMileageView, getSellerVehicles } from "@/lib/server/data";

export const metadata: Metadata = { title: "Vehicle History — TrustDrive" };
export const dynamic = "force-dynamic";

export default function SellerHistoryPage({ searchParams }: { searchParams: { vehicle?: string } }) {
  const user = portalUser("seller")!;
  const vehicles = getSellerVehicles(user.id);
  const byParam = vehicles.find((v) => v.id === searchParams.vehicle);
  const withHistory = vehicles.find((v) => getHistory(v.id).length > 0);
  const selected = byParam ?? withHistory ?? vehicles[0];

  return (
    <PortalShell portal="seller" activeLabel="Vehicle History" profile={user.profile} unread={user.unread} title="TrustDrive — Vehicle History">
      <PageHeader
        eyebrow="Record · Immutable timeline"
        title="Vehicle History"
        subtitle="A chronological record of events on this vehicle. Verified entries are immutable; corrections are added as new pending records."
      />

      {!selected ? (
        <EmptyState
          icon="History"
          title="No vehicle selected"
          detail="Add a vehicle before recording history events."
          action={
            <a href="/seller/add-vehicle" className="td-btn td-btn-primary mt-2">
              Add vehicle
            </a>
          }
        />
      ) : (
        <>
          <VehicleSelector vehicles={vehicles} selectedId={selected.id} basePath="/seller/history" />

          <InlineAlert
            tone="info"
            title="Seller submissions start as pending"
            detail="Events and corrections are created with source seller_submitted until they are verified. The original record is never overwritten."
          />

          <HistoryManager
            vehicleId={selected.id}
            events={getHistory(selected.id)}
            mileage={getMileageView(selected.id).readings}
            verifiedKm={getMileageView(selected.id).verifiedKm}
            claimedKm={getMileageView(selected.id).claimedKm}
          />
          <p className="td-help">
            {getMileage(selected.id).length} odometer readings on file. The absence of a theft or accident record in supported sources
            does not guarantee the vehicle has none.
          </p>
        </>
      )}
    </PortalShell>
  );
}
