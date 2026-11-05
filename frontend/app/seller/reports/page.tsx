import type { Metadata } from "next";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { ReportActions } from "@/components/shared/ReportActions";
import { portalUser } from "@/lib/server/page";
import { getReports, getSellerVehicles } from "@/lib/server/data";

export const metadata: Metadata = { title: "Reports — TrustDrive" };
export const dynamic = "force-dynamic";

export default function SellerReportsPage() {
  const user = portalUser("seller")!;
  const vehicles = getSellerVehicles(user.id).map((v) => ({ id: v.id, make: v.make, model: v.model, regNo: v.regNo }));
  const reports = getReports(user.id);

  return (
    <PortalShell portal="seller" activeLabel="Reports" profile={user.profile} unread={user.unread} title="TrustDrive — Reports">
      <PageHeader
        eyebrow="Documents · PDF"
        title="Reports"
        subtitle="Generate a verifiable PDF from the records on file. Every report carries an ID and generation timestamp."
      />
      <ReportActions vehicles={vehicles} reports={reports} />
    </PortalShell>
  );
}
