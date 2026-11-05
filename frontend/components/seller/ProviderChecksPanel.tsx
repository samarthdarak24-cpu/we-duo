"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { SectionCard } from "@/components/shared/SectionCard";

interface Check {
  id: string;
  provider: string;
  kind: string;
  status: string;
  fieldsQueried: string[];
  result: Record<string, unknown>;
  checkedAt: string;
}

/**
 * External provider checks (theft / insurance). Without a configured provider
 * every check is recorded as `unavailable` — never as a clean result.
 */
export function ProviderChecksPanel({ vehicleId, role }: { vehicleId: string; role: "seller" | "buyer" | "admin" }) {
  const [items, setItems] = useState<Check[]>([]);
  const [configured, setConfigured] = useState(false);
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<"theft" | "insurance">("theft");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/vehicles/${vehicleId}/provider-checks`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { items?: Check[]; configured?: boolean; note?: string };
      };
      if (res.ok && json.data) {
        setItems(json.data.items ?? []);
        setConfigured(!!json.data.configured);
        setNote(json.data.note ?? "");
      }
    } catch {
      /* keep the last list */
    }
  }, [vehicleId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/vehicles/${vehicleId}/provider-checks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) {
        setError(json.error?.message ?? "Could not run the provider check.");
        return;
      }
      await load();
    } catch {
      setError("Network error — the provider check was not recorded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SectionCard
      title="Provider checks"
      description="Theft and insurance queries are only shown when an authorised provider is configured. Unavailable is reported as unavailable."
      action={
        role === "admin" ? (
          <div className="flex items-center gap-2">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as "theft" | "insurance")}
              className="td-input h-8 w-auto text-[12px]"
              aria-label="Provider check kind"
            >
              <option value="theft">Theft</option>
              <option value="insurance">Insurance</option>
            </select>
            <button type="button" onClick={run} disabled={busy} className="td-btn td-btn-secondary td-btn-sm">
              {busy ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="ShieldCheck" size={14} />}
              {busy ? "Checking…" : "Run check"}
            </button>
          </div>
        ) : (
          <span className="td-chip">{configured ? "provider configured" : "no provider configured"}</span>
        )
      }
    >
      {error && (
        <p className="mb-3 rounded-[10px] border px-3 py-2 text-caption"
           style={{ borderColor: "color-mix(in srgb, var(--danger) 35%, var(--border))", color: "var(--danger)" }}>
          {error}
        </p>
      )}
      <p className="mb-3 text-[11.5px] leading-relaxed text-muted">
        {note || "No external provider is configured. Checks return `unavailable` and never a clean result."}
      </p>
      {items.length === 0 ? (
        <p className="text-caption text-muted">
          No provider check has been recorded{role !== "admin" ? "; an admin can run one." : "."}
        </p>
      ) : (
        <ul className="divide-y divide-border/70">
          {items.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[12px]">
              <span className="font-medium text-ink">{c.kind}</span>
              <span className="td-chip">{c.provider}</span>
              <span className="td-chip">{c.status}</span>
              <span className="text-muted">{new Date(c.checkedAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
