import type { Metadata } from "next";
import { AuthShell } from "@/components/shared/AuthShell";
import { VerifyEmailGate } from "@/components/shared/AuthRecovery";

export const metadata: Metadata = { title: "Verify your email — TrustDrive" };

export default function VerifyEmailPage({ params }: { params: { token: string } }) {
  return (
    <AuthShell
      eyebrow="Identity proof"
      title="Verifying your email"
      subtitle="Email verification is required before sensitive account actions such as password recovery and seller KYC."
    >
      <VerifyEmailGate token={params.token} />
    </AuthShell>
  );
}
