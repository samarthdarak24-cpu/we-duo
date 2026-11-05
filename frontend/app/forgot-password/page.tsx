import type { Metadata } from "next";
import { AuthShell } from "@/components/shared/AuthShell";
import { ForgotPasswordForm } from "@/components/shared/AuthRecovery";

export const metadata: Metadata = { title: "Reset your password — TrustDrive" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Password recovery"
      title="Forgot your password?"
      subtitle="Enter the email tied to your TrustDrive account and we'll send a signed, single-use reset link."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
