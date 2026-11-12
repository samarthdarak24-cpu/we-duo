"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { SectionCard } from "@/components/shared/SectionCard";
import { InlineAlert } from "@/components/shared/InlineAlert";

export interface SettingsProfile {
  name: string;
  email: string;
  role: string;
  phone?: string;
  city?: string;
  sellerType?: string;
  businessName?: string;
  preferences?: Record<string, unknown>;
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between gap-4 py-1">
      <span className="text-[13px] font-medium text-ink">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className="relative h-6 w-11 shrink-0 rounded-full transition"
        style={{ background: on ? "var(--primary)" : "var(--border)" }}
      >
        <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: on ? 22 : 2 }} />
      </button>
    </label>
  );
}

export function SettingsForm({ profile }: { profile: SettingsProfile }) {
  const router = useRouter();
  const initialPrefs = (profile.preferences ?? {}) as { email?: boolean; sms?: boolean; push?: boolean };
  const [form, setForm] = useState({
    name: profile.name,
    email: profile.email,
    phone: profile.phone ?? "",
    city: profile.city ?? "",
    sellerType: profile.sellerType ?? "individual",
    businessName: profile.businessName ?? "",
  });
  const [prefs, setPrefs] = useState({ email: initialPrefs.email !== false, sms: !!initialPrefs.sms, push: initialPrefs.push !== false });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const field = (label: string, key: keyof typeof form, type = "text", disabled = false) => (
    <label className="block">
      <span className="td-label">{label}</span>
      <input
        type={type}
        value={form[key]}
        disabled={disabled}
        onChange={(e) => {
          setForm({ ...form, [key]: e.target.value });
          setSaved(false);
        }}
        className="td-input disabled:opacity-60"
      />
    </label>
  );

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/v1/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, preferences: prefs }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) {
        setError(json.error?.message ?? "Could not save your profile.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    setPwBusy(true);
    setPwMsg(null);
    const res = await fetch("/api/v1/me/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pw),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    setPwBusy(false);
    if (!res.ok) {
      setPwMsg({ ok: false, text: json.error?.message ?? "Could not change the password." });
      return;
    }
    setPwMsg({ ok: true, text: "Password updated." });
    setPw({ currentPassword: "", newPassword: "" });
  }

  async function signOut() {
    await fetch("/api/v1/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const roleLabel = profile.role === "seller" ? "Seller account" : profile.role === "admin" ? "Admin account" : "Buyer account";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
      <SectionCard title="Personal details" description="This information appears on reports and in buyer conversations.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {field("Full name", "name")}
          {field("Email", "email", "email", true)}
          {field("Phone", "phone", "tel")}
          {field("City", "city")}
          {profile.role === "seller" && (
            <>
              <label className="block">
                <span className="td-label">Seller type</span>
                <select
                  value={form.sellerType}
                  onChange={(e) => {
                    setForm({ ...form, sellerType: e.target.value });
                    setSaved(false);
                  }}
                  className="td-input td-select"
                >
                  <option value="individual">Individual</option>
                  <option value="dealer">Dealer</option>
                </select>
              </label>
              {field("Business name", "businessName")}
            </>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="td-chip">{roleLabel}</span>
          <span className="td-chip" style={{ color: "var(--success)" }}>
            <Icon name="CheckCircle2" size={12} /> Email verified
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <button onClick={save} disabled={busy} className="td-btn td-btn-primary">
            {busy ? (
              <>
                <Icon name="Loader2" size={14} className="animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Icon name="Check" size={14} /> Save changes
              </>
            )}
          </button>
          {saved && <span className="text-[12px] font-semibold text-success">Profile saved</span>}
          {error && <span className="text-[12px] font-semibold text-danger">{error}</span>}
        </div>
      </SectionCard>

      <div className="space-y-4">
        <SectionCard title="Notifications" description="Choose how TrustDrive contacts you about inquiries and verification changes.">
          <div className="space-y-1">
            <Toggle on={prefs.email} onChange={(v) => setPrefs({ ...prefs, email: v })} label="Email" />
            <Toggle on={prefs.sms} onChange={(v) => setPrefs({ ...prefs, sms: v })} label="SMS" />
            <Toggle on={prefs.push} onChange={(v) => setPrefs({ ...prefs, push: v })} label="Push" />
          </div>
          <p className="td-help mt-3">Preferences are stored with your profile. Choose Save changes to persist them.</p>
          <div className="mt-3 border-t border-border pt-3">
            <h3 className="td-h3">Privacy</h3>
            <p className="td-help mt-1">Documents are shared with buyers only when you enable consent per document.</p>
          </div>
        </SectionCard>

        <SectionCard title="Change password" description="Use at least 10 characters with a letter and a number.">
          <div className="space-y-3">
            <label className="block">
              <span className="td-label">Current password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={pw.currentPassword}
                onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })}
                className="td-input"
              />
            </label>
            <label className="block">
              <span className="td-label">New password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={pw.newPassword}
                onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
                className="td-input"
              />
            </label>
            {pwMsg && <InlineAlert tone={pwMsg.ok ? "success" : "danger"} title={pwMsg.ok ? "Password updated" : "Could not update"} detail={pwMsg.ok ? undefined : pwMsg.text} />}
            <button
              onClick={changePassword}
              disabled={pwBusy || !pw.currentPassword || !pw.newPassword}
              className="td-btn td-btn-secondary w-full"
            >
              {pwBusy ? (
                <>
                  <Icon name="Loader2" size={14} className="animate-spin" /> Updating…
                </>
              ) : (
                <>
                  <Icon name="Lock" size={14} /> Update password
                </>
              )}
            </button>
          </div>
        </SectionCard>

        <button onClick={signOut} className="td-btn td-btn-danger w-full">
          <Icon name="LogOut" size={14} /> Sign out
        </button>
      </div>
    </div>
  );
}
