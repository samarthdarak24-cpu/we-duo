import type { Metadata } from "next";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { VehicleSelector } from "@/components/seller/VehicleSelector";
import { VerificationCenter } from "@/components/seller/VerificationCenter";
import { portalUser } from "@/lib/server/page";
import { getChainStatus, getSellerVehicles, getVerificationChecks } from "@/lib/server/data";
import { getLatestRun, getTheft } from "@/lib/server/db";

export const metadata: Metadata = { title: "Verification Center — TrustDrive" };
export const dynamic = "force-dynamic";

export default function SellerVerificationPage({ searchParams }: { searchParams: { vehicle?: string } }) {
  const user = portalUser("seller")!;
  const vehicles = getSellerVehicles(user.id);
  const selected = vehicles.find((v) => v.id === searchParams.vehicle) ?? vehicles[0];

  return (
    <PortalShell portal="seller" activeLabel="Verification Center" profile={user.profile} unread={user.unread} title="TrustDrive — Verification Center">
      <PageHeader
        eyebrow="Evidence · Deterministic checks"
        title="Verification Center"
        subtitle="Run the supported checks against the records on file. Re-run after you fix a document or add missing evidence."
      />

      {!selected ? (
        <EmptyState
          icon="ShieldCheck"
          title="No vehicle selected"
          detail="Add a vehicle before running verification checks."
          action={
            <a href="/seller/add-vehicle" className="td-btn td-btn-primary mt-2">
              Add vehicle
            </a>
          }
        />
      ) : (
        <>
          <VehicleSelector vehicles={vehicles} selectedId={selected.id} basePath="/seller/verification" />

          <VerificationCenter
            vehicleId={selected.id}
            checks={getVerificationChecks(selected.id)}
            lastRun={(() => {
              const run = getLatestRun(selected.id);
              if (!run) return null;
              let summary: Record<string, unknown> = {};
              try {
                summary = JSON.parse(run.summary || "{}") as Record<string, unknown>;
              } catch {
                summary = {};
              }
              return { id: run.id, status: run.status, finishedAt: run.finished_at, summary };
            })()}
            chain={getChainStatus(selected.id)}
            theft={(() => {
              const t = getTheft(selected.id);
              return t ? { status: t.status, source: t.source, checkedAt: t.checked_at } : null;
            })()}
          />
        </>
      )}
    </PortalShell>
  );
}
