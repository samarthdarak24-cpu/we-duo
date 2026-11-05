import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { PrintButton } from "@/components/shared/PrintButton";
import { getSessionUser } from "@/lib/server/session";
import { getReportForActor, getReportData } from "@/lib/server/data";
import { formatINR, formatKm } from "@/lib/format";

export const metadata: Metadata = { title: "Verification report — TrustDrive" };
export const dynamic = "force-dynamic";

const severityTone: Record<string, string> = {
  critical: "bg-red-50 text-red-700 border-red-200",
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-slate-50 text-slate-600 border-slate-200",
};

export default async function PrintReportPage({ params }: { params: { id: string } }) {
  const buyer = getSessionUser("buyer");
  const seller = getSessionUser("seller");
  const admin = getSessionUser("admin");
  const actor =
    [buyer, seller, admin].find((u) => u && getReportForActor(u.id, params.id).ok) ?? null;
  if (!actor) notFound();

  const access = getReportForActor(actor.id, params.id);
  if (!access.ok) notFound();
  const data = getReportData(params.id);
  if (!data) notFound();

  const qrSvg = await QRCode.toString(data.verifyUrl, {
    type: "svg",
    margin: 1,
    width: 118,
    errorCorrectionLevel: "M",
  });

  const v = data.vehicle;
  const trust = data.trust;
  const generated = data.report.generated_at ?? data.report.created_at;
  const scoreColor = trust.trustScore >= 85 ? "#15803d" : trust.trustScore >= 65 ? "#b45309" : "#b91c1c";
  const openFindings = data.findings;

  return (
    <div className="min-h-screen bg-slate-200 py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-3 flex max-w-[860px] items-center justify-between gap-3 px-4 print:hidden">
        <a href="/buyer/reports" className="rounded-pill border border-slate-400 bg-white px-4 py-2.5 text-caption font-semibold text-slate-700 hover:bg-slate-50">
          ← Back to reports
        </a>
        <PrintButton />
      </div>

      <article className="mx-auto max-w-[860px] bg-white px-10 py-9 text-slate-900 shadow-xl print:max-w-none print:px-0 print:py-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-5 border-b-2 border-slate-900 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-slate-900 text-[13px] font-black">TD</span>
              <div>
                <div className="text-[15px] font-black uppercase tracking-[0.22em]">TrustDrive</div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.28em] text-slate-500">Automotive Truth</div>
              </div>
            </div>
            <h1 className="mt-4 text-[26px] font-black leading-tight tracking-tight">Vehicle verification report</h1>
            <p className="mt-1 text-[12px] text-slate-500">
              {data.report.type} · Report {data.report.report_id} · v{data.report.version}
            </p>
          </div>
          <div className="text-right text-[11px] leading-relaxed text-slate-600">
            <div className="mb-1 inline-block rounded border border-slate-300 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">
              {data.report.status}
            </div>
            <div>Generated {new Date(generated).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</div>
            <div>Snapshot</div>
            <div className="max-w-[220px] break-all font-mono text-[9px] text-slate-500">{data.snapshotHash}</div>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-[1.5fr_1fr]">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">Vehicle</div>
            <h2 className="mt-1 text-[22px] font-black leading-tight">
              {v.make} {v.model} {v.variant ?? ""}
            </h2>
            <p className="text-[12px] text-slate-600">
              {v.year} · {v.reg_no} · {v.color ?? "—"} · {formatKm(v.km_claimed)}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11.5px]">
              <Row label="VIN" value={v.vin} mono />
              <Row label="TrustDrive ID" value={v.trustdrive_id} mono />
              <Row label="Fuel" value={v.fuel} />
              <Row label="Transmission" value={v.transmission} />
              <Row label="Ownership" value={`${v.ownership_count} owner${v.ownership_count === 1 ? "" : "s"}`} />
              <Row label="Location" value={v.location} />
              <Row label="Asking price" value={formatINR(v.asking_price)} />
              <Row label="Seller" value={data.seller?.businessName || data.seller?.name || "—"} />
            </div>
          </div>

          <div className="rounded-lg border border-slate-300 p-4 text-center">
            <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">Trust score</div>
            <div className="mt-2 flex items-baseline justify-center gap-1">
              <span className="text-[44px] font-black leading-none" style={{ color: scoreColor }}>
                {trust.trustScore}
              </span>
              <span className="text-[13px] font-semibold text-slate-400">/100</span>
            </div>
            <div className="mt-1 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: scoreColor, background: `${scoreColor}14` }}>
              {trust.bandLabel}
            </div>
            <div className="mt-3 space-y-1.5 text-left text-[11px]">
              <Bar label="Evidence coverage" value={trust.evidenceCoverage} color="#0f172a" />
              <Bar label="Risk score" value={trust.riskScore} color="#b91c1c" />
            </div>
          </div>
        </section>

        <section className="mt-6">
          <h3 className="border-b border-slate-300 pb-1 text-[12px] font-black uppercase tracking-[0.16em]">Findings</h3>
          {openFindings.length ? (
            <ul className="mt-2 divide-y divide-slate-200">
              {openFindings.map((f) => (
                <li key={f.id} className="py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[13px] font-bold">{f.title}</div>
                    <span className={`rounded border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${severityTone[f.severity] ?? severityTone.low}`}>
                      {f.severity} · {f.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-600">{f.explanation}</p>
                  {f.recommendation && <p className="mt-0.5 text-[11px] text-slate-500">Recommendation: {f.recommendation}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12px] text-slate-600">No open findings. All checks in the supported sources are cleared.</p>
          )}
        </section>

        <section className="mt-6">
          <h3 className="border-b border-slate-300 pb-1 text-[12px] font-black uppercase tracking-[0.16em]">Evidence documents</h3>
          <table className="mt-2 w-full text-left text-[11px]">
            <thead>
              <tr className="border-b border-slate-200 text-[9px] uppercase tracking-wider text-slate-500">
                <th className="py-1.5 font-bold">Document</th>
                <th className="py-1.5 font-bold">Type</th>
                <th className="py-1.5 font-bold">Status</th>
                <th className="py-1.5 font-bold">SHA-256</th>
              </tr>
            </thead>
            <tbody>
              {data.documents.map((d) => (
                <tr key={d.id} className="border-b border-slate-100">
                  <td className="py-1.5 font-semibold">{d.file_name}</td>
                  <td className="py-1.5 text-slate-600">{d.type}</td>
                  <td className="py-1.5 text-slate-600">{d.status.replace(/_/g, " ")}</td>
                  <td className="py-1.5 font-mono text-[9.5px] text-slate-500">{d.sha256.slice(0, 24)}…</td>
                </tr>
              ))}
              {!data.documents.length && (
                <tr>
                  <td colSpan={4} className="py-2 text-slate-500">
                    No documents are on file for this vehicle.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-[1fr_150px]">
          <div>
            <h3 className="border-b border-slate-300 pb-1 text-[12px] font-black uppercase tracking-[0.16em]">Audit chain</h3>
            <div className="mt-2 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">Records</span>
                <span className="font-semibold">{data.chain.records}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Integrity</span>
                <span className={data.chain.intact ? "font-bold text-green-700" : "font-bold text-red-700"}>
                  {data.chain.intact ? "Intact — hash chain verified" : `Broken at #${data.chain.brokenAt}`}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-500">Latest hash</span>
                <span className="break-all text-right font-mono text-[9.5px]">{data.chain.latestHash ?? "—"}</span>
              </div>
            </div>
            <p className="mt-3 text-[10.5px] leading-relaxed text-slate-500">
              This report summarises records supplied by the seller and checked against supported sources. It is not a guarantee of
              mechanical condition, nor a substitute for an independent physical inspection.
            </p>
          </div>
          <div className="rounded-lg border border-slate-300 p-2 text-center">
            <div className="[&_svg]:mx-auto [&_svg]:h-[112px] [&_svg]:w-[112px]" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <div className="mt-1 text-[8.5px] font-bold uppercase tracking-[0.16em] text-slate-500">Scan to verify</div>
            <div className="mt-0.5 break-all font-mono text-[7.5px] leading-tight text-slate-400">{data.verifyUrl}</div>
          </div>
        </section>

        <footer className="mt-7 flex items-center justify-between border-t border-slate-300 pt-3 text-[9.5px] text-slate-500">
          <span>TrustDrive · deterministic verification · report {data.report.report_id}</span>
          <span className="font-mono">PDF hash {data.report.pdf_hash?.slice(0, 16) ?? "pending"}…</span>
        </footer>
      </article>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value?: string | number | null; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-dotted border-slate-200 pb-0.5">
      <span className="text-slate-500">{label}</span>
      <span className={`text-right font-semibold text-slate-800 ${mono ? "font-mono text-[10.5px]" : ""}`}>{value ?? "—"}</span>
    </div>
  );
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-slate-500">
        <span>{label}</span>
        <span className="font-semibold text-slate-700">{value}</span>
      </div>
      <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, value)}%`, background: color }} />
      </div>
    </div>
  );
}
