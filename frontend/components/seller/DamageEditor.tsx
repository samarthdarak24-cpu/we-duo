"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { SectionCard } from "@/components/shared/SectionCard";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { apiCall } from "@/lib/client/api";

const severities = ["Minor", "Moderate", "Major"] as const;
const repairStates = ["Not repaired", "Repaired", "Pending repair"] as const;

export interface FiledDamage {
  id: string;
  zoneLabel: string;
  severity: string;
  description: string;
  repairStatus: string;
  status: string;
  inspectionDate: string | null;
}

/**
 * Records a damage entry against a real 3D zone. The hotspot only appears in the
 * viewer because this POST created a damage record — never as a decoration.
 * Verified rows are immutable: a correction is written as a new pending record
 * that supersedes the original.
 */
export function DamageEditor({
  vehicleId,
  zones,
  recordCount,
  records = [],
}: {
  vehicleId: string;
  zones: { id: string; label: string }[];
  recordCount: number;
  records?: FiledDamage[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [zoneId, setZoneId] = useState(zones[0]?.id ?? "");
  const [severity, setSeverity] = useState<(typeof severities)[number]>("Minor");
  const [repairStatus, setRepairStatus] = useState<(typeof repairStates)[number]>("Not repaired");
  const [description, setDescription] = useState("");
  const [inspectionDate, setInspectionDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [correctionText, setCorrectionText] = useState("");
  const [correctionRepair, setCorrectionRepair] = useState("");
  const [correctionBusy, setCorrectionBusy] = useState(false);

  async function submit() {
    if (!zoneId) {
      setError("Choose the damaged zone.");
      return;
    }
    if (description.trim().length < 8) {
      setError("Describe the damage in at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    const r = await apiCall<{ id?: string }>(
      `/api/v1/vehicles/${vehicleId}/damage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zoneId,
          description: description.trim(),
          severity,
          repairStatus,
          inspectionDate: inspectionDate || undefined,
        }),
      },
      "Could not record the damage."
    );
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setDescription("");
    setInspectionDate("");
    setInfo("Damage recorded as pending. It becomes a 3D hotspot immediately and needs review before it affects the report.");
    // Let the confirmation paint before the server refresh re-renders this card.
    window.setTimeout(() => router.refresh(), 1500);
  }

  /** Verified rows are never edited in place — a correction supersedes them. */
  async function correct() {
    if (!correctingId) return;
    if (correctionText.trim().length < 8) {
      setError("Describe the correction in at least 8 characters.");
      return;
    }
    setCorrectionBusy(true);
    setError(null);
    setInfo(null);
    const r = await apiCall<{ id?: string }>(
      `/api/v1/damage/${correctingId}/correction`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: correctionText.trim(),
          repairStatus: correctionRepair || undefined,
        }),
      },
      "Could not file the correction."
    );
    setCorrectionBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setCorrectingId(null);
    setCorrectionText("");
    setCorrectionRepair("");
    setInfo("Correction filed as a new pending record. The original row stays intact and is superseded once reviewed.");
    window.setTimeout(() => router.refresh(), 1500);
  }

  return (
    <SectionCard
      title="Record damage"
      description={`${recordCount} damage record${recordCount === 1 ? "" : "s"} on file. New entries start as pending.`}
      action={
        <button onClick={() => setOpen((v) => !v)} className="td-btn td-btn-secondary td-btn-sm">
          <Icon name={open ? "ChevronUp" : "CirclePlus"} size={13} /> {open ? "Hide" : "Add damage"}
        </button>
      }
    >
      {!open ? (
        <p className="text-[12px] leading-relaxed text-muted">
          Zones come from the model mapping. A hotspot is only shown where a stored damage row exists, so the viewer and this form stay
          in sync.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="td-label">Zone</span>
              <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className="td-input td-select">
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="td-label">Severity</span>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value as (typeof severities)[number])}
                className="td-input td-select"
              >
                {severities.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="td-label">Repair status</span>
              <select
                value={repairStatus}
                onChange={(e) => setRepairStatus(e.target.value as (typeof repairStates)[number])}
                className="td-input td-select"
              >
                {repairStates.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="td-label">Inspection date (optional)</span>
              <input
                type="date"
                value={inspectionDate}
                onChange={(e) => setInspectionDate(e.target.value)}
                className="td-input"
              />
            </label>
          </div>
          <label className="block">
            <span className="td-label">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="What was observed, and where?"
              className="td-input resize-y"
            />
          </label>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-muted">Recorded against your account and chained for audit.</p>
            <button onClick={submit} disabled={busy} className="td-btn td-btn-primary td-btn-sm">
              <Icon name={busy ? "Loader2" : "Save"} size={13} className={busy ? "animate-spin" : ""} />
              {busy ? "Saving…" : "Save damage"}
            </button>
          </div>
        </div>
      )}

      {records.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="td-label">Filed records</p>
          <ul className="space-y-2">
            {records.map((rec) => (
              <li key={rec.id} className="rounded-card border border-border bg-surface-tint p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12.5px] font-semibold">{rec.zoneLabel}</span>
                    <span className="td-chip">{rec.severity}</span>
                    <span className="td-chip">{rec.repairStatus}</span>
                    <span className="td-chip">{rec.status}</span>
                  </div>
                  <button
                    onClick={() => {
                      setCorrectingId((v) => (v === rec.id ? null : rec.id));
                      setCorrectionText("");
                      setCorrectionRepair("");
                      setError(null);
                    }}
                    className="td-btn td-btn-secondary td-btn-sm"
                  >
                    <Icon name="PencilLine" size={12} /> Request correction
                  </button>
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{rec.description}</p>
                <p className="mt-1 text-[10.5px] font-mono text-muted">
                  id {rec.id} · inspected {rec.inspectionDate ?? "not recorded"}
                </p>
                {correctingId === rec.id && (
                  <div className="mt-3 space-y-2 rounded-card border border-border bg-surface p-3">
                    <label className="block">
                      <span className="td-label">Correction description</span>
                      <textarea
                        value={correctionText}
                        onChange={(e) => setCorrectionText(e.target.value)}
                        rows={2}
                        maxLength={500}
                        placeholder="What is wrong with this record, and what should replace it?"
                        className="td-input resize-y"
                      />
                    </label>
                    <label className="block">
                      <span className="td-label">Repair status in the corrected record (optional)</span>
                      <select
                        value={correctionRepair}
                        onChange={(e) => setCorrectionRepair(e.target.value)}
                        className="td-input td-select"
                      >
                        <option value="">Keep the original</option>
                        {repairStates.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-muted">
                        Supersedes {rec.id}. Nothing here edits or deletes the original row.
                      </p>
                      <button
                        onClick={correct}
                        disabled={correctionBusy}
                        className="td-btn td-btn-primary td-btn-sm"
                      >
                        <Icon
                          name={correctionBusy ? "Loader2" : "Save"}
                          size={13}
                          className={correctionBusy ? "animate-spin" : ""}
                        />
                        {correctionBusy ? "Filing…" : "File correction"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(error || info) && (
        <div className="mt-3 space-y-2" aria-live="polite">
          {error && <InlineAlert tone="danger" title="Could not save" detail={error} />}
          {info && <InlineAlert tone="success" title="Damage recorded" detail={info} />}
        </div>
      )}
    </SectionCard>
  );
}
