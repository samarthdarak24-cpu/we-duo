"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SectionCard } from "@/components/shared/SectionCard";
import { InlineAlert } from "@/components/shared/InlineAlert";

export interface ReportRow {
  id: string;
  reportId: string;
  type: string;
  status: string;
  vehicleId: string;
  vehicle: string;
  regNo: string;
  createdAt: string;
  generatedAt: string | null;
  downloadUrl: string | null;
}

export interface ReportVehicleOption {
  id: string;
  make: string;
  model: string;
  regNo: string;
}

const reportTypes = [
  "Vehicle verification",
  "Document verification",
  "Vehicle condition",
  "AI risk analysis",
  "Listing performance",
  "Buyer inquiry",
  "Vehicle history",
];

const statusTone: Record<string, string> = {
  ready: "verified",
  processing: "pending",
  queued: "pending",
  failed: "suspicious",
};

export function ReportActions({ vehicles, reports }: { vehicles: ReportVehicleOption[]; reports: ReportRow[] }) {
  const router = useRouter();
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [type, setType] = useState(reportTypes[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function generate(forVehicle = vehicleId, forType = type) {
    if (!forVehicle) {
      setError("Add a vehicle before generating a report.");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    const res = await fetch(`/api/v1/reports/vehicle/${forVehicle}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: forType }),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: { reportId: string }; error?: { message?: string } };
    setBusy(false);
    if (!res.ok) {
      setError(json.error?.message ?? "Could not generate the report.");
      return;
    }
    setInfo(`Report ${json.data?.reportId ?? ""} generated. It is ready to download.`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <SectionCard
        title="Generate a report"
        description="Choose a vehicle and the report type. The PDF summarises records on file — it is not a guarantee of condition."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="block">
            <span className="td-label">Vehicle</span>
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="td-input td-select">
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model} · {v.regNo}
                </option>
              ))}
              {!vehicles.length && <option value="">No vehicles</option>}
            </select>
          </label>
          <label className="block">
            <span className="td-label">Report type</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className="td-input td-select">
              {reportTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => generate()}
            disabled={busy || !vehicles.length}
            className="td-btn td-btn-primary self-end"
          >
            <Icon name={busy ? "Loader2" : "FileDown"} size={15} className={busy ? "animate-spin" : ""} />
            {busy ? "Generating…" : "Generate PDF"}
          </button>
        </div>

        {(error || info) && (
          <div className="mt-4 space-y-2" aria-live="polite">
            {error && <InlineAlert tone="danger" title="Could not generate the report" detail={error} />}
            {info && <InlineAlert tone="success" title="Report ready" detail={info} />}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Your reports" description={`${reports.length} generated`} flush>
        {reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-tint text-primary">
              <Icon name="FileText" size={22} />
            </span>
            <p className="text-[14px] font-semibold text-ink">No reports yet</p>
            <p className="max-w-sm text-[12.5px] leading-relaxed text-muted">Generate your first PDF above. Reports appear here with a stable ID you can share.</p>
          </div>
        ) : (
          <div className="td-scroll overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 font-semibold">Report</th>
                  <th className="px-4 py-3 font-semibold">Vehicle</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Generated</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="border-b border-border/70 align-middle transition-colors last:border-0 hover:bg-surface-tint/60">
                    <td className="px-5 py-3.5 font-mono text-[12px] font-semibold text-ink">{r.reportId}</td>
                    <td className="px-4 py-3.5">
                      <div className="text-[13px] font-semibold text-ink">{r.vehicle}</div>
                      <div className="text-[11.5px] text-muted">{r.regNo}</div>
                    </td>
                    <td className="px-4 py-3.5 text-[12.5px] text-muted">{r.type}</td>
                    <td className="px-4 py-3.5 text-[12px] text-muted">
                      {new Date(r.generatedAt ?? r.createdAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={statusTone[r.status] ?? "pending"} label={r.status} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <a href={`/print/report/${r.id}`} target="_blank" rel="noreferrer" className="td-btn td-btn-secondary td-btn-sm">
                          <Icon name="FileText" size={13} /> Open
                        </a>
                        {r.downloadUrl ? (
                          <a href={r.downloadUrl} className="td-btn td-btn-ghost td-btn-sm">
                            <Icon name="Download" size={13} /> PDF
                          </a>
                        ) : (
                          <span className="self-center text-[11px] text-muted">Preparing…</span>
                        )}
                        <button onClick={() => generate(r.vehicleId, r.type)} disabled={busy} className="td-btn td-btn-ghost td-btn-sm">
                          <Icon name="RefreshCw" size={13} /> Regenerate
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
    </div>
  );
}
