import type { Metadata } from "next";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { AddVehicleStepper } from "@/components/seller/AddVehicleStepper";
import { getMe } from "@/lib/server/data";

export const metadata: Metadata = { title: "Add Vehicle — TrustDrive" };
export const dynamic = "force-dynamic";

export default function AddVehiclePage() {
  const me = getMe("u-seller")!;
  const profile = { name: me.name, role: me.role, avatarInitials: me.initials };
  return (
    <PortalShell portal="seller" activeLabel="Add Vehicle" profile={profile} title="TrustDrive — Add Vehicle">
      <PageHeader title="Add Vehicle" subtitle="Register a vehicle in a few steps. Drafts are saved automatically." />
      <AddVehicleStepper />
    </PortalShell>
  );
}
