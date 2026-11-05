"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Icon } from "@/components/ui/Icon";

const demoAccounts = [
  { label: "Buyer", role: "buyer", email: "aditya@trustdrive.dev", name: "Aditya Darak" },
  { label: "Seller", role: "seller", email: "samarth@trustdrive.dev", name: "Samarth Darak" },
  { label: "Admin", role: "admin", email: "admin@trustdrive.dev", name: "TrustDrive Admin" },
];

export function AuthPortalSection() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fillDemo(acc: (typeof demoAccounts)[0]) {
    setEmail(acc.email);
    setPassword("demo1234");
    setError(null);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error?.message || "Authentication failed. Please check credentials.");
      }

      const role = data?.data?.user?.role || data?.user?.role || "buyer";
      const target = role === "seller" ? "/seller" : role === "admin" ? "/admin/queue" : "/buyer";
      router.push(target);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to authenticate session.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="portal-access" className="relative w-full py-24 bg-[#08090A] border-t border-[#23262A]/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Editorial Section Eyebrow */}
        <div className="text-center mb-12 space-y-2">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#111315] border border-[#23262A] text-xs font-mono text-[#C5A46D] uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-[#36B982] animate-pulse" />
            <span>Secure Platform Access</span>
          </div>
          <h2 className="font-display font-bold text-3xl sm:text-4xl text-white tracking-tight">
            One Platform. Two Intelligent Workspaces.
          </h2>
          <p className="text-sm text-[#7A8089] max-w-xl mx-auto">
            Experience evidence-backed vehicle verification as a buyer investigating history or as a seller showcasing certified authenticity.
          </p>
        </div>

        {/* ================= TWO-SIDE LAYOUT ================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch max-w-5xl mx-auto">
          {/* ================= LEFT SIDE: CAR IMAGE CARD WITH TEXT ================= */}
          <div className="lg:col-span-5 relative rounded-[32px] overflow-hidden bg-[#0D0E11] border border-[#23262A] p-8 sm:p-10 flex flex-col justify-between shadow-2xl shadow-black min-h-[580px]">
            {/* Cinematic Automotive Background Image */}
            <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
              <Image
                src="/frames/ezgif-frame-001.jpg"
                alt="TrustDrive Verified Vehicle"
                fill
                sizes="(max-width: 1024px) 100vw, 42vw"
                className="object-cover object-center opacity-40 brightness-95 contrast-125 scale-105"
                priority
              />
              {/* Ambient Top Glow */}
              <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[440px] h-[340px] bg-gradient-to-b from-[#6D28D9]/40 via-[#C5A46D]/15 to-transparent blur-[70px] rounded-full" />
              
              {/* Multi-layered dark gradients for crystal-clear readability */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#0D0E11] via-[#0D0E11]/70 to-[#0D0E11]/85" />
              <div className="absolute inset-0 bg-gradient-to-b from-[#0D0E11]/80 via-transparent to-[#0D0E11]/90" />
              <div className="absolute inset-0 bg-radial-vignette opacity-60" />
            </div>

            {/* Brand Header */}
            <div className="relative z-10">
              <Link href="/" className="inline-flex items-center gap-2.5 group">
                <div className="w-8 h-8 rounded-full border border-[#C5A46D]/60 flex items-center justify-center bg-[#17191C]/90 backdrop-blur-sm group-hover:border-[#C5A46D] transition-colors shadow-[0_0_15px_rgba(197,164,109,0.2)]">
                  <div className="w-3.5 h-3.5 rounded-full border border-[#C5A46D] flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#C5A46D]" />
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="font-display font-bold text-[16px] tracking-[0.16em] uppercase text-white">
                    TRUST<span className="text-[#C5A46D]">DRIVE</span>
                  </span>
                  <span className="text-[9px] tracking-[0.24em] text-[#7A8089] uppercase font-mono -mt-0.5">
                    Automotive Truth
                  </span>
                </div>
              </Link>
            </div>

            {/* Center Content & 3 Step Pills */}
            <div className="relative z-10 my-10 space-y-6">
              <div className="space-y-2">
                <h3 className="font-display font-extrabold text-2xl sm:text-3xl text-white tracking-tight">
                  Welcome Back to Us
                </h3>
                <p className="text-[13px] text-[#BFC3C8] leading-relaxed">
                  Select your portal or enter your credentials to access your dashboard.
                </p>
              </div>

              {/* 3 Step Progression Pills */}
              <div className="space-y-3 pt-2">
                <div className="p-3.5 rounded-2xl bg-white text-black flex items-center gap-3.5 shadow-xl shadow-black/40 font-semibold text-[13px] transition-transform duration-200">
                  <span className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center font-mono text-[11px] font-bold">
                    1
                  </span>
                  <span>Select demo or enter credentials</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#17191C]/85 backdrop-blur-md border border-[#23262A]/90 text-[#BFC3C8] flex items-center gap-3.5 text-[13px] hover:border-[#C5A46D]/40 transition-colors">
                  <span className="w-6 h-6 rounded-full bg-[#23262A] text-[#7A8089] flex items-center justify-center font-mono text-[11px]">
                    2
                  </span>
                  <span>Authenticate SHA-256 session</span>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#17191C]/85 backdrop-blur-md border border-[#23262A]/90 text-[#BFC3C8] flex items-center gap-3.5 text-[13px] hover:border-[#C5A46D]/40 transition-colors">
                  <span className="w-6 h-6 rounded-full bg-[#23262A] text-[#7A8089] flex items-center justify-center font-mono text-[11px]">
                    3
                  </span>
                  <span>Route to Buyer / Seller portal</span>
                </div>
              </div>
            </div>

            {/* Bottom Trust Assurance */}
            <div className="relative z-10 pt-4 border-t border-[#23262A]/80 flex items-center gap-2 text-[11px] font-mono text-[#7A8089]">
              <Icon name="ShieldCheck" size={14} className="text-[#36B982]" />
              <span>Deterministic trust engine &bull; httpOnly session</span>
            </div>
          </div>

          {/* ================= RIGHT SIDE: SIGN IN / PORTAL ACCESS FORM ================= */}
          <div className="lg:col-span-7 flex flex-col justify-center px-2 sm:px-6 py-2">
            <div className="max-w-md w-full mx-auto space-y-6">
              {/* Header */}
              <div className="space-y-1.5">
                <h3 className="font-display font-extrabold text-3xl sm:text-4xl text-white tracking-tight">
                  Sign In Account
                </h3>
                <p className="text-[13.5px] text-[#7A8089]">
                  Enter your registered credentials to access your dashboard.
                </p>
              </div>

              {/* 1-Click Demo Login Selector */}
              <div className="p-4 rounded-2xl bg-[#111315] border border-[#23262A] space-y-2.5">
                <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-[#7A8089]">
                  <span>Instant 1-Click Demo Login</span>
                  <span className="text-[#C5A46D]">Password: demo1234</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {demoAccounts.map((acc) => (
                    <button
                      key={acc.role}
                      type="button"
                      onClick={() => fillDemo(acc)}
                      className={`py-2 px-2.5 rounded-xl text-xs font-mono transition-all border text-center ${
                        email === acc.email
                          ? "bg-[#C5A46D] text-black border-[#C5A46D] font-bold shadow-md shadow-[#C5A46D]/20"
                          : "bg-[#17191C] text-[#BFC3C8] border-[#23262A] hover:border-[#C5A46D]/50 hover:text-white"
                      }`}
                    >
                      &bull; {acc.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Error Banner */}
              {error && (
                <div className="p-3.5 rounded-xl bg-[#D95757]/10 border border-[#D95757]/30 text-[#D95757] text-xs font-mono flex items-center gap-2">
                  <Icon name="ShieldAlert" size={14} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Interactive Form */}
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-[#BFC3C8] uppercase tracking-wider">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="eg. johnfrans@gmail.com"
                    className="w-full px-4 py-3 rounded-xl bg-[#111315] border border-[#23262A] focus:border-[#C5A46D] text-white text-sm placeholder-[#7A8089] outline-none transition-colors"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-[#BFC3C8] uppercase tracking-wider">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full px-4 py-3 rounded-xl bg-[#111315] border border-[#23262A] focus:border-[#C5A46D] text-white text-sm placeholder-[#7A8089] outline-none transition-colors pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#7A8089] hover:text-white transition-colors"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      <Icon name={showPassword ? "EyeOff" : "Eye"} size={16} />
                    </button>
                  </div>
                  <p className="text-[11px] text-[#7A8089] font-mono">
                    Protected by SHA-256 session encryption.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-3.5 px-6 rounded-xl bg-white hover:bg-[#F5F5F5] text-black font-bold text-sm tracking-wide uppercase transition-all duration-200 shadow-xl shadow-white/5 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
                >
                  {busy ? (
                    <>
                      <Icon name="Loader2" size={16} className="animate-spin" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <span>Sign In</span>
                  )}
                </button>
              </form>

              {/* Footer Switcher */}
              <div className="text-center pt-2 text-xs font-mono text-[#7A8089]">
                <span>Don&apos;t have an account? </span>
                <Link
                  href="/register"
                  className="text-white hover:text-[#C5A46D] font-bold underline transition-colors"
                >
                  Sign up
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
