import type { Metadata } from "next";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { ReportActions } from "@/components/shared/ReportActions";
import { portalUser } from "@/lib/server/page";
import { getMarketplace, getReports, getSavedVehicles } from "@/lib/server/data";

export const metadata: Metadata = { title: "Reports — TrustDrive" };
export const dynamic = "force-dynamic";

export default function BuyerReportsPage() {
  const user = portalUser("buyer")!;
  const saved = getSavedVehicles(user.id);
  const market = getMarketplace({ pageSize: 12 }, user.id).items;
  const seen = new Set<string>();
  const vehicles = [...saved, ...market]
    .filter((v) => {
      if (seen.has(v.id)) return false;
      seen.add(v.id);
      return true;
    })
    .map((v) => ({ id: v.id, make: v.make, model: v.model, regNo: v.regNo }));

  return (
    <PortalShell portal="buyer" activeLabel="Reports" profile={user.profile} unread={user.unread} title="TrustDrive — Reports">
      <PageHeader
        eyebrow="Documents · PDF"
        title="Reports"
        subtitle="Generate, download and regenerate verification PDFs. Queued and processing reports are labelled honestly."
      />
      <ReportActions vehicles={vehicles} reports={getReports(user.id)} />
    </PortalShell>
  );
}
