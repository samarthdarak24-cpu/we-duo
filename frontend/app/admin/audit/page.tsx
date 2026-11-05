import type { Metadata } from "next";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { AuditLog } from "@/components/admin/AuditLog";
import { getAuditActors } from "@/lib/server/db-intelligence";
import { getSchemaUpgradeReport } from "@/lib/server/db";
import { portalUser } from "@/lib/server/page";

export const metadata: Metadata = { title: "Audit Log — TrustDrive Admin" };
export const dynamic = "force-dynamic";

const integrity = (report: unknown) => {
  if (!report || typeof report !== "object") return null;
  return report as { rebuilt: string[]; skipped: string[]; violations: string[]; backupPath: string | null };
};

export default function AdminAuditPage() {
  const user = portalUser("admin");
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg p-4">
        <div className="card max-w-md p-6 text-center">
          <h1 className="text-title font-extrabold text-ink">Admin sign-in required</h1>
          <p className="mt-1 text-body text-muted">Use the seeded admin demo account to open the audit trail.</p>
          <a href="/login" className="mt-4 inline-block rounded-pill bg-primary px-4 py-2.5 text-caption font-semibold text-[var(--on-primary)]">
            Sign in
          </a>
        </div>
      </div>
    );
  }

  const actors = getAuditActors();
  const report = integrity(getSchemaUpgradeReport());

  return (
    <PortalShell portal="admin" activeLabel="Audit Log" profile={user.profile} unread={user.unread} title="TrustDrive — Audit Log">
      <PageHeader
        title="Audit Log"
        subtitle="Who changed what, when, and from which address. Rows are append-only: they can be added to, never edited."
      />
      {report && (
        <p className="rounded-card border border-border bg-surface-tint px-4 py-2 text-caption text-muted">
          Schema integrity: {report.rebuilt.length} table(s) carry declared foreign keys, {report.skipped.length} skipped,{" "}
          {report.violations.length} referential violation(s).
          {report.backupPath ? " A pre-upgrade snapshot is kept under .data/." : ""}
        </p>
      )}
      <AuditLog actors={actors} />
    </PortalShell>
  );
}
