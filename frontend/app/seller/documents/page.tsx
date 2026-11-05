import type { Metadata } from "next";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { VehicleSelector } from "@/components/seller/VehicleSelector";
import { DocumentsManager } from "@/components/seller/DocumentsManager";
import { Icon } from "@/components/ui/Icon";
import { portalUser } from "@/lib/server/page";
import { getDocumentsView, getSellerVehicles, getVehicleReport } from "@/lib/server/data";
import { nearDuplicateDocuments } from "@/lib/server/evidence";

export const metadata: Metadata = { title: "Documents — TrustDrive" };
export const dynamic = "force-dynamic";

export default function SellerDocumentsPage({ searchParams }: { searchParams: { vehicle?: string } }) {
  const user = portalUser("seller")!;
  const vehicles = getSellerVehicles(user.id);
  const selected = vehicles.find((v) => v.id === searchParams.vehicle) ?? vehicles[0];

  return (
    <PortalShell portal="seller" activeLabel="Documents" profile={user.profile} unread={user.unread} title="Documents">
      <PageHeader
        eyebrow="Evidence"
        title="Documents"
        subtitle="Upload, share and re-verify the records that support your trust score."
        meta={
          selected ? (
            <>
              <span className="td-chip">
                <Icon name="Car" size={12} /> {selected.make} {selected.model}
              </span>
              <span className="td-chip">{selected.regNo}</span>
            </>
          ) : undefined
        }
      >
        <a href={`/seller/documents?vehicle=${selected?.id ?? ""}`} className="td-btn td-btn-secondary">
          <Icon name="Upload" size={15} /> Upload document
        </a>
        <a href={`/seller/verification?vehicle=${selected?.id ?? ""}`} className="td-btn td-btn-primary">
          <Icon name="ShieldCheck" size={15} /> Verification
        </a>
      </PageHeader>

      {!selected ? (
        <EmptyState
          icon="FolderOpen"
          title="No vehicle selected"
          detail="Add a vehicle before uploading documents."
          action={
            <a href="/seller/add-vehicle" className="td-btn td-btn-primary mt-2">
              Add vehicle
            </a>
          }
        />
      ) : (
        <>
          <VehicleSelector vehicles={vehicles} selectedId={selected.id} basePath="/seller/documents" />

          <InlineAlert
            tone="info"
            title="Verified documents cannot be overwritten"
            detail="Replacing one creates a new version linked to the original. The verified version stays in the audit trail, and a matching hash proves integrity — not authenticity."
          />

          <DocumentsManager
            vehicleId={selected.id}
            docs={getDocumentsView(selected.id)}
            completeness={getVehicleReport(selected.id)?.coverage ?? 0}
            nearDuplicates={nearDuplicateDocuments(selected.id)}
          />
        </>
      )}
    </PortalShell>
  );
}
