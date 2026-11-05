"use client";

import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StatCard } from "@/components/ui/StatCard";
import { SectionCard } from "@/components/shared/SectionCard";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { cn } from "@/lib/cn";

export interface DocumentRow {
  id: string;
  type: string;
  file_name: string;
  mime: string;
  size_bytes: number;
  status: string;
  status_reason: string | null;
  sha256: string;
  shortHash: string;
  consent: boolean;
  version: number;
  supersedes_id: string | null;
  verified_at: string | null;
  uploaded_at: string;
  duplicate: boolean;
  canReplace: boolean;
  extractedFields: Record<string, unknown>;
}

const labels: Record<string, string> = {
  rc: "Registration Certificate",
  insurance: "Insurance Policy",
  puc: "PUC Certificate",
  service: "Service Invoice",
  repair: "Repair Invoice",
  inspection: "Inspection Report",
  accident_claim: "Accident Claim",
  ownership: "Ownership Document",
};

const docTypes = Object.keys(labels);

export interface NearDuplicateCandidate {
  documentId: string;
  otherDocumentId: string;
  type: string;
  similarity: number;
  method: string;
  reason: string;
}

export interface NearDuplicatesView {
  compared: number;
  method: string;
  candidates: NearDuplicateCandidate[];
  note: string;
}

function formatBytes(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsManager({
  vehicleId,
  docs,
  completeness,
  nearDuplicates,
}: {
  vehicleId: string;
  docs: DocumentRow[];
  completeness: number;
  nearDuplicates: NearDuplicatesView;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replaceTarget, setReplaceTarget] = useState<DocumentRow | null>(null);
  const docNames = new Map(docs.map((d) => [d.id, d.file_name]));
  const [type, setType] = useState("rc");
  const [consent, setConsent] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const verified = docs.filter((d) => d.status === "verified").length;
  const shared = docs.filter((d) => d.consent).length;

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a PDF or image to upload.");
      return;
    }
    setBusy("upload");
    setError(null);
    setInfo(null);
    const fd = new FormData();
    fd.append("type", type);
    fd.append("consent", String(consent));
    fd.append("file", file);
    const res = await fetch(`/api/v1/vehicles/${vehicleId}/documents`, { method: "POST", body: fd });
    const json = (await res.json().catch(() => ({}))) as {
      data?: { scan?: { status?: string }; extractions?: number };
      error?: { message?: string };
    };
    setBusy(null);
    if (!res.ok) {
      setError(json.error?.message ?? "Upload failed.");
      return;
    }
    const scanStatus = json.data?.scan?.status;
    setInfo(
      scanStatus === "clean"
        ? "Document uploaded, scanned for malware and queued for verification."
        : `Document uploaded and queued for verification. Malware scan: ${scanStatus ?? "not configured"} — this file was not scanned.`
    );
    if (fileRef.current) fileRef.current.value = "";
    window.setTimeout(() => router.refresh(), 1500);
  }

  async function toggleConsent(d: DocumentRow) {
    setBusy(d.id);
    setError(null);
    const res = await fetch(`/api/v1/documents/${d.id}/consent`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consent: !d.consent }),
    });
    setBusy(null);
    if (!res.ok) {
      setError("Could not update sharing consent.");
      return;
    }
    router.refresh();
  }

  function chooseReplacement(d: DocumentRow) {
    setReplaceTarget(d);
    setError(null);
    setInfo(null);
    if (replaceRef.current) {
      replaceRef.current.value = "";
      replaceRef.current.click();
    }
  }

  async function onReplacementChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const target = replaceTarget;
    if (!file || !target) return;
    setBusy(target.id);
    setError(null);
    setInfo(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/v1/documents/${target.id}/replace`, {
      method: "POST",
      headers: {
        "Idempotency-Key": `replace-${target.id}-${file.size}-${file.name}`.slice(0, 190),
      },
      body: fd,
    });
    const json = (await res.json().catch(() => ({}))) as { data?: { versioned?: boolean }; error?: { message?: string } };
    setBusy(null);
    setReplaceTarget(null);
    if (!res.ok) {
      setError(json.error?.message ?? "Could not replace the document.");
      return;
    }
    setInfo(
      json.data?.versioned
        ? "Verified document preserved — the uploaded file was stored as a new version."
        : "Replacement file uploaded and queued for verification."
    );
    window.setTimeout(() => router.refresh(), 1500);
  }

  async function reverify(d: DocumentRow) {
    setBusy(d.id);
    setError(null);
    const res = await fetch(`/api/v1/documents/${d.id}/reverify`, { method: "POST" });
    setBusy(null);
    if (!res.ok) {
      setError("Could not start re-verification.");
      return;
    }
    setInfo("Re-verification queued.");
    router.refresh();
  }

  async function remove(d: DocumentRow) {
    if (!window.confirm(`Delete ${d.file_name}? It is hidden from your documents but retained for audit.`)) {
      return;
    }
    setBusy(d.id);
    setError(null);
    const res = await fetch(`/api/v1/documents/${d.id}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      setError(json.error?.message ?? "Could not delete the document.");
      return;
    }
    setInfo("Document deleted. The record is retained for audit.");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <input
        ref={replaceRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        onChange={onReplacementChosen}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon="ClipboardCheck" label="Document coverage" value={`${completeness}%`} hint="Share of required evidence on file" />
        <StatCard icon="FolderOpen" label="Documents" value={docs.length} hint="All versions on this vehicle" tone="neutral" />
        <StatCard icon="CheckCircle2" label="Verified" value={verified} hint="Passed automated checks" tone="success" />
        <StatCard icon="Share2" label="Shared with buyers" value={shared} hint="Consent granted per document" tone="gold" />
      </div>

      <SectionCard
        title="Upload a document"
        description="PDF or image up to 10 MB. Every upload is hashed and queued for verification before it appears in a buyer report."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="block">
            <span className="td-label">Document type</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className="td-input td-select">
              {docTypes.map((t) => (
                <option key={t} value={t}>
                  {labels[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block md:col-span-2">
            <span className="td-label">File (PDF or image, max 10 MB)</span>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="td-input block cursor-pointer py-2 text-[13px] file:mr-3 file:rounded-[8px] file:border-0 file:bg-info-bg file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-ink"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <label className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Share this document with buyers who request consent
          </label>
          <button onClick={upload} disabled={busy === "upload"} className="td-btn td-btn-primary">
            {busy === "upload" ? (
              <>
                <Icon name="Loader2" size={15} className="animate-spin" /> Uploading…
              </>
            ) : (
              <>
                <Icon name="Upload" size={15} /> Upload document
              </>
            )}
          </button>
        </div>

        {(error || info) && (
          <div className="mt-4 space-y-2" aria-live="polite">
            {error && <InlineAlert tone="danger" title="Action failed" detail={error} />}
            {info && <InlineAlert tone="success" title="Done" detail={info} />}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Document library"
        description="Versions are immutable once verified. Replacements create a linked version instead of overwriting history."
        action={<span className="td-chip">{docs.length} records</span>}
        flush
      >
        {docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-tint text-primary">
              <Icon name="FolderOpen" size={22} />
            </span>
            <p className="text-[14px] font-semibold text-ink">No documents yet</p>
            <p className="max-w-sm text-[12.5px] leading-relaxed text-muted">
              Start with the registration certificate and insurance policy. Coverage improves as each document is verified.
            </p>
          </div>
        ) : (
          <div className="td-scroll overflow-x-auto">
            <table className="w-full min-w-[940px] text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 font-semibold">Document</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Buyer access</th>
                  <th className="px-4 py-3 font-semibold">Integrity</th>
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className="border-b border-border/70 align-top transition-colors last:border-0 hover:bg-surface-tint/60">
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-info-bg text-primary">
                          <Icon name="FileText" size={15} />
                        </span>
                        <div className="min-w-0">
                          <div className="max-w-[260px] truncate text-[13.5px] font-semibold text-ink" title={d.file_name}>
                            {d.file_name}
                          </div>
                          <div className="mt-0.5 text-[11.5px] text-muted">
                            v{d.version} · {formatBytes(d.size_bytes)} · {new Date(d.uploaded_at).toLocaleDateString("en-IN")}
                          </div>
                          {d.supersedes_id && (
                            <div className="mt-1 text-[11px] text-muted">Supersedes an earlier version</div>
                          )}
                          {d.duplicate && (
                            <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-danger">
                              <Icon name="ShieldAlert" size={11} /> Same hash found on another vehicle
                            </div>
                          )}
                          {d.status_reason && <div className="mt-1 text-[11px] text-danger">{d.status_reason}</div>}
                          {Object.keys(d.extractedFields).length > 0 && (
                            <details className="mt-1.5">
                              <summary className="cursor-pointer text-[11px] font-semibold text-primary">
                                Parsed fields ({Object.keys(d.extractedFields).length})
                              </summary>
                              <dl className="mt-1 space-y-0.5">
                                {Object.entries(d.extractedFields)
                                  .filter(([key]) => !["method", "confidence", "confidences", "pages"].includes(key))
                                  .slice(0, 24)
                                  .map(([key, value]) => (
                                    <div key={key} className="flex items-start justify-between gap-2 text-[10.5px]">
                                      <dt className="shrink-0 text-muted">{key}</dt>
                                      <dd className="max-w-[150px] truncate text-right font-mono text-ink" title={typeof value === "string" ? value : JSON.stringify(value)}>
                                        {typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value)}
                                      </dd>
                                    </div>
                                  ))}
                              </dl>
                            </details>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-[12.5px] text-muted">{labels[d.type] ?? d.type}</td>
                    <td className="px-4 py-4">
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => toggleConsent(d)}
                        disabled={busy === d.id}
                        aria-pressed={d.consent}
                        className={cn(
                          "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-semibold transition",
                          d.consent
                            ? "border-success/25 bg-success-bg text-success"
                            : "border-border bg-surface-tint text-muted hover:text-ink"
                        )}
                      >
                        <Icon name={d.consent ? "Eye" : "EyeOff"} size={12} />
                        {d.consent ? "Shared" : "Private"}
                      </button>
                    </td>
                    <td className="px-4 py-4">
                      <code className="rounded-[6px] bg-surface-tint px-1.5 py-1 font-mono text-[11px] text-muted">{d.shortHash}…</code>
                      <div className="mt-1 text-[10.5px] text-muted">SHA-256</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button onClick={() => chooseReplacement(d)} disabled={busy === d.id} className="td-btn td-btn-secondary td-btn-sm">
                          {busy === d.id ? <Icon name="Loader2" size={13} className="animate-spin" /> : <Icon name="RefreshCw" size={13} />}
                          {d.canReplace ? "Replace" : "New version"}
                        </button>
                        <button onClick={() => reverify(d)} disabled={busy === d.id} className="td-btn td-btn-ghost td-btn-sm">
                          <Icon name="ScanSearch" size={13} /> Re-verify
                        </button>
                        <button onClick={() => remove(d)} disabled={busy === d.id} className="td-btn td-btn-ghost td-btn-sm">
                          <Icon name="Trash2" size={13} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Near-duplicate review"
        description={`${nearDuplicates.compared} documents compared by extracted text, type and file size. A candidate is a prompt to review, not a finding of tampering.`}
        action={<span className="td-chip">{nearDuplicates.candidates.length} candidate(s)</span>}
      >
        {nearDuplicates.candidates.length === 0 ? (
          <p className="text-[12px] text-muted">No near-duplicate pairs were detected with the extraction data on file.</p>
        ) : (
          <div className="space-y-2">
            {nearDuplicates.candidates.map((candidate) => (
              <div
                key={`${candidate.documentId}-${candidate.otherDocumentId}`}
                className="rounded-[9px] border border-border bg-surface-tint px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold text-ink">
                    {docNames.get(candidate.documentId) ?? candidate.documentId} ↔{" "}
                    {docNames.get(candidate.otherDocumentId) ?? candidate.otherDocumentId}
                  </span>
                  <span className="text-[11px] font-semibold text-warning">
                    {Math.round(candidate.similarity * 100)}% similar
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted">
                  {candidate.reason} · {candidate.method}
                </p>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-muted">{nearDuplicates.note}</p>
      </SectionCard>

      <p className="td-help">
        A matching SHA-256 proves the file has not changed since upload — it is not proof of authenticity. Documents are released to a
        buyer only after they request consent and you approve it.
      </p>
    </div>
  );
}
