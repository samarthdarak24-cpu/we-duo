import type { Metadata } from "next";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { SettingsForm } from "@/components/shared/SettingsForm";
import { SecurityCenter } from "@/components/shared/SecurityCenter";
import { AccountDangerZone } from "@/components/shared/AccountDangerZone";
import { portalUser } from "@/lib/server/page";

export const metadata: Metadata = { title: "Settings — TrustDrive" };
export const dynamic = "force-dynamic";

export default function AdminSettingsPage() {
  const user = portalUser("admin")!;
  return (
    <PortalShell portal="admin" activeLabel="Profile & Settings" profile={user.profile} unread={user.unread} title="TrustDrive — Settings">
      <PageHeader title="Profile & Settings" subtitle="Manage your admin account, notification preferences and review sessions." />
      <SettingsForm
        profile={{
          name: user.me.name,
          email: user.me.email,
          role: user.me.role,
          phone: user.me.phone ?? "",
          city: user.me.city ?? "",
          preferences: user.me.preferences,
        }}
      />
      <div className="pt-2">
        <h2 className="mb-1 font-display text-title font-bold text-ink">Security &amp; sessions</h2>
        <p className="mb-4 text-caption text-muted">Profile photo, email status, two-factor authentication and every device signed in to your admin account.</p>
        <SecurityCenter
          profile={{
            name: user.me.name,
            email: user.me.email,
            role: user.me.role,
            initials: user.me.initials,
            avatarUrl: user.me.avatarUrl,
            emailVerified: user.me.emailVerified,
            twofaEnabled: user.me.twofaEnabled,
            lastLoginAt: user.me.lastLoginAt,
          }}
        />
      </div>
      <AccountDangerZone />
    </PortalShell>
  );
}
