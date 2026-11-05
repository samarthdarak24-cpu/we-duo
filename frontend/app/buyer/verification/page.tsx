import type { Metadata } from "next";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { VerificationLookup } from "@/components/buyer/VerificationLookup";
import { portalUser } from "@/lib/server/page";

export const metadata: Metadata = { title: "Vehicle Verification — TrustDrive" };
export const dynamic = "force-dynamic";

export default function BuyerVerificationPage({ searchParams }: { searchParams: { q?: string; type?: string } }) {
  const user = portalUser("buyer")!;
  const type =
    searchParams.type === "vin" || searchParams.type === "tdid" || searchParams.type === "qr" || searchParams.type === "reg"
      ? searchParams.type
      : "reg";
  return (
    <PortalShell portal="buyer" activeLabel="Vehicle Verification" profile={user.profile} unread={user.unread} title="TrustDrive — Vehicle Verification">
      <PageHeader
        eyebrow="Evidence · Lookup"
        title="Vehicle Verification"
        subtitle="Look up any vehicle by registration, VIN, TrustDrive ID or signed QR token. No record is a result, not an error."
      />
      <VerificationLookup initial={searchParams.q ?? ""} initialType={type} />
    </PortalShell>
  );
}
