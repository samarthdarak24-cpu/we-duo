"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { InlineAlert } from "@/components/shared/InlineAlert";

interface SessionRow {
  id: string;
  userAgent: string;
  ip: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export interface SecurityProfile {
  name: string;
  email: string;
  role: string;
  initials: string;
  avatarUrl?: string | null;
  emailVerified: boolean;
  twofaEnabled: boolean;
  kycStatus?: string;
  lastLoginAt?: string | null;
}

const kycTone: Record<string, string> = {
  verified: "text-success bg-success-bg",
  pending: "text-warning bg-warning-bg",
  rejected: "text-danger bg-danger-bg",
  not_started: "text-muted bg-surface-tint",
};

export function SecurityCenter({ profile }: { profile: SecurityProfile }) {
  const router = useRouter();
  const avatarRef = useRef<HTMLInputElement>(null);
  const kycRef = useRef<HTMLInputElement>(null);

  const [avatar, setAvatar] = useState(profile.avatarUrl ?? null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [twofa, setTwofa] = useState(profile.twofaEnabled);
  const [twofaPassword, setTwofaPassword] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauth, setOtpauth] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");

  const [kyc, setKyc] = useState(profile.kycStatus ?? "not_started");
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/v1/me/sessions")
      .then((r) => r.json())
      .then((json) => {
        if (Array.isArray(json?.data)) setSessions(json.data);
      })
      .catch(() => {})
      .finally(() => setSessionsLoaded(true));
  }, []);

  async function uploadAvatar() {
    const file = avatarRef.current?.files?.[0];
    if (!file) return;
    setBusy("avatar");
    setMsg(null);
    const fd = new FormData();
    fd.append("avatar", file);
    const res = await fetch("/api/v1/me/avatar", { method: "POST", body: fd });
    const json = (await res.json().catch(() => ({}))) as { data?: { avatarUrl: string }; error?: { message?: string } };
    setBusy(null);
    if (!res.ok) {
      setMsg({ ok: false, text: json.error?.message ?? "Avatar upload failed." });
      return;
    }
    setAvatar(json.data?.avatarUrl ?? null);
    setMsg({ ok: true, text: "Profile photo updated." });
    router.refresh();
  }

  async function beginTwofa() {
    setBusy("2fa-begin");
    setMsg(null);
    const res = await fetch("/api/v1/me/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: twofaPassword }),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: { secret: string; otpauthUrl: string }; error?: { message?: string } };
    setBusy(null);
    if (!res.ok || !json.data) {
      setMsg({ ok: false, text: json.error?.message ?? "Could not start 2FA setup." });
      return;
    }
    setSecret(json.data.secret);
    setOtpauth(json.data.otpauthUrl);
    setTwofaPassword("");
  }

  async function confirmTwofa() {
    setBusy("2fa-confirm");
    setMsg(null);
    const res = await fetch("/api/v1/me/2fa", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    setBusy(null);
    if (!res.ok) {
      setMsg({ ok: false, text: json.error?.message ?? "That code was not accepted." });
      return;
    }
    setTwofa(true);
    setSecret(null);
    setOtpauth(null);
    setCode("");
    setMsg({ ok: true, text: "Two-factor authentication is now enabled." });
    router.refresh();
  }

  async function disableTwofa() {
    setBusy("2fa-disable");
    setMsg(null);
    const res = await fetch("/api/v1/me/2fa", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: disablePassword }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    setBusy(null);
    if (!res.ok) {
      setMsg({ ok: false, text: json.error?.message ?? "Could not disable 2FA." });
      return;
    }
    setTwofa(false);
    setDisablePassword("");
    setMsg({ ok: true, text: "Two-factor authentication disabled." });
    router.refresh();
  }

  async function uploadKyc() {
    const file = kycRef.current?.files?.[0];
    if (!file) return;
    setBusy("kyc");
    setMsg(null);
    const fd = new FormData();
    fd.append("document", file);
    const res = await fetch("/api/v1/me/kyc", { method: "POST", body: fd });
    const json = (await res.json().catch(() => ({}))) as { data?: { status: string }; error?: { message?: string } };
    setBusy(null);
    if (!res.ok) {
      setMsg({ ok: false, text: json.error?.message ?? "KYC upload failed." });
      return;
    }
    setKyc(json.data?.status ?? "pending");
    if (kycRef.current) kycRef.current.value = "";
    setMsg({ ok: true, text: "KYC document submitted for review." });
    router.refresh();
  }

  async function revokeSession(id: string) {
    setBusy(id);
    await fetch(`/api/v1/me/sessions/${id}`, { method: "DELETE" });
    setSessions((s) => s.filter((row) => row.id !== id));
    setBusy(null);
  }

  async function revokeAll() {
    setBusy("all");
    await fetch("/api/v1/me/sessions", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {msg && (
        <InlineAlert
          tone={msg.ok ? "success" : "danger"}
          title={msg.ok ? "Saved" : "Action failed"}
          detail={msg.text}
        />
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="card overflow-hidden">
          <div className="relative h-24 bg-gradient-to-r from-[#1A1710] via-[#141518] to-[#0D0F11]">
            <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_20%_30%,rgba(185,154,96,0.35),transparent_45%),radial-gradient(circle_at_80%_10%,rgba(54,185,130,0.18),transparent_40%)]" />
          </div>
          <div className="-mt-10 space-y-3 px-5 pb-5">
            <div className="flex items-end justify-between gap-3">
              <span className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-surface bg-[#B99A60] text-[24px] font-bold text-[#17191B]">
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  profile.initials
                )}
              </span>
              <span className={"pill " + (kycTone[kyc] ?? kycTone.not_started)}>
                <Icon name={kyc === "verified" ? "ShieldCheck" : "ShieldAlert"} size={12} />
                KYC {kyc.replace(/_/g, " ")}
              </span>
            </div>
            <div>
              <h2 className="td-h2">{profile.name}</h2>
              <p className="text-[12px] text-muted">{profile.email}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="td-chip">
                <Icon name="User" size={12} /> {profile.role}
              </span>
              <span className={"pill " + (profile.emailVerified ? "bg-success-bg text-success" : "bg-warning-bg text-warning")}>
                <Icon name={profile.emailVerified ? "CheckCircle2" : "CircleAlert"} size={12} />
                {profile.emailVerified ? "Email verified" : "Email unverified"}
              </span>
              {profile.lastLoginAt && (
                <span className="td-chip">
                  <Icon name="Clock" size={12} /> Last login {new Date(profile.lastLoginAt).toLocaleDateString("en-IN")}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <input
                ref={avatarRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label="Profile photo"
                className="block max-w-[220px] text-[11px] text-muted file:mr-2 file:rounded-[7px] file:border-0 file:bg-surface-tint file:px-2.5 file:py-1.5 file:text-[11px] file:font-semibold file:text-ink"
              />
              <button onClick={uploadAvatar} disabled={busy === "avatar"} className="td-btn td-btn-primary td-btn-sm">
                {busy === "avatar" ? (
                  <>
                    <Icon name="Loader2" size={13} className="animate-spin" /> Uploading…
                  </>
                ) : (
                  <>
                    <Icon name="Camera" size={13} /> Upload photo
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        <section className="card space-y-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="td-h2">Two-factor authentication</h2>
            <span className={"pill " + (twofa ? "bg-success-bg text-success" : "bg-surface-tint text-muted")}>
              <Icon name={twofa ? "ShieldCheck" : "Lock"} size={12} /> {twofa ? "Enabled" : "Not enabled"}
            </span>
          </div>
          {twofa ? (
            <>
              <p className="text-[12px] leading-relaxed text-muted">Sign-in requires a 6-digit code from your authenticator app.</p>
              <input
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                placeholder="Current password to disable"
                aria-label="Current password"
                className="td-input"
              />
              <button onClick={disableTwofa} disabled={busy === "2fa-disable" || !disablePassword} className="td-btn td-btn-danger td-btn-sm">
                {busy === "2fa-disable" ? (
                  <>
                    <Icon name="Loader2" size={13} className="animate-spin" /> Disabling…
                  </>
                ) : (
                  "Disable 2FA"
                )}
              </button>
            </>
          ) : secret ? (
            <div className="space-y-3">
              <p className="text-[12px] leading-relaxed text-muted">Add this secret to your authenticator app, then enter the 6-digit code.</p>
              <code className="block break-all rounded-[9px] border border-primary/30 bg-info-bg px-3 py-2 font-mono text-[11.5px] text-primary">{secret}</code>
              {otpauth && (
                <a href={otpauth} className="td-link">
                  <Icon name="ExternalLink" size={12} /> Open in authenticator
                </a>
              )}
              <div className="flex gap-2">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  placeholder="123456"
                  aria-label="Six digit code"
                  className="td-input w-32 text-center font-mono tracking-[0.3em]"
                />
                <button onClick={confirmTwofa} disabled={busy === "2fa-confirm" || code.length !== 6} className="td-btn td-btn-primary">
                  {busy === "2fa-confirm" ? "Verifying…" : "Confirm & enable"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-[12px] leading-relaxed text-muted">Protect your account with an authenticator app (RFC 6238, ±1 step).</p>
              <input
                type="password"
                value={twofaPassword}
                onChange={(e) => setTwofaPassword(e.target.value)}
                placeholder="Current password"
                aria-label="Current password"
                className="td-input"
              />
              <button onClick={beginTwofa} disabled={busy === "2fa-begin" || !twofaPassword} className="td-btn td-btn-primary">
                {busy === "2fa-begin" ? "Starting…" : "Set up 2FA"}
              </button>
            </>
          )}
        </section>

        {profile.role === "seller" && (
          <section className="card space-y-3 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="td-h2">Seller KYC</h2>
              <span className={"pill " + (kycTone[kyc] ?? kycTone.not_started)}>{kyc.replace(/_/g, " ")}</span>
            </div>
            <p className="text-[12px] leading-relaxed text-muted">
              Upload a business registration, GST certificate or dealer licence (PDF or image, up to 10 MB). An admin reviews it; only the
              status is shown publicly.
            </p>
            <input
              ref={kycRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              aria-label="KYC document"
              className="block w-full text-[11px] text-muted file:mr-2 file:rounded-[7px] file:border-0 file:bg-surface-tint file:px-2.5 file:py-1.5 file:text-[11px] file:font-semibold file:text-ink"
            />
            <button onClick={uploadKyc} disabled={busy === "kyc"} className="td-btn td-btn-secondary td-btn-sm">
              {busy === "kyc" ? (
                <>
                  <Icon name="Loader2" size={13} className="animate-spin" /> Uploading…
                </>
              ) : kyc === "not_started" ? (
                "Upload KYC"
              ) : (
                "Re-upload KYC"
              )}
            </button>
          </section>
        )}

        <section className="card space-y-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="td-h2">Active sessions</h2>
            <button onClick={revokeAll} disabled={busy === "all"} className="td-btn td-btn-ghost td-btn-sm" style={{ color: "var(--danger)" }}>
              Sign out everywhere
            </button>
          </div>
          {!sessionsLoaded && <div className="skeleton h-14 w-full" />}
          {sessionsLoaded && !sessions.length && <p className="text-[12px] text-muted">No other sessions are active.</p>}
          <div className="space-y-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-start gap-3 rounded-[10px] border border-border bg-surface-tint p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-surface text-primary">
                  <Icon name="Layers" size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-ink">
                    {s.userAgent || "Unknown device"}
                    {s.current && <span className="ml-2 rounded-full bg-success-bg px-2 py-0.5 text-[9px] font-bold text-success">THIS DEVICE</span>}
                  </p>
                  <p className="text-[11px] text-muted">
                    {s.ip || "unknown IP"} · last active {new Date(s.lastSeenAt).toLocaleString("en-IN")}
                  </p>
                </div>
                {!s.current && (
                  <button onClick={() => revokeSession(s.id)} disabled={busy === s.id} className="td-btn td-btn-danger td-btn-sm">
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
