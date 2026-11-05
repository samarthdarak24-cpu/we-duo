import type { Metadata } from "next";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { VehicleManager } from "@/components/seller/VehicleManager";
import { Icon } from "@/components/ui/Icon";
import { portalUser } from "@/lib/server/page";
import { getSellerVehicles } from "@/lib/server/data";

export const metadata: Metadata = { title: "My Vehicles — TrustDrive" };
export const dynamic = "force-dynamic";

export default function SellerVehiclesPage() {
  const user = portalUser("seller")!;
  const vehicles = getSellerVehicles(user.id);

  return (
    <PortalShell portal="seller" activeLabel="My Vehicles" profile={user.profile} unread={user.unread} title="TrustDrive — My Vehicles">
      <PageHeader
        eyebrow="Garage"
        title="My Vehicles"
        subtitle={`${vehicles.length} vehicle${vehicles.length === 1 ? "" : "s"} registered. Each record carries its own evidence, verification history and listing state.`}
      >
        <a href="/seller/add-vehicle" className="td-btn td-btn-primary">
          <Icon name="Plus" size={15} /> Add vehicle
        </a>
      </PageHeader>

      {vehicles.length ? (
        <VehicleManager vehicles={vehicles} />
      ) : (
        <EmptyState
          icon="Car"
          title="No vehicles yet"
          detail="Register your first vehicle to begin verification and publish a listing."
          action={
            <a href="/seller/add-vehicle" className="td-btn td-btn-primary mt-2">
              Add vehicle
            </a>
          }
        />
      )}
    </PortalShell>
  );
}
