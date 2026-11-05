"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SectionCard } from "@/components/shared/SectionCard";
import { InlineAlert } from "@/components/shared/InlineAlert";

const claimFields = [
  { value: "ownerCount", label: "Ownership count" },
  { value: "accidentHistory", label: "Accident history" },
  { value: "serviceHistory", label: "Service history" },
  { value: "insuranceStatus", label: "Insurance status" },
  { value: "odometer", label: "Odometer" },
  { value: "color", label: "Colour" },
  { value: "variant", label: "Variant" },
  { value: "registrationDate", label: "Registration date" },
  { value: "previousUse", label: "Previous use" },
] as const;

export interface ClaimRow {
  id: string;
  field: string;
  value: string;
  source: string;
  status: string;
  createdAt: string;
}

/**
 * Claims are stored as seller-declared and only become evidence after the
 * verification pipeline checks them. The badge never says "verified" here.
 */
export function ClaimsPanel({ vehicleId, claims }: { vehicleId: string; claims: ClaimRow[] }) {
  const router = useRouter();
  const [field, setField] = useState<string>(claimFields[0].value);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit() {
    if (!value.trim()) {
      setError("Enter the claimed value.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    const res = await fetch(`/api/v1/vehicles/${vehicleId}/claims`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field, value: value.trim() }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    setBusy(false);
    if (!res.ok) {
      setError(json.error?.message ?? "Could not record the claim.");
      return;
    }
    setValue("");
    setInfo("Claim recorded as pending and added to the hash chain.");
    window.setTimeout(() => router.refresh(), 1500);
  }

  return (
    <SectionCard
      title="Seller claims"
      description="Declarations you make about this vehicle. Each one is recorded and cross-checked — never displayed as verified by default."
      action={<span className="td-chip">{claims.length} on file</span>}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
        <label className="block">
          <span className="td-label">Claim</span>
          <select value={field} onChange={(e) => setField(e.target.value)} className="td-input td-select">
            {claimFields.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="td-label">Value</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={500}
            placeholder="e.g. 2 owners"
            className="td-input"
          />
        </label>
        <button onClick={submit} disabled={busy} className="td-btn td-btn-primary self-end">
          <Icon name={busy ? "Loader2" : "Plus"} size={14} className={busy ? "animate-spin" : ""} />
          {busy ? "Saving…" : "Record"}
        </button>
      </div>

      {(error || info) && (
        <div className="mt-3 space-y-2" aria-live="polite">
          {error && <InlineAlert tone="danger" title="Could not record" detail={error} />}
          {info && <InlineAlert tone="success" title="Claim recorded" detail={info} />}
        </div>
      )}

      <div className="mt-4 space-y-1.5">
        {claims.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-muted">No claims recorded.</p>
        ) : (
          claims.slice(0, 8).map((claim) => (
            <div key={claim.id} className="flex items-center justify-between gap-2 rounded-[8px] px-1.5 py-1.5 text-[12px] hover:bg-surface-tint">
              <span className="min-w-0 truncate text-muted">
                {claimFields.find((f) => f.value === claim.field)?.label ?? claim.field}: <span className="font-semibold text-ink">{claim.value}</span>
              </span>
              <StatusBadge status={claim.status} />
            </div>
          ))
        )}
      </div>
    </SectionCard>
  );
}
