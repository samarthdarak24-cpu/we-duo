import type { Metadata } from "next";
import { AuthForm } from "@/components/shared/AuthForm";
import { areDemoAccountsEnabled } from "@/lib/server/db";

export const metadata: Metadata = {
  title: "Sign In — TrustDrive Automotive Truth",
  description: "Access your Buyer or Seller workspace with verified deterministic vehicle intelligence.",
};

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <AuthForm mode="login" demoEnabled={areDemoAccountsEnabled()} />;
}
