import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getVerificationCaseById } from "@/lib/server/evidence";
import { getVehicle } from "@/lib/server/db";
import { portalUser } from "@/lib/server/page";

export const metadata: Metadata = { title: "Verification case — TrustDrive" };
export const dynamic = "force-dynamic";

export default function VerificationCasePage({ params }: { params: { id: string } }) {
  const user = portalUser("seller")!;
  const data = getVerificationCaseById(params.id);
  if (!data) notFound();

  const vehicle = data.vehicle;
  const ownerId = vehicle ? getVehicle(vehicle.id)?.owner_id : undefined;
  const allowed = !!vehicle && (ownerId === user.id || user.me.role === "admin");

  return (
    <PortalShell portal="seller" activeLabel="Verification" profile={user.profile} unread={user.unread} title="TrustDrive — Verification case">
      <PageHeader
        eyebrow="Evidence · Case"
        title={`Verification case ${data.case.id}`}
        subtitle={vehicle ? `${vehicle.make} ${vehicle.model} · ${vehicle.regNo}` : "Vehicle unavailable"}
        meta={
          <>
            <span className="td-chip">{data.case.state}</span>
            <span className="td-chip">{data.case.rulesetVersion}</span>
            <span className="td-chip">{data.case.modelVersion}</span>
          </>
        }
      >
        {vehicle && (
          <a href={`/seller/verification?vehicle=${vehicle.id}`} className="td-btn td-btn-secondary">
            Back to verification
          </a>
        )}
      </PageHeader>

      {!allowed ? (
        <SectionCard title="Not available" description="This case belongs to another account.">
          <p className="text-caption text-muted">Sign in as the vehicle owner or an admin to view it.</p>
        </SectionCard>
      ) : (
        <div className="space-y-4">
          <SectionCard title="Run" description="Each case is tied to one persisted verification run.">
            {data.run ? (
              <dl className="grid grid-cols-2 gap-3 text-[12.5px] sm:grid-cols-4">
                <div><dt className="text-muted">Status</dt><dd className="mt-1"><StatusBadge status={data.run.status} /></dd></div>
                <div><dt className="text-muted">Run</dt><dd className="mt-1 font-mono text-[11px]">{data.run.id}</dd></div>
                <div><dt className="text-muted">Started</dt><dd className="mt-1">{new Date(data.run.startedAt).toLocaleString()}</dd></div>
                <div><dt className="text-muted">Finished</dt><dd className="mt-1">{data.run.finishedAt ? new Date(data.run.finishedAt).toLocaleString() : "—"}</dd></div>
              </dl>
            ) : (
              <p className="text-caption text-muted">No run is attached to this case.</p>
            )}
          </SectionCard>

          <SectionCard title="Checks" description={`${data.results.length} check(s) recorded for this run.`}>
            {data.results.length === 0 ? (
              <p className="text-caption text-muted">No checks were recorded.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12.5px]">
                  <thead>
                    <tr className="border-b border-border text-[10px] uppercase tracking-[0.14em] text-muted">
                      <th className="py-2 pr-3">Check</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Evidence</th>
                      <th className="py-2">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.results.map((r) => (
                      <tr key={r.id} className="border-b border-border/70 align-top last:border-0">
                        <td className="py-2.5 pr-3 font-mono text-[11px]">{r.checkKey}</td>
                        <td className="py-2.5 pr-3"><StatusBadge status={r.status} /></td>
                        <td className="py-2.5 pr-3 text-muted">{r.evidenceIds.length}</td>
                        <td className="py-2.5 font-mono text-[10.5px] text-muted">
                          {JSON.stringify(r.details).slice(0, 160)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Findings" description="Open findings remain warnings until reviewed; this page never clears them.">
            {data.findings.length === 0 ? (
              <p className="text-caption text-muted">No findings recorded for this vehicle.</p>
            ) : (
              <ul className="divide-y divide-border/70">
                {data.findings.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[12.5px]">
                    <span className="font-medium text-ink">{f.title}</span>
                    <span className="td-chip">{f.code}</span>
                    <span className="td-chip">{f.severity}</span>
                    <StatusBadge status={f.status} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      )}
    </PortalShell>
  );
}
