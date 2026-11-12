"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { getAvailableComponents } from "@/lib/vehicle-registry";

const SEVERITIES = ["Minor", "Moderate", "Major"] as const;

function extractApiError(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const obj = data as { reason?: unknown; error?: unknown; detail?: unknown };
  if (typeof obj.reason === "string" && obj.reason) return obj.reason;
  if (typeof obj.error === "string" && obj.error) return obj.error;
  if (obj.error && typeof obj.error === "object" && "message" in obj.error) {
    const msg = (obj.error as { message?: unknown }).message;
    if (typeof msg === "string" && msg) return msg;
  }
  if (typeof obj.detail === "string" && obj.detail) return obj.detail;
  return fallback;
}

export interface DamageDetection {
  label: string;
  class_id: number;
  confidence: number;
  box: number[];
}

export interface DetectResponse {
  available: boolean;
  reason?: string;
  detections?: DamageDetection[];
  candidateDamageIds?: string[];
  modelVersion?: string;
  limitations?: unknown;
}

export interface ReviewResponse {
  damage: Record<string, unknown>;
  status: string;
}

/**
 * Runs the car-only damage CV detector on one uploaded photo and lets the seller
 * verify or reject each returned candidate. If the backend reports the detector
 * is unavailable (409 / available:false — non-car category or missing weights)
 * we show the honest reason and NEVER fabricate detections.
 */
export function AiDamageScan({
  vehicleId,
  photoId,
  zones,
  onReviewed,
}: {
  vehicleId: string;
  photoId: string;
  zones?: { id: string; label: string }[];
  onReviewed?: () => void;
}) {
  const zoneOptions = zones?.length
    ? zones
    : getAvailableComponents().map((c) => ({ id: c.id, label: c.label }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [rows, setRows] = useState<{ detection: DamageDetection; damageId: string }[]>([]);
  const [decisions, setDecisions] = useState<Record<string, "verified" | "rejected">>({});
  const [componentChoices, setComponentChoices] = useState<Record<string, string>>({});
  const [severityChoices, setSeverityChoices] = useState<Record<string, (typeof SEVERITIES)[number]>>({});

  async function runScan() {
    setBusy(true);
    setError(null);
    setUnavailable(null);
    setRows([]);
    setModel(null);
    setDecisions({});
    setComponentChoices({});
    setSeverityChoices({});
    try {
      const res = await fetch(`/api/v1/vehicles/${vehicleId}/photos/${photoId}/detect`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as DetectResponse | null;
      if (res.status === 409 || (data && data.available === false)) {
        setUnavailable(data?.reason ?? "The damage detector is not available for this photo.");
        return;
      }
      if (!res.ok || !data) {
        setError(extractApiError(data, `Detection failed (HTTP ${res.status}).`));
        return;
      }
      setModel(data.modelVersion ?? null);
      const candidates = data.candidateDamageIds ?? [];
      const mapped = (data.detections ?? [])
        .map((detection, i) => ({ detection, damageId: candidates[i] }))
        .filter((r): r is { detection: DamageDetection; damageId: string } => Boolean(r.damageId));
      setRows(mapped);
      if (!mapped.length) {
        setUnavailable("The detector ran but found no damage candidates in this photo.");
      }
    } catch {
      setError("Could not reach the detection service.");
    } finally {
      setBusy(false);
    }
  }

  async function review(damageId: string, status: "verified" | "rejected") {
    setBusy(true);
    setError(null);
    const chosenComponent = componentChoices[damageId];
    const chosenSeverity = severityChoices[damageId] ?? "Minor";
    const payload =
      status === "verified"
        ? {
            status,
            ...(chosenComponent ? { component_id: chosenComponent } : {}),
            severity: chosenSeverity,
          }
        : { status };
    try {
      const res = await fetch(`/api/v1/vehicles/${vehicleId}/damage/${damageId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as ReviewResponse | { error?: unknown; detail?: unknown } | null;
      if (!res.ok || !data || !("damage" in (data ?? {}))) {
        setError(extractApiError(data, "Could not record the review."));
        return;
      }
      setDecisions((prev) => ({ ...prev, [damageId]: status }));
      onReviewed?.();
    } catch {
      setError("Could not reach the review service.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 rounded-card border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
          <Icon name="ScanSearch" size={14} /> AI damage scan
        </p>
        <button
          onClick={runScan}
          disabled={busy}
          className="td-btn td-btn-secondary td-btn-sm"
        >
          <Icon name={busy ? "Loader2" : "ScanSearch"} size={13} className={busy ? "animate-spin" : ""} />
          {busy ? "Scanning…" : "Run AI damage scan"}
        </button>
      </div>

      {model && (
        <p className="mt-1 text-[10.5px] font-mono text-muted">model {model}</p>
      )}

      {unavailable && (
        <div className="mt-2">
          <InlineAlert
            tone="warning"
            title="Damage detector unavailable"
            detail={unavailable}
          />
        </div>
      )}

      {error && (
        <div className="mt-2">
          <InlineAlert tone="danger" title="Scan could not run" detail={error} />
        </div>
      )}

      {rows.length > 0 && (
        <ul className="mt-2 space-y-2">
          {rows.map(({ detection, damageId }) => {
            const decision = decisions[damageId];
            return (
              <li key={damageId} className="rounded-card border border-border bg-surface-tint p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[12.5px] font-semibold text-ink">{detection.label}</span>
                  <span className="td-chip">{Math.round(detection.confidence * 100)}% confidence</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {decision ? (
                    <span
                      className={
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold " +
                        (decision === "verified"
                          ? "bg-success-bg text-success"
                          : "bg-danger-bg text-danger")
                      }
                    >
                      <Icon name={decision === "verified" ? "Check" : "X"} size={12} />
                      {decision === "verified" ? "Verified" : "Rejected"}
                    </span>
                  ) : (
                    <>
                      <select
                        aria-label="Damaged 3D component"
                        value={componentChoices[damageId] ?? ""}
                        onChange={(e) =>
                          setComponentChoices((prev) => ({ ...prev, [damageId]: e.target.value }))
                        }
                        disabled={busy}
                        className="td-input td-select h-8 py-0 text-[11.5px]"
                      >
                        <option value="">Map 3D panel (optional)</option>
                        {zoneOptions.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.label}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Damage severity"
                        value={severityChoices[damageId] ?? "Minor"}
                        onChange={(e) =>
                          setSeverityChoices((prev) => ({
                            ...prev,
                            [damageId]: e.target.value as (typeof SEVERITIES)[number],
                          }))
                        }
                        disabled={busy}
                        className="td-input td-select h-8 py-0 text-[11.5px]"
                      >
                        {SEVERITIES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => review(damageId, "verified")}
                        disabled={busy}
                        className="td-btn td-btn-primary td-btn-sm"
                      >
                        <Icon name="Check" size={12} /> Verify
                      </button>
                      <button
                        onClick={() => review(damageId, "rejected")}
                        disabled={busy}
                        className="td-btn td-btn-ghost td-btn-sm"
                      >
                        <Icon name="X" size={12} /> Reject
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
