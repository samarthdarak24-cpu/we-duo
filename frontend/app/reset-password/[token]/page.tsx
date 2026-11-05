import type { Metadata } from "next";
import { AuthShell } from "@/components/shared/AuthShell";
import { ResetPasswordForm } from "@/components/shared/AuthRecovery";

export const metadata: Metadata = { title: "Choose a new password — TrustDrive" };

export default function ResetPasswordPage({ params }: { params: { token: string } }) {
  return (
    <AuthShell
      eyebrow="Signed reset link"
      title="Choose a new password"
      subtitle="This link is time-limited and single-use. Setting a new password revokes every existing session."
    >
      <ResetPasswordForm token={params.token} />
    </AuthShell>
  );
}
