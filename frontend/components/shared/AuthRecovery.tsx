"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="font-mono text-xs uppercase tracking-wider text-[var(--muted)]">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-[var(--muted)]">{hint}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--surface-tint)] px-4 py-3.5 text-sm text-white outline-none transition-colors placeholder:text-[var(--muted)]/60 focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]/50";

const primaryButton =
  "flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-4 text-sm font-extrabold uppercase tracking-wider text-black shadow-xl shadow-[var(--primary)]/15 transition-all hover:bg-[var(--primary-600)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60";

function Notice({ tone, children }: { tone: "danger" | "success" | "info"; children: React.ReactNode }) {
  const cls =
    tone === "danger"
      ? "border-[var(--danger)]/30 bg-[var(--danger)]/10 text-[var(--danger)]"
      : tone === "success"
        ? "border-[var(--success)]/30 bg-[var(--success)]/10 text-[var(--success)]"
        : "border-[var(--primary)]/40 bg-[var(--surface-tint)] text-[var(--muted)]";
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border p-3.5 font-mono text-xs ${cls}`}>
      <Icon name={tone === "danger" ? "ShieldAlert" : tone === "success" ? "CheckCircle2" : "Info"} size={16} className="mt-0.5 shrink-0" />
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { sent?: boolean; resetLink?: string };
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(json.error?.message ?? "Could not start password recovery.");
        return;
      }
      setSent(true);
      setDevLink(json.data?.resetLink ?? null);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <Notice tone="success">
          If an account exists for <span className="font-bold">{email.trim()}</span>, a reset link is on its way. It expires in one hour.
        </Notice>
        {devLink && (
          <Notice tone="info">
            Development mode:{" "}
            <a href={devLink} className="font-bold text-[var(--primary)] underline">
              open the reset link
            </a>
            .
          </Notice>
        )}
        <Link href="/login" className={primaryButton}>
          Return to sign in <Icon name="ArrowRight" size={15} />
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 text-left">
      {error && <Notice tone="danger">{error}</Notice>}
      <Field label="Email address" hint="We never reveal whether an address is registered.">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@trustdrive.dev"
          className={inputClass}
        />
      </Field>
      <button type="submit" disabled={busy} className={primaryButton}>
        {busy ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Mail" size={16} />}
        {busy ? "Sending link…" : "Send reset link"}
      </button>
      <p className="text-center font-mono text-xs text-[var(--muted)]">
        Remembered it?{" "}
        <Link href="/login" className="font-bold text-white underline hover:text-[var(--primary)]">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 10 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Use at least 10 characters with at least one letter and one number.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/v1/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) {
        setError(json.error?.message ?? "This reset link is invalid or has expired.");
        return;
      }
      setDone(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <Notice tone="success">Password updated. Every previous session for this account has been signed out.</Notice>
        <Link href="/login" className={primaryButton}>
          Sign in with the new password <Icon name="ArrowRight" size={15} />
        </Link>
      </div>
    );
  }

  const strength = Math.min(100, password.length * 8 + (/[A-Z]/.test(password) ? 10 : 0) + (/[0-9]/.test(password) ? 10 : 0) + (/[^A-Za-z0-9]/.test(password) ? 15 : 0));

  return (
    <form onSubmit={submit} className="space-y-4 text-left">
      {error && <Notice tone="danger">{error}</Notice>}
      <Field label="New password" hint="At least 10 characters, one letter and one number.">
        <div className="relative">
          <input
            type={show ? "text" : "password"}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Create a strong password"
            className={`${inputClass} pr-10`}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-white"
            aria-label={show ? "Hide password" : "Show password"}
          >
            <Icon name={show ? "EyeOff" : "Eye"} size={16} />
          </button>
        </div>
      </Field>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-tint)]">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${strength}%`,
            background: strength >= 75 ? "var(--success)" : strength >= 45 ? "var(--primary)" : "var(--danger)",
          }}
        />
      </div>
      <Field label="Confirm new password">
        <input
          type={show ? "text" : "password"}
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repeat the password"
          className={inputClass}
        />
      </Field>
      <button type="submit" disabled={busy} className={primaryButton}>
        {busy ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Lock" size={16} />}
        {busy ? "Updating password…" : "Set new password"}
      </button>
    </form>
  );
}

export function VerifyEmailGate({ token }: { token: string }) {
  const [state, setState] = useState<"verifying" | "success" | "error">("verifying");
  const [message, setMessage] = useState("Confirming the signed link…");
  const [resendEmail, setResendEmail] = useState("");
  const [resendState, setResendState] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    fetch("/api/v1/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as { data?: { email?: string }; error?: { message?: string } };
        if (res.ok) {
          setState("success");
          setMessage(json.data?.email ? `${json.data.email} is now verified.` : "Your email is now verified.");
        } else {
          setState("error");
          setMessage(json.error?.message ?? "This verification link is invalid or has expired.");
        }
      })
      .catch(() => {
        setState("error");
        setMessage("Network error — the link could not be verified.");
      });
  }, [token]);

  async function resend(e: React.FormEvent) {
    e.preventDefault();
    setResendState("sending");
    const res = await fetch("/api/v1/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: resendEmail.trim() }),
    });
    setResendState(res.ok ? "sent" : "error");
  }

  return (
    <div className="space-y-4">
      {state === "verifying" && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-tint)] p-8">
          <Icon name="Loader2" size={26} className="animate-spin text-[var(--primary)]" />
          <p className="font-mono text-xs text-[var(--muted)]">Verifying email…</p>
        </div>
      )}

      {state === "success" && (
        <>
          <Notice tone="success">{message}</Notice>
          <Link href="/login" className={primaryButton}>
            Continue to sign in <Icon name="ArrowRight" size={15} />
          </Link>
        </>
      )}

      {state === "error" && (
        <>
          <Notice tone="danger">{message}</Notice>
          {resendState === "sent" ? (
            <Notice tone="info">If that address needs verification, a fresh link has been sent.</Notice>
          ) : (
            <form onSubmit={resend} className="space-y-3">
              <Field label="Resend verification to">
                <input
                  type="email"
                  required
                  value={resendEmail}
                  onChange={(e) => setResendEmail(e.target.value)}
                  placeholder="name@trustdrive.dev"
                  className={inputClass}
                />
              </Field>
              <button type="submit" disabled={resendState === "sending"} className={primaryButton}>
                {resendState === "sending" ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="Send" size={16} />}
                Resend link
              </button>
            </form>
          )}
          <p className="text-center font-mono text-xs text-[var(--muted)]">
            <Link href="/login" className="font-bold text-white underline hover:text-[var(--primary)]">
              Back to sign in
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
