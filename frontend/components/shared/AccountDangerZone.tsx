"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

/**
 * Soft-deletes the signed-in account. The row is retained for audit, sessions
 * are revoked and access is lost immediately.
 */
export function AccountDangerZone() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    const confirmed = window.confirm(
      "Delete your account? You will lose access immediately. Records are retained for audit and legal obligations."
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/users/me", { method: "DELETE" });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(json.error?.message ?? "Could not delete the account.");
        setBusy(false);
        return;
      }
      window.location.href = "/?account=deleted";
    } catch {
      setError("Network error — the account was not deleted.");
      setBusy(false);
    }
  }

  return (
    <section className="card mt-4 border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="td-h2">Danger zone</h2>
          <p className="td-help mt-1 max-w-xl">
            Deleting your account is a soft delete: your documents and history stay in the audit trail,
            but you are signed out everywhere and can no longer access the portal.
          </p>
        </div>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="td-btn td-btn-secondary shrink-0"
          style={{ color: "var(--danger)", borderColor: "color-mix(in srgb, var(--danger) 40%, var(--border))" }}
        >
          {busy ? <Icon name="Loader2" size={15} className="animate-spin" /> : <Icon name="Trash2" size={15} />}
          {busy ? "Deleting…" : "Delete account"}
        </button>
      </div>
      {error && <p className="mt-3 text-caption" style={{ color: "var(--danger)" }}>{error}</p>}
    </section>
  );
}
