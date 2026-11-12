"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Icon } from "@/components/ui/Icon";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const demoAccounts = [
  { label: "Buyer", role: "buyer", email: "aditya@trustdrive.dev", name: "Aditya Darak" },
  { label: "Seller", role: "seller", email: "samarth@trustdrive.dev", name: "Samarth Darak" },
  { label: "Admin", role: "admin", email: "admin@trustdrive.dev", name: "TrustDrive Admin" },
];

export function AuthForm({ mode: initialMode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">(initialMode);

  // Common fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Sign In specific
  const [rememberMe, setRememberMe] = useState(true);

  // Sign Up specific
  const [fullName, setFullName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [role, setRole] = useState<"buyer" | "seller">("buyer");
  const [sellerType, setSellerType] = useState<"individual" | "dealer">("individual");
  const [termsAccepted, setTermsAccepted] = useState(false);

  // Switch tab and update browser URL without page refresh
  function switchMode(newMode: "login" | "register") {
    setMode(newMode);
    setError(null);
    setSuccess(null);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", newMode === "login" ? "/login" : "/register");
    }
  }

  function afterAuth(userRole: string) {
    const target = userRole === "seller" ? "/seller" : userRole === "admin" ? "/admin/queue" : "/buyer";
    if (typeof window !== "undefined") {
      window.location.href = target;
    } else {
      router.push(target);
    }
  }

  function fillDemo(acc: (typeof demoAccounts)[0]) {
    setEmail(acc.email);
    setPassword("demo123456");
    if (mode === "register") {
      setFullName(acc.name);
      setRole(acc.role === "seller" ? "seller" : "buyer");
      setConfirmPassword("demo123456");
      setTermsAccepted(true);
    }
    setError(null);
    setSuccess(null);
  }

  // Handle Sign In submission
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError("Please enter both email address and password.");
      return;
    }

    setBusy(true);

    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, password }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json?.error?.message || "Invalid email or password. Please try again.");
        return;
      }

      setSuccess("Session authenticated. Redirecting to your workspace...");
      const userRole = json?.data?.user?.role || "buyer";
      afterAuth(userRole);
    } catch {
      setError("Network connection error. Please verify your internet and try again.");
    } finally {
      setBusy(false);
    }
  }

  // Handle Sign Up submission
  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanName) {
      setError("Full name is required.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (password.length < 10) {
      setError("Password must be at least 10 characters long.");
      return;
    }

    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Password must include at least one letter and one number.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Password confirmation does not match.");
      return;
    }

    if (!termsAccepted) {
      setError("You must accept the TrustDrive Terms & Conditions to proceed.");
      return;
    }

    setBusy(true);

    try {
      const res = await fetch("/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanName,
          email: cleanEmail,
          password,
          role,
          sellerType: role === "seller" ? sellerType : undefined,
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json?.error?.message || "Registration failed. An account with this email may already exist.");
        return;
      }

      setSuccess("Account successfully created! Routing to your verified workspace...");
      const userRole = json?.data?.user?.role || role;
      afterAuth(userRole);
    } catch {
      setError("Network connection error. Please verify your internet and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-[var(--bg)] text-[var(--text)] font-sans selection:bg-[var(--primary)]/30 selection:text-white">
      {/* ========================================================================= */}
      {/* LEFT COLUMN: CINEMATIC AUTOMOTIVE IMAGE (50% DESKTOP)                     */}
      {/* ========================================================================= */}
      <div className="theme-cinematic relative w-full h-[360px] sm:h-[440px] lg:h-screen lg:sticky lg:top-0 overflow-hidden select-none bg-[var(--bg)]">
        {/* Full-bleed Luxury Automotive Photography Provided by User */}
        <Image
          src="/images/cars/auth-luxury-car.jpg"
          alt="TrustDrive Luxury Automotive Inspection"
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-cover object-center scale-100 filter brightness-95 contrast-110"
        />

        {/* Cinematic Multi-Stage Overlays (Preserving dark automotive mood, no blue/purple gradients) */}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/40 to-[var(--bg)]/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[var(--bg)]/70 hidden lg:block" />
        <div className="absolute inset-0 bg-radial-vignette opacity-50" />

        {/* Ambient Subtle Champagne Floor & Top Glow */}
        <div className="absolute -top-32 -left-32 w-[400px] h-[400px] bg-[var(--primary)]/15 blur-[140px] rounded-full pointer-events-none" />
        <div className="absolute -bottom-24 left-1/4 w-[500px] h-[300px] bg-[var(--primary)]/10 blur-[130px] rounded-full pointer-events-none" />

        {/* Content Overlays */}
        <div className="relative z-10 w-full h-full flex flex-col justify-between p-6 sm:p-10 lg:p-14">
          {/* Top Brand Mark */}
          <Link href="/" className="inline-flex items-center gap-3 group w-fit">
            <div className="w-10 h-10 rounded-full border border-[var(--primary)]/70 flex items-center justify-center bg-[var(--bg)]/80 backdrop-blur-md group-hover:border-[var(--primary)] transition-colors shadow-[0_0_20px_rgba(185,154,96,0.25)]">
              <div className="w-4 h-4 rounded-full border border-[var(--primary)] flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-display font-extrabold text-[17px] tracking-[0.2em] uppercase text-white">
                TRUST<span className="text-[var(--primary)]">DRIVE</span>
              </span>
              <span className="text-[9.5px] tracking-[0.26em] text-[var(--muted)] uppercase font-mono -mt-0.5">
                Automotive Truth
              </span>
            </div>
          </Link>

          {/* Center & Bottom Editorial Typography */}
          <div className="space-y-4 max-w-lg">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--bg)]/80 border border-[var(--primary)]/40 backdrop-blur-md text-[10.5px] font-mono text-[var(--primary)] uppercase tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" />
              <span>Evidence-Backed Intelligence</span>
            </div>

            <h1 className="font-display font-extrabold text-3xl sm:text-4xl lg:text-5xl text-white tracking-tight leading-[1.12] drop-shadow-lg">
              Know the Car. <br />
              <span className="text-gold-gradient">Trust the Journey.</span>
            </h1>

            <p className="text-sm sm:text-base text-[var(--muted)] leading-relaxed font-normal drop-shadow-md">
              Discover vehicle history, verify documents and make smarter automotive decisions with confidence.
            </p>

            <div className="pt-2 flex items-center gap-3 text-[11px] font-mono text-[var(--muted)] border-t border-[var(--border)]/80">
              <span className="text-[var(--primary)] font-semibold">Transparency</span>
              <span>&bull;</span>
              <span className="text-[var(--primary)] font-semibold">Verification</span>
              <span>&bull;</span>
              <span className="text-[var(--primary)] font-semibold">Confidence</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* RIGHT COLUMN: AUTHENTICATION PANEL (50% DESKTOP)                          */}
      {/* ========================================================================= */}
      <div className="relative w-full min-h-screen bg-[var(--bg)] flex flex-col justify-between p-6 sm:p-10 lg:p-14 overflow-y-auto">
        {/* Top Navigation Row */}
        <div className="w-full max-w-md mx-auto flex items-center justify-between pb-6 border-b border-[var(--border)]/60">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-[var(--muted)] hover:text-[var(--primary)] transition-colors py-1.5 px-3 rounded-full bg-[var(--surface-tint)] border border-[var(--border)]"
          >
            <Icon name="ArrowLeft" size={14} />
            <span>Back to TrustDrive</span>
          </Link>

          <div className="flex items-center gap-3">
            <span className="hidden text-[11px] font-mono uppercase tracking-widest text-[var(--muted)] sm:inline">
              {mode === "login" ? "Secure Sign In" : "Account Setup"}
            </span>
            <ThemeToggle variant="labeled" />
          </div>
        </div>

        {/* Form Card Center Container */}
        <div className="max-w-md w-full mx-auto my-auto space-y-6 py-6">
          {/* Segmented Mode Switch */}
          <div className="grid grid-cols-2 p-1 rounded-2xl bg-[var(--surface-tint)] border border-[var(--border)] text-xs font-mono tracking-wider">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`py-3 rounded-xl transition-all duration-200 uppercase font-bold flex items-center justify-center gap-2 ${
                mode === "login"
                  ? "bg-[var(--primary)] text-black shadow-lg shadow-[var(--primary)]/20 font-extrabold"
                  : "text-[var(--muted)] hover:text-white"
              }`}
            >
              <Icon name="Lock" size={13} />
              <span>Sign In</span>
            </button>
            <button
              type="button"
              onClick={() => switchMode("register")}
              className={`py-3 rounded-xl transition-all duration-200 uppercase font-bold flex items-center justify-center gap-2 ${
                mode === "register"
                  ? "bg-[var(--primary)] text-black shadow-lg shadow-[var(--primary)]/20 font-extrabold"
                  : "text-[var(--muted)] hover:text-white"
              }`}
            >
              <Icon name="User" size={13} />
              <span>Sign Up</span>
            </button>
          </div>

          {/* Form Headers */}
          <div className="space-y-1.5 text-left">
            <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-white tracking-tight">
              {mode === "login" ? "Welcome Back" : "Create Your TrustDrive Account"}
            </h2>
            <p className="text-[13.5px] text-[var(--muted)] leading-relaxed">
              {mode === "login"
                ? "Sign in to continue your journey with TrustDrive."
                : "Join TrustDrive and experience a smarter, more transparent automotive marketplace."}
            </p>
          </div>

          {/* 1-Click Demo Login Selector */}
          <div className="p-4 rounded-2xl bg-[var(--surface-tint)] border border-[var(--border)] space-y-2.5">
            <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-[var(--muted)]">
              <span>Instant 1-Click Demo Logins</span>
              <span className="normal-case text-[var(--primary)]">PW: demo123456</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {demoAccounts.map((acc) => (
                <button
                  key={acc.role}
                  type="button"
                  onClick={() => fillDemo(acc)}
                  className={`py-2 px-2.5 rounded-xl text-xs font-mono transition-all border text-center ${
                    email === acc.email
                      ? "bg-[var(--primary)] text-black border-[var(--primary)] font-bold shadow-md shadow-[var(--primary)]/20"
                      : "bg-[var(--bg)] text-[var(--muted)] border-[var(--border)] hover:border-[var(--primary)]/50 hover:text-white"
                  }`}
                >
                  &bull; {acc.label}
                </button>
              ))}
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="p-3.5 rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/30 text-[var(--danger)] text-xs font-mono flex items-center gap-2.5 animate-in fade-in duration-200">
              <Icon name="ShieldAlert" size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Success Banner */}
          {success && (
            <div className="p-3.5 rounded-xl bg-[var(--success)]/10 border border-[var(--success)]/30 text-[var(--success)] text-xs font-mono flex items-center gap-2.5 animate-in fade-in duration-200">
              <Icon name="CheckCircle2" size={16} className="shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* ================= SIGN IN FORM ================= */}
          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4 text-left">
              <div className="space-y-1.5">
                <label htmlFor="login-email" className="text-xs font-mono text-[var(--muted)] uppercase tracking-wider">
                  Email Address
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@trustdrive.dev"
                  className="w-full px-4 py-3.5 rounded-xl bg-[var(--surface-tint)] border border-[var(--border)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/50 text-white text-sm placeholder-[var(--muted)]/60 outline-none transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="login-password" className="text-xs font-mono text-[var(--muted)] uppercase tracking-wider">
                    Password
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-[11px] font-mono text-[var(--primary)] hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full px-4 py-3.5 rounded-xl bg-[var(--surface-tint)] border border-[var(--border)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/50 text-white text-sm placeholder-[var(--muted)]/60 outline-none transition-colors pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-white transition-colors"
                    aria-label={showPassword ? "Hide characters" : "Reveal characters"}
                  >
                    <Icon name={showPassword ? "EyeOff" : "Eye"} size={16} />
                  </button>
                </div>
              </div>

              {/* Remember Me Checkbox */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer text-xs font-mono text-[var(--muted)] select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-[var(--border)] bg-[var(--surface-tint)] text-[var(--primary)] accent-[var(--primary)] cursor-pointer"
                  />
                  <span>Remember me for 30 days</span>
                </label>
                <span className="text-[10px] font-mono text-[var(--muted)]">httpOnly Session</span>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={busy}
                className="w-full py-4 px-6 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-600)] active:scale-[0.99] text-black font-extrabold text-sm tracking-wider uppercase transition-all duration-200 shadow-xl shadow-[var(--primary)]/15 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
              >
                {busy ? (
                  <>
                    <Icon name="Loader2" size={16} className="animate-spin" />
                    <span>Authenticating Session...</span>
                  </>
                ) : (
                  <>
                    <span>SIGN IN</span>
                    <Icon name="ArrowRight" size={15} />
                  </>
                )}
              </button>

              {/* Bottom Switcher */}
              <div className="text-center pt-3 text-xs font-mono text-[var(--muted)]">
                <span>Don&apos;t have an account? </span>
                <button
                  type="button"
                  onClick={() => switchMode("register")}
                  className="text-white hover:text-[var(--primary)] font-bold underline transition-colors"
                >
                  Create Account
                </button>
              </div>
            </form>
          ) : (
            /* ================= SIGN UP FORM ================= */
            <form onSubmit={handleRegister} className="space-y-4 text-left">
              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-[var(--muted)] uppercase tracking-wider">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="eg. John Doe"
                  className="w-full px-4 py-3 rounded-xl bg-[var(--surface-tint)] border border-[var(--border)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/50 text-white text-sm placeholder-[var(--muted)]/60 outline-none transition-colors"
                />
              </div>

              {/* Email Address */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-[var(--muted)] uppercase tracking-wider">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="eg. john@example.com"
                  className="w-full px-4 py-3 rounded-xl bg-[var(--surface-tint)] border border-[var(--border)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/50 text-white text-sm placeholder-[var(--muted)]/60 outline-none transition-colors"
                />
              </div>

              {/* Role Selection Segment */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-[var(--muted)] uppercase tracking-wider">
                  Select Your Account Role
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole("buyer")}
                    className={`py-2.5 px-3 rounded-xl text-xs font-mono border transition-all text-left flex items-center justify-between ${
                      role === "buyer"
                        ? "bg-[var(--surface-tint)] border-[var(--primary)] text-white shadow-md shadow-[var(--primary)]/10"
                        : "bg-[var(--bg)] border-[var(--border)] text-[var(--muted)] hover:border-[var(--muted)]"
                    }`}
                  >
                    <div>
                      <div className="font-bold text-white">Buyer</div>
                      <div className="text-[10px] text-[var(--muted)]">Search &amp; Verify</div>
                    </div>
                    {role === "buyer" && <span className="text-[var(--primary)] font-bold">&check;</span>}
                  </button>

                  <button
                    type="button"
                    onClick={() => setRole("seller")}
                    className={`py-2.5 px-3 rounded-xl text-xs font-mono border transition-all text-left flex items-center justify-between ${
                      role === "seller"
                        ? "bg-[var(--surface-tint)] border-[var(--primary)] text-white shadow-md shadow-[var(--primary)]/10"
                        : "bg-[var(--bg)] border-[var(--border)] text-[var(--muted)] hover:border-[var(--muted)]"
                    }`}
                  >
                    <div>
                      <div className="font-bold text-white">Seller</div>
                      <div className="text-[10px] text-[var(--muted)]">Certify &amp; Sell</div>
                    </div>
                    {role === "seller" && <span className="text-[var(--primary)] font-bold">&check;</span>}
                  </button>
                </div>

                {/* Seller Type Options */}
                {role === "seller" && (
                  <div className="pt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSellerType("individual")}
                      className={`text-xs font-mono py-1.5 px-3 rounded-lg border transition-colors ${
                        sellerType === "individual"
                          ? "bg-[var(--primary)]/20 border-[var(--primary)] text-[var(--primary)]"
                          : "bg-[var(--surface-tint)] border-[var(--border)] text-[var(--muted)]"
                      }`}
                    >
                      Individual Seller
                    </button>
                    <button
                      type="button"
                      onClick={() => setSellerType("dealer")}
                      className={`text-xs font-mono py-1.5 px-3 rounded-lg border transition-colors ${
                        sellerType === "dealer"
                          ? "bg-[var(--primary)]/20 border-[var(--primary)] text-[var(--primary)]"
                          : "bg-[var(--surface-tint)] border-[var(--border)] text-[var(--muted)]"
                      }`}
                    >
                      Licensed Dealer
                    </button>
                  </div>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-[var(--muted)] uppercase tracking-wider">
                  Password (min. 10 chars, letter + number)
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a strong password"
                    className="w-full px-4 py-3 rounded-xl bg-[var(--surface-tint)] border border-[var(--border)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/50 text-white text-sm placeholder-[var(--muted)]/60 outline-none transition-colors pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-white transition-colors"
                    aria-label={showPassword ? "Hide characters" : "Reveal characters"}
                  >
                    <Icon name={showPassword ? "EyeOff" : "Eye"} size={16} />
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-[var(--muted)] uppercase tracking-wider">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat your password"
                    className="w-full px-4 py-3 rounded-xl bg-[var(--surface-tint)] border border-[var(--border)] focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/50 text-white text-sm placeholder-[var(--muted)]/60 outline-none transition-colors pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-white transition-colors"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    <Icon name={showConfirmPassword ? "EyeOff" : "Eye"} size={16} />
                  </button>
                </div>
              </div>

              {/* Terms and Conditions */}
              <label className="flex items-start gap-2.5 cursor-pointer text-xs font-mono text-[var(--muted)] select-none pt-1">
                <input
                  type="checkbox"
                  required
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="w-4 h-4 rounded border-[var(--border)] bg-[var(--surface-tint)] text-[var(--primary)] accent-[var(--primary)] cursor-pointer mt-0.5"
                />
                <span>
                  I accept the{" "}
                  <Link href="/faq" className="text-white hover:text-[var(--primary)] underline">
                    Terms &amp; Conditions
                  </Link>{" "}
                  and acknowledge TrustDrive&apos;s deterministic verification rules.
                </span>
              </label>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={busy}
                className="w-full py-4 px-6 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary-600)] active:scale-[0.99] text-black font-extrabold text-sm tracking-wider uppercase transition-all duration-200 shadow-xl shadow-[var(--primary)]/15 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
              >
                {busy ? (
                  <>
                    <Icon name="Loader2" size={16} className="animate-spin" />
                    <span>Registering Account...</span>
                  </>
                ) : (
                  <>
                    <span>CREATE ACCOUNT</span>
                    <Icon name="ArrowRight" size={15} />
                  </>
                )}
              </button>

              {/* Bottom Switcher */}
              <div className="text-center pt-3 text-xs font-mono text-[var(--muted)]">
                <span>Already have an account? </span>
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="text-white hover:text-[var(--primary)] font-bold underline transition-colors"
                >
                  Sign In
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Minimal Footer */}
        <div className="w-full max-w-md mx-auto pt-6 border-t border-[var(--border)]/60 text-center text-[11px] font-mono text-[var(--muted)]">
          &copy; 2026 TrustDrive Inc. &bull; Deterministic AI Verification &bull; All rights reserved.
        </div>
      </div>
    </div>
  );
}
