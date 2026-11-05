"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Tabs } from "@/components/ui/Tabs";
import { PriceRangeBar } from "@/components/ui/PriceRangeBar";
import { InsightRow } from "@/components/ui/InsightRow";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Timeline } from "@/components/ui/Timeline";
import { Icon } from "@/components/ui/Icon";
import { SectionCard } from "@/components/shared/SectionCard";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { formatINR, formatINRCompact, formatKm } from "@/lib/format";
import type { HistoryRow } from "@/lib/server/db";

export interface VehicleDetailData {
  id: string;
  make: string;
  model: string;
  variant: string;
  year: number;
  regNo: string;
  vin: string;
  km: number;
  fuel: string;
  transmission: string;
  location: string;
  ownershipCount: number;
  color: string;
  trustdriveId: string;
  price: number;
  trust: { trustScore: number; riskScore: number; band: string; bandLabel: string; evidenceCoverage: number };
  pricing: { estimate: number; low: number; high: number; confidence: string; comparables: number } | null;
  insights: { label: string; detail: string; status: string }[];
  documents: { id: string; type: string; file_name: string; status: string; consent: boolean; verified_at: string | null }[];
  history: HistoryRow[];
  mileage: { id: string; date: string; km: number; source: string; flagged: number | boolean; verified: number | boolean; is_seller_claim: number | boolean }[];
  damage: { id: string; zone_id: string; severity: string; description: string; repair_status: string; inspection_date: string | null; status: string }[];
  findings: { id: string; code: string; severity: string; title: string; explanation: string; recommendation: string; status: string }[];
  listing: { id: string; status: string; headline: string; description: string; views: number; saves: number; inquiries: number } | null;
  seller: { name: string; type: string | null; businessName: string | null; verified: boolean } | null;
  chain: { records: number; intact: boolean; brokenAt?: number | null };
  saved: boolean;
}

const tabs = [
  { label: "Overview", value: "overview" },
  { label: "History", value: "history" },
  { label: "Documents", value: "documents" },
  { label: "Damage", value: "damage" },
  { label: "AI Analysis", value: "ai" },
];

const severityColor: Record<string, string> = {
  Minor: "var(--warning)",
  Moderate: "var(--warning)",
  Major: "var(--danger)",
  Critical: "var(--danger)",
};

const inquiryTypes = [
  { value: "general", label: "General question" },
  { value: "photos", label: "Ask for photos" },
  { value: "documents", label: "Request documents" },
  { value: "inspection", label: "Request inspection" },
  { value: "test_drive", label: "Schedule test drive" },
  { value: "price", label: "Negotiate price" },
];

export function VehicleDetailPanel({ data }: { data: VehicleDetailData }) {
  const router = useRouter();
  const [tab, setTab] = useState("overview");
  const [saved, setSaved] = useState(data.saved);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showInquiry, setShowInquiry] = useState(false);
  const [message, setMessage] = useState("");
  const [inquiryType, setInquiryType] = useState("general");
  const [reportUrl, setReportUrl] = useState<string | null>(null);

  async function toggleSave() {
    if (!data.listing) {
      setError("This vehicle is not currently listed.");
      return;
    }
    setBusy("save");
    setError(null);
    const res = await fetch(`/api/v1/saved/${data.listing.id}`, { method: saved ? "DELETE" : "POST" });
    setBusy(null);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      setError(json.error?.message ?? "Could not update saved vehicles.");
      return;
    }
    setSaved((s) => !s);
    router.refresh();
  }

  async function generateReport() {
    setBusy("report");
    setError(null);
    setReportUrl(null);
    const res = await fetch(`/api/v1/reports/vehicle/${data.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "Vehicle verification" }),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: { id: string }; error?: { message?: string } };
    setBusy(null);
    if (!res.ok) {
      setError(json.error?.message ?? "Could not generate the report.");
      return;
    }
    setReportUrl(`/api/v1/reports/${json.data?.id}/download`);
    setInfo("Report generated. The download is ready.");
  }

  async function sendInquiry() {
    if (!data.listing) return;
    if (message.trim().length < 5) {
      setError("Please write a short message.");
      return;
    }
    setBusy("inquiry");
    setError(null);
    const res = await fetch("/api/v1/inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId: data.listing.id, message: message.trim(), type: inquiryType }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    setBusy(null);
    if (!res.ok) {
      setError(json.error?.message ?? "Could not send the inquiry.");
      return;
    }
    setInfo("Inquiry sent. Continue the conversation in your inbox.");
    setMessage("");
    setShowInquiry(false);
  }

  async function reportListing() {
    if (!data.listing) return;
    const reason = window.prompt("Why are you reporting this listing?");
    if (!reason) return;
    setBusy("flag");
    setError(null);
    const res = await fetch(`/api/v1/listings/${data.listing.id}/report-suspicious`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setBusy(null);
    if (!res.ok) {
      setError("Could not report the listing.");
      return;
    }
    setInfo("Reported. An admin will review the listing.");
  }

  const facts: [string, string][] = [
    ["Registration", data.regNo],
    ["VIN", data.vin || "—"],
    ["TrustDrive ID", data.trustdriveId],
    ["Year", String(data.year)],
    ["Mileage (claimed)", formatKm(data.km)],
    ["Fuel", data.fuel],
    ["Transmission", data.transmission],
    ["Ownership", data.ownershipCount === 1 ? "First owner" : `${data.ownershipCount} owners`],
    ["Location", data.location || "—"],
    ["Colour", data.color || "—"],
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {error && <InlineAlert tone="danger" title="That didn’t work" detail={error} />}
        {info && <InlineAlert tone="success" title={info} />}
      </div>

      <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-surface p-3 lg:flex-row lg:items-center">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <button
            onClick={toggleSave}
            disabled={busy === "save"}
            className="td-btn td-btn-sm td-btn-secondary"
            style={saved ? { color: "var(--danger)" } : undefined}
            aria-pressed={saved}
          >
            <Icon name="Heart" size={14} className={saved ? "fill-current" : ""} /> {saved ? "Saved" : "Save"}
          </button>
          <button onClick={generateReport} disabled={busy === "report"} className="td-btn td-btn-sm td-btn-secondary">
            <Icon
              name={busy === "report" ? "Loader2" : "FileDown"}
              size={14}
              className={busy === "report" ? "animate-spin" : ""}
            />
            {busy === "report" ? "Generating…" : "PDF report"}
          </button>
          {reportUrl && (
            <a
              href={reportUrl}
              className="td-btn td-btn-sm"
              style={{
                color: "var(--success)",
                background: "var(--success-bg)",
                borderColor: "color-mix(in srgb, var(--success) 25%, transparent)",
              }}
            >
              <Icon name="Download" size={14} /> Download PDF
            </a>
          )}
          {data.listing && (
            <>
              <button onClick={() => setShowInquiry((s) => !s)} className="td-btn td-btn-sm td-btn-primary">
                <Icon name="MessageSquare" size={14} /> Contact seller
              </button>
              <button onClick={reportListing} disabled={busy === "flag"} className="td-btn td-btn-sm td-btn-ghost" style={{ color: "var(--danger)" }}>
                <Icon name="Flag" size={14} /> Report listing
              </button>
            </>
          )}
        </div>
      </div>

      {showInquiry && data.listing && (
        <SectionCard
          title="Contact the seller"
          description="Your message is delivered to the seller’s inbox and stored against this listing."
          action={
            <button
              onClick={() => setShowInquiry(false)}
              className="td-icon-btn"
              aria-label="Close contact form"
            >
              <Icon name="X" size={15} />
            </button>
          }
        >
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {inquiryTypes.map((t) => {
                const active = inquiryType === t.value;
                return (
                  <button
                    key={t.value}
                    onClick={() => setInquiryType(t.value)}
                    className={cn("td-chip transition", active ? "text-[var(--on-primary)]" : "hover:text-ink")}
                    style={
                      active
                        ? { background: "var(--primary)", borderColor: "var(--primary)", color: "var(--on-primary)" }
                        : undefined
                    }
                    aria-pressed={active}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            <div>
              <label htmlFor="vehicle-inquiry" className="td-label">
                Message
              </label>
              <textarea
                id="vehicle-inquiry"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="Write a message…"
                className="td-textarea"
              />
              <p className="td-help mt-1.5">Minimum 5 characters. Never share payment details outside TrustDrive.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={sendInquiry} disabled={busy === "inquiry"} className="td-btn td-btn-primary">
                {busy === "inquiry" ? "Sending…" : "Send inquiry"}
              </button>
              <button onClick={() => setShowInquiry(false)} className="td-btn td-btn-ghost">
                Cancel
              </button>
            </div>
          </div>
        </SectionCard>
      )}

      {tab === "overview" && (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
          <SectionCard
            title="Vehicle summary"
            description="As declared by the seller and matched against records on file."
            flush
          >
            <dl className="divide-y divide-border">
              {facts.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <dt className="text-[12.5px] text-muted">{label}</dt>
                  <dd className="text-right text-[12.5px] font-semibold text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </SectionCard>

          <SectionCard title="Key insights" description="Coverage across the checks the engine supports today.">
            <div className="space-y-2.5">
              {data.insights.map((i) => (
                <InsightRow key={i.label} insight={i} />
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Market price" description="Estimate is a range, not a valuation certificate.">
            {data.pricing ? (
              <>
                <div className="mb-3 flex items-end justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Estimated value</p>
                    <p className="mt-1 text-[27px] font-extrabold leading-none tracking-tight text-ink td-metric">
                      {formatINRCompact(data.pricing.estimate)}
                    </p>
                  </div>
                  <span className="td-chip">
                    <Icon name="BarChart3" size={11} /> {data.pricing.comparables} comparables
                  </span>
                </div>
                <PriceRangeBar
                  low={data.pricing.low}
                  high={data.pricing.high}
                  marker={data.price}
                  estimate={data.pricing.estimate}
                  chip={{
                    text: data.price <= data.pricing.estimate ? "Below estimate" : "Above estimate",
                    color: data.price <= data.pricing.estimate ? "var(--success)" : "var(--warning)",
                    bg: data.price <= data.pricing.estimate ? "var(--success-bg)" : "var(--warning-bg)",
                  }}
                  disclaimer={`Estimate based on ${data.pricing.comparables} comparable vehicles; confidence ${data.pricing.confidence}. Asking price ${formatINR(data.price)}.`}
                />
              </>
            ) : (
              <p className="rounded-[12px] bg-surface-tint px-4 py-6 text-center text-[12.5px] text-muted">
                No pricing estimate available for this vehicle.
              </p>
            )}
          </SectionCard>

          {data.seller && (
            <SectionCard
              title="Seller"
              description="Identity checks apply to the account, not to the vehicle’s condition."
              className="lg:col-span-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--info-bg)] text-primary">
                    <Icon name={data.seller.type === "dealer" ? "Building2" : "User"} size={20} />
                  </span>
                  <div>
                    <p className="text-[14px] font-semibold text-ink">{data.seller.businessName || data.seller.name}</p>
                    <p className="text-[12.5px] text-muted">
                      {data.seller.type === "dealer" ? "Dealer" : "Individual seller"}
                      {data.seller.verified ? " · KYC verified" : " · KYC pending"}
                    </p>
                  </div>
                </div>
                {data.listing && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="td-chip">
                      <Icon name="Eye" size={11} /> {data.listing.views} views
                    </span>
                    <span className="td-chip">
                      <Icon name="Heart" size={11} /> {data.listing.saves} saves
                    </span>
                    <span className="td-chip">
                      <Icon name="MessageSquare" size={11} /> {data.listing.inquiries} inquiries
                    </span>
                  </div>
                )}
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <SectionCard title="Timeline" description="Owner and event history from records on file.">
            <Timeline events={data.history} />
          </SectionCard>
          <div className="space-y-5">
            <SectionCard title="Odometer readings" description="Flagged readings are warnings, not proof of tampering.">
              {data.mileage.length ? (
                <div className="divide-y divide-border">
                  {data.mileage.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div>
                        <p className="text-[12.5px] font-semibold capitalize text-ink">{m.source.replace(/_/g, " ")}</p>
                        <p className="text-[11.5px] text-muted">
                          {new Date(m.date).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
                        </p>
                      </div>
                      <span className="flex items-center gap-2">
                        <span className="text-[12.5px] font-semibold text-ink td-metric">{formatKm(m.km)}</span>
                        {m.flagged ? (
                          <StatusBadge status="suspicious" label="Flagged" />
                        ) : m.verified ? (
                          <StatusBadge status="verified" />
                        ) : (
                          <StatusBadge status="pending" label="Claim" />
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-[12px] bg-surface-tint px-4 py-5 text-center text-[12.5px] text-muted">No readings.</p>
              )}
            </SectionCard>

            <SectionCard title="Record integrity" description="SHA-256 chain over recorded events.">
              <div className="flex items-start gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{
                    color: data.chain.intact ? "var(--success)" : "var(--danger)",
                    background: data.chain.intact ? "var(--success-bg)" : "var(--danger-bg)",
                  }}
                >
                  <Icon name={data.chain.intact ? "Layers" : "ShieldX"} size={16} />
                </span>
                <div>
                  <p
                    className="text-[13.5px] font-semibold"
                    style={{ color: data.chain.intact ? "var(--success)" : "var(--danger)" }}
                  >
                    {data.chain.intact ? "Hash chain intact" : `Chain broken at record ${data.chain.brokenAt}`}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted">{data.chain.records} chained records</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted">
                    A matching hash proves the file has not changed since it was recorded. It does not prove the document is
                    authentic.
                  </p>
                </div>
              </div>
            </SectionCard>
          </div>
        </div>
      )}

      {tab === "documents" && (
        <SectionCard
          title="Shared documents"
          description="Only documents the seller consented to share appear here."
          action={<span className="td-chip">{data.documents.length} shared</span>}
        >
          {data.documents.length ? (
            <div className="divide-y divide-border">
              {data.documents.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--info-bg)] text-primary">
                      <Icon name="FileText" size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-ink">{d.type.toUpperCase()}</p>
                      <p className="truncate text-[12px] text-muted">
                        {d.file_name}
                        {d.verified_at
                          ? ` · verified ${new Date(d.verified_at).toLocaleDateString("en-IN")}`
                          : " · not independently verified"}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={d.status} />
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[12px] border border-dashed border-border bg-surface-tint px-4 py-8 text-center">
              <Icon name="FolderOpen" size={22} className="mx-auto text-muted" />
              <p className="mt-2 text-[12.5px] text-muted">The seller has not shared any documents with buyers.</p>
            </div>
          )}
          <p className="mt-4 text-[11px] leading-relaxed text-muted">
            Missing documents mean unverified coverage — not a clean record. Verified documents cannot be overwritten.
          </p>
        </SectionCard>
      )}

      {tab === "damage" && (
        <SectionCard
          title="Damage & inspection records"
          description="Locations map to 3D hotspots above when present."
          action={<span className="td-chip">{data.damage.length} record{data.damage.length === 1 ? "" : "s"}</span>}
        >
          {data.damage.length ? (
            <div className="space-y-2.5">
              {data.damage.map((d) => (
                <div key={d.id} className="rounded-[12px] border border-border bg-surface-tint p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-[13px] font-semibold capitalize text-ink">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: severityColor[d.severity] ?? "var(--muted)" }}
                      />
                      {d.zone_id.replace(/_/g, " ")} · {d.severity}
                    </span>
                    <StatusBadge status={d.status} />
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{d.description}</p>
                  <p className="mt-1 text-[11px] text-muted">
                    Repair: {d.repair_status.replace(/_/g, " ")}
                    {d.inspection_date ? ` · Inspected ${new Date(d.inspection_date).toLocaleDateString("en-IN")}` : ""}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[12px] border border-dashed border-border bg-surface-tint px-4 py-8 text-center">
              <Icon name="Wrench" size={22} className="mx-auto text-muted" />
              <p className="mt-2 text-[12.5px] text-muted">
                No damage records found in available sources. This does not guarantee the vehicle has no damage.
              </p>
            </div>
          )}
        </SectionCard>
      )}

      {tab === "ai" && (
        <SectionCard
          title="Findings"
          description="Flags are warnings that need investigation — not proof of fraud."
          action={<span className="td-chip">{data.findings.length} open</span>}
        >
          {data.findings.length ? (
            <div className="space-y-2.5">
              {data.findings.map((f) => (
                <div key={f.id} className="rounded-[12px] border border-border bg-surface-tint p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-ink">{f.title}</span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="pill"
                        style={{
                          color: severityColor[f.severity] ?? "var(--muted)",
                          background: `color-mix(in srgb, ${severityColor[f.severity] ?? "var(--muted)"} 14%, transparent)`,
                        }}
                      >
                        {f.severity}
                      </span>
                      <StatusBadge status={f.status} />
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{f.explanation}</p>
                  <p className="mt-1 text-[12px] text-muted">
                    <span className="font-semibold text-ink">Recommended:</span> {f.recommendation}
                  </p>
                  <p className="mt-1.5 font-mono text-[10.5px] text-muted">{f.code}</p>
                </div>
              ))}
            </div>
          ) : (
            <div
              className="flex items-center gap-3 rounded-[12px] border px-4 py-3"
              style={{ background: "var(--success-bg)", borderColor: "color-mix(in srgb, var(--success) 28%, transparent)" }}
            >
              <span style={{ color: "var(--success)" }} className="flex">
                <Icon name="CheckCircle2" size={17} />
              </span>
              <p className="text-[12.5px] font-semibold" style={{ color: "var(--success)" }}>
                No open findings in the records available to the engine.
              </p>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
