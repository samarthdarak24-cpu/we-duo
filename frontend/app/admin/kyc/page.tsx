import type { Metadata } from "next";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { AdminKyc } from "@/components/admin/AdminKyc";
import { portalUser } from "@/lib/server/page";
import { getAdminKycQueue } from "@/lib/server/data";

export const metadata: Metadata = { title: "Seller KYC — TrustDrive Admin" };
export const dynamic = "force-dynamic";

export default function AdminKycPage() {
  const user = portalUser("admin");
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg p-4">
        <div className="card max-w-md p-6 text-center">
          <h1 className="text-title font-extrabold text-ink">Admin sign-in required</h1>
          <p className="mt-1 text-body text-muted">Use the seeded admin demo account to review seller KYC.</p>
          <a href="/login" className="mt-4 inline-block rounded-pill bg-primary px-4 py-2.5 text-caption font-semibold text-[var(--on-primary)]">
            Sign in
          </a>
        </div>
      </div>
    );
  }

  const data = getAdminKycQueue();

  return (
    <PortalShell portal="admin" activeLabel="Seller KYC" profile={user.profile} unread={user.unread} title="TrustDrive — Seller KYC">
      <PageHeader title="Seller KYC" subtitle="Review business identity documents before sellers can publish. Decisions notify the seller." />
      <AdminKyc items={data.items} counts={data.counts} />
    </PortalShell>
  );
}
