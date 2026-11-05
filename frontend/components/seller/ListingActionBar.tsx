"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { SectionCard } from "@/components/shared/SectionCard";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { cn } from "@/lib/cn";

type Key = "photos" | "documents" | "price" | "description" | "preview" | "share" | "inquiries" | "report";

interface SharePayload {
  listingUrl: string;
  verifyUrl: string;
  qrDataUrl: string;
  token: string;
  activeShares: number;
}

/**
 * The eight Listing Features actions. Each one either focuses a real field in
 * the workspace, navigates to a real DB-backed screen, or calls a real endpoint
 * — there is no decorative button in this bar.
 */
export function ListingActionBar({
  vehicleId,
  listingId,
  vehicleLabel,
  onAddPhotos,
  onSetPrice,
  onWriteDescription,
}: {
  vehicleId: string;
  listingId: string;
  vehicleLabel: string;
  onAddPhotos: () => void;
  onSetPrice: () => void;
  onWriteDescription: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Key | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [share, setShare] = useState<SharePayload | null>(null);
  const [copied, setCopied] = useState(false);
  const [report, setReport] = useState<{ id: string; reportId: string } | null>(null);

  const buttons: { key: Key; icon: string; label: string; hint: string; run: () => void }[] = [
    { key: "photos", icon: "ImagePlus", label: "Add Photos", hint: "Upload real vehicle images", run: onAddPhotos },
    { key: "documents", icon: "FolderOpen", label: "Upload Documents", hint: "RC, insurance, PUC, invoices", run: () => router.push(`/seller/documents?vehicle=${vehicleId}`) },
    { key: "price", icon: "Tag", label: "Set Price", hint: "Ask price for this listing", run: onSetPrice },
    { key: "description", icon: "PenLine", label: "Write Description", hint: "AI draft from verified records", run: onWriteDescription },
    { key: "preview", icon: "Eye", label: "Preview Listing", hint: "Open the public buyer page", run: () => window.open(`/vehicle/${vehicleId}`, "_blank", "noopener") },
    { key: "share", icon: "Share2", label: "Share Listing", hint: "Signed link + QR", run: () => void doShare() },
    { key: "inquiries", icon: "MessageSquare", label: "Track Inquiries", hint: "Buyer conversations for this listing", run: () => router.push(`/seller/inquiries?listing=${listingId}`) },
    { key: "report", icon: "FileDown", label: "Get Verification Report", hint: "Generate the PDF", run: () => void doGetReport() },
  ];

  async function doShare() {
    setBusy("share");
    setError(null);
    setCopied(false);
    const res = await fetch(`/api/v1/seller/listings/${listingId}/share`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as { data?: SharePayload; error?: { message?: string } };
    setBusy(null);
    if (!res.ok || !json.data) {
      setError(json.error?.message ?? "Could not create a share link.");
      return;
    }
    setShare(json.data);
  }

  async function revokeShare() {
    setBusy("share");
    const res = await fetch(`/api/v1/seller/listings/${listingId}/share`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) {
      setError("Could not revoke the share links.");
      return;
    }
    setShare(null);
    router.refresh();
  }

  async function copyLink() {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(share.verifyUrl);
      setCopied(true);
    } catch {
      setError("Your browser blocked clipboard access — select the link and copy it manually.");
    }
  }

  async function doGetReport() {
    setBusy("report");
    setError(null);
    const res = await fetch(`/api/v1/reports/vehicle/${vehicleId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "Vehicle verification" }),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: { id: string; reportId: string }; error?: { message?: string } };
    setBusy(null);
    if (!res.ok || !json.data) {
      setError(json.error?.message ?? "Could not generate the verification report.");
      return;
    }
    setReport(json.data);
    router.refresh();
  }

  return (
    <SectionCard
      title="Listing features"
      description="Every action writes to the shared vehicle database — nothing here is decorative."
      action={
        <span className="td-chip">
          <Icon name="Layers" size={12} /> {vehicleLabel}
        </span>
      }
    >
      {error && (
        <div className="mb-3" role="alert">
          <InlineAlert tone="danger" title="Action failed" detail={error} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {buttons.map((b) => (
          <button
            key={b.key}
            onClick={b.run}
            disabled={busy !== null}
            title={b.hint}
            className={cn(
              "group flex items-start gap-2.5 rounded-[12px] border border-border bg-surface-tint p-3 text-left transition",
              "hover:border-primary/50 hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-info-bg text-primary transition group-hover:bg-primary/20">
              {busy === b.key ? <Icon name="Loader2" size={15} className="animate-spin" /> : <Icon name={b.icon} size={15} />}
            </span>
            <span className="min-w-0">
              <span className="block text-[12px] font-semibold leading-tight text-ink">{b.label}</span>
              <span className="mt-0.5 block truncate text-[10.5px] leading-tight text-muted">{b.hint}</span>
            </span>
          </button>
        ))}
      </div>

      {report && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[12px] border border-success/25 bg-success-bg px-4 py-3">
          <Icon name="FileCheck" size={16} className="text-success" />
          <span className="text-[12.5px] font-semibold text-ink">Report {report.reportId} is ready.</span>
          <a href={`/api/v1/reports/${report.id}/download`} className="td-btn td-btn-primary td-btn-sm ml-auto">
            <Icon name="Download" size={12} /> Download PDF
          </a>
          <a href="/seller/reports" className="td-btn td-btn-secondary td-btn-sm">
            All reports
          </a>
        </div>
      )}

      {share && (
        <div className="mt-3 grid grid-cols-1 gap-4 rounded-[12px] border border-primary/30 bg-surface p-4 md:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <p className="text-[12.5px] font-semibold text-ink">Share link created</p>
            <p className="text-[11.5px] leading-relaxed text-muted">
              Signed, revocable token — {share.activeShares} active. Buyers see the consent-filtered public summary only; your documents
              stay private.
            </p>
            <input
              readOnly
              value={share.verifyUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="td-input text-[11.5px]"
            />
            <div className="flex flex-wrap gap-2">
              <button onClick={copyLink} className="td-btn td-btn-primary td-btn-sm">
                <Icon name={copied ? "Check" : "ClipboardList"} size={12} /> {copied ? "Copied" : "Copy verify link"}
              </button>
              <a href={share.listingUrl} target="_blank" rel="noreferrer" className="td-btn td-btn-secondary td-btn-sm">
                <Icon name="ExternalLink" size={12} /> Open public listing
              </a>
              <button onClick={revokeShare} disabled={busy !== null} className="td-btn td-btn-danger td-btn-sm">
                <Icon name="ShieldX" size={12} /> Revoke all links
              </button>
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={share.qrDataUrl} alt={`QR code for ${vehicleLabel}`} className="h-28 w-28 self-center rounded-[10px] border border-border bg-white p-1" />
        </div>
      )}
    </SectionCard>
  );
}
