import type { Metadata } from "next";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { AdminUsers } from "@/components/admin/AdminUsers";
import { getUsersByRole } from "@/lib/server/db";
import { portalUser } from "@/lib/server/page";

export const metadata: Metadata = { title: "Users — TrustDrive Admin" };
export const dynamic = "force-dynamic";

export default function AdminUsersPage() {
  const user = portalUser("admin");
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg p-4">
        <div className="card max-w-md p-6 text-center">
          <h1 className="text-title font-extrabold text-ink">Admin sign-in required</h1>
          <p className="mt-1 text-body text-muted">Use the seeded admin demo account to manage accounts.</p>
          <a href="/login" className="mt-4 inline-block rounded-pill bg-primary px-4 py-2.5 text-caption font-semibold text-[var(--on-primary)]">
            Sign in
          </a>
        </div>
      </div>
    );
  }

  const rows = [
    ...getUsersByRole("seller"),
    ...getUsersByRole("buyer"),
    ...getUsersByRole("admin"),
  ]
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      kycStatus: u.kyc_status,
      createdAt: u.created_at,
    }))
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));

  return (
    <PortalShell portal="admin" activeLabel="Users" profile={user.profile} unread={user.unread} title="TrustDrive — Users">
      <PageHeader
        eyebrow="Administration"
        title="Users"
        subtitle="Seller, buyer and admin accounts. Deletion is a soft delete: access is revoked and the row is retained for audit."
      />
      <AdminUsers initial={rows} />
    </PortalShell>
  );
}
