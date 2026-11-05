import type { Metadata } from "next";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { AddVehicleStepper } from "@/components/seller/AddVehicleStepper";
import { portalUser } from "@/lib/server/page";

export const metadata: Metadata = { title: "Add Vehicle — TrustDrive" };
export const dynamic = "force-dynamic";

export default function AddVehiclePage() {
  const user = portalUser("seller")!;
  return (
    <PortalShell portal="seller" activeLabel="Add Vehicle" profile={user.profile} unread={user.unread} title="TrustDrive — Add Vehicle">
      <PageHeader title="Add Vehicle" subtitle="Register a vehicle in a few steps. Drafts are saved automatically." />
      <AddVehicleStepper />
    </PortalShell>
  );
}
