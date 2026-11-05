"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { SectionCard } from "@/components/shared/SectionCard";

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  kycStatus: string;
  createdAt: string;
}

/** Admin account list with soft delete (row retained, access revoked). */
export function AdminUsers({ initial }: { initial: AdminUserRow[] }) {
  const [users, setUsers] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(user: AdminUserRow) {
    const ok = window.confirm(
      `Delete ${user.name} (${user.email})? The account is soft-deleted, sessions are revoked and records are retained.`
    );
    if (!ok) return;
    setBusy(user.id);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/users/${user.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(json.error?.message ?? "Could not delete the account.");
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch {
      setError("Network error — the account was not deleted.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <SectionCard
      title="Accounts"
      description="Soft delete keeps the row for audit, revokes sessions and hides the account from login."
      action={<span className="td-chip">{users.length} account(s)</span>}
    >
      {error && (
        <p className="mb-3 rounded-[10px] border px-3 py-2 text-caption"
           style={{ borderColor: "color-mix(in srgb, var(--danger) 35%, var(--border))", color: "var(--danger)" }}>
          {error}
        </p>
      )}
      {users.length === 0 ? (
        <p className="text-caption text-muted">No accounts found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-[0.14em] text-muted">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Role</th>
                <th className="py-2 pr-3">KYC</th>
                <th className="py-2 pr-3">Created</th>
                <th className="py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border/70 last:border-0">
                  <td className="py-2.5 pr-3 font-medium text-ink">{u.name}</td>
                  <td className="py-2.5 pr-3 text-muted">{u.email}</td>
                  <td className="py-2.5 pr-3"><span className="td-chip">{u.role}</span></td>
                  <td className="py-2.5 pr-3 text-muted">{u.kycStatus}</td>
                  <td className="py-2.5 pr-3 text-muted">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => remove(u)}
                      disabled={busy === u.id}
                      className="td-btn td-btn-ghost td-btn-sm"
                    >
                      {busy === u.id ? <Icon name="Loader2" size={13} className="animate-spin" /> : <Icon name="Trash2" size={13} />}
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
