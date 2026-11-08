"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { InlineAlert } from "@/components/shared/InlineAlert";

export interface OcrResponse {
  available?: boolean;
  reason?: string;
  text?: string;
  fields?: Record<string, unknown>;
  confidence?: number;
}

export interface OcrCorrectionResponse {
  document: Record<string, unknown>;
  ocr_status: string;
}

/**
 * Runs OCR on a stored document and lets the seller review/correct the extracted
 * fields. If the backend reports OCR is unavailable (409 / available:false —
 * PaddleOCR missing) we show the honest reason and do NOT invent fields.
 */
export function OcrExtract({
  vehicleId,
  docId,
  onSaved,
}: {
  vehicleId: string;
  docId: string;
  onSaved?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function runOcr() {
    setBusy(true);
    setError(null);
    setUnavailable(null);
    setOpen(true);
    setFields({});
    setText(null);
    setConfidence(null);
    try {
      const res = await fetch(`/api/v1/vehicles/${vehicleId}/documents/${docId}/ocr`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as OcrResponse | null;
      if (res.status === 409 || (data && data.available === false)) {
        setUnavailable(data?.reason ?? "OCR is unavailable for this document.");
        return;
      }
      if (!res.ok || !data) {
        setError((data as { error?: string } | null)?.error ?? `OCR failed (HTTP ${res.status}).`);
        return;
      }
      setText(data.text ?? null);
      setConfidence(typeof data.confidence === "number" ? data.confidence : null);
      setFields(
        Object.fromEntries(
          Object.entries(data.fields ?? {}).map(([k, v]) => [
            k,
            v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v),
          ])
        )
      );
    } catch {
      setError("Could not reach the OCR service.");
    } finally {
      setBusy(false);
    }
  }

  function updateField(key: string, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/vehicles/${vehicleId}/documents/${docId}/ocr`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });
      const data = (await res.json().catch(() => null)) as OcrCorrectionResponse | { error?: string } | null;
      if (!res.ok || !data || !("ocr_status" in (data ?? {}))) {
        setError((data as { error?: string } | null)?.error ?? "Could not save corrections.");
        return;
      }
      onSaved?.();
    } catch {
      setError("Could not reach the correction service.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 rounded-card border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
          <Icon name="FileSearch" size={14} /> OCR extraction
        </p>
        <button onClick={runOcr} disabled={busy} className="td-btn td-btn-secondary td-btn-sm">
          <Icon name={busy ? "Loader2" : "FileSearch"} size={13} className={busy ? "animate-spin" : ""} />
          {busy ? "Extracting…" : "Extract with OCR"}
        </button>
      </div>

      {confidence !== null && (
        <p className="mt-1 text-[10.5px] font-mono text-muted">
          confidence {Math.round(confidence * 100)}%
        </p>
      )}

      {unavailable && (
        <div className="mt-2">
          <InlineAlert tone="warning" title="OCR unavailable" detail={unavailable} />
        </div>
      )}

      {error && (
        <div className="mt-2">
          <InlineAlert tone="danger" title="OCR could not run" detail={error} />
        </div>
      )}

      {open && !unavailable && !error && Object.keys(fields).length > 0 && (
        <div className="mt-2 space-y-2">
          {text && (
            <details className="rounded-card border border-border bg-surface-tint p-2.5">
              <summary className="cursor-pointer text-[11px] font-semibold text-primary">Raw OCR text</summary>
              <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap text-[10.5px] text-muted">{text}</pre>
            </details>
          )}
          {Object.entries(fields).map(([key, value]) => (
            <label key={key} className="block">
              <span className="td-label capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
              <input
                value={value}
                onChange={(e) => updateField(key, e.target.value)}
                className="td-input"
              />
            </label>
          ))}
          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-[11px] text-muted">Corrections are stored as a reviewed OCR record.</p>
            <button onClick={save} disabled={busy} className="td-btn td-btn-primary td-btn-sm">
              <Icon name={busy ? "Loader2" : "Save"} size={12} className={busy ? "animate-spin" : ""} />
              {busy ? "Saving…" : "Save corrections"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
