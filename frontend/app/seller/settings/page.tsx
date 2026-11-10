import type { Metadata } from "next";
import { PortalShell } from "@/components/shared/PortalShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { SettingsForm } from "@/components/shared/SettingsForm";
import { SecurityCenter } from "@/components/shared/SecurityCenter";
import { AccountDangerZone } from "@/components/shared/AccountDangerZone";
import { IntegrationStatus } from "@/components/seller/IntegrationStatus";
import { portalUser } from "@/lib/server/page";

export const metadata: Metadata = { title: "Settings — TrustDrive" };
export const dynamic = "force-dynamic";

export default function SellerSettingsPage() {
  const user = portalUser("seller")!;
  return (
    <PortalShell portal="seller" activeLabel="Profile & Settings" profile={user.profile} unread={user.unread} title="TrustDrive — Settings">
      <PageHeader
        eyebrow="Account"
        title="Profile & Settings"
        subtitle="Manage your seller profile, verification, notifications and privacy. Changes are saved to the shared database."
      />
      <SettingsForm
        profile={{
          name: user.me.name,
          email: user.me.email,
          role: user.me.role,
          phone: user.me.phone ?? "",
          city: user.me.city ?? "",
          sellerType: user.me.sellerType ?? "individual",
          businessName: user.me.businessName ?? "",
          preferences: user.me.preferences,
        }}
      />
      <div className="pt-2">
        <h2 className="td-h2 mb-1">Security, KYC &amp; sessions</h2>
        <p className="td-help mb-4">Upload your profile photo and KYC document, enable two-factor authentication and revoke other devices.</p>
        <SecurityCenter
          profile={{
            name: user.me.name,
            email: user.me.email,
            role: user.me.role,
            initials: user.me.initials,
            avatarUrl: user.me.avatarUrl,
            emailVerified: user.me.emailVerified,
            twofaEnabled: user.me.twofaEnabled,
            kycStatus: user.me.kycStatus,
            lastLoginAt: user.me.lastLoginAt,
          }}
        />
      </div>
      <div className="pt-2">
        <SectionCard
          title="Platform &amp; integration readiness"
          description="Live status of the intelligence service, fraud model, registry connectors, storage, and notifications."
        >
          <IntegrationStatus />
        </SectionCard>
      </div>
      <AccountDangerZone />
    </PortalShell>
  );
}
