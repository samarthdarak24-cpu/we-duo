import type { Metadata } from "next";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { AdminQueue } from "@/components/admin/AdminQueue";
import { portalUser } from "@/lib/server/page";
import { getAdminQueue } from "@/lib/server/data";

export const metadata: Metadata = { title: "Review Queue — TrustDrive Admin" };
export const dynamic = "force-dynamic";

export default function AdminQueuePage() {
  const user = portalUser("admin");
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg p-4">
        <div className="card max-w-md p-6 text-center">
          <h1 className="text-title font-extrabold text-ink">Admin sign-in required</h1>
          <p className="mt-1 text-body text-muted">Use the seeded admin demo account to open the review queue.</p>
          <a href="/login" className="mt-4 inline-block rounded-pill bg-primary px-4 py-2.5 text-caption font-semibold text-[var(--on-primary)]">
            Sign in
          </a>
        </div>
      </div>
    );
  }

  const data = getAdminQueue();

  return (
    <PortalShell portal="admin" activeLabel="Review Queue" profile={user.profile} unread={user.unread} title="TrustDrive — Admin Review Queue">
      <PageHeader
        title="Review Queue"
        subtitle="Disputes, listings and documents that need a human decision. Every decision is audit-logged."
      />
      <AdminQueue data={data} />
    </PortalShell>
  );
}
