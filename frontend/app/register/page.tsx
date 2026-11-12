import type { Metadata } from "next";
import { AuthForm } from "@/components/shared/AuthForm";

export const metadata: Metadata = {
  title: "Create Account — TrustDrive Automotive Truth",
  description: "Register your account to access verified used car & motorcycle intelligence, or sell with transparency.",
};

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return <AuthForm mode="register" />;
}
