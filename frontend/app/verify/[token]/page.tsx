import type { Metadata } from "next";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TrustRing } from "@/components/ui/TrustRing";
import { getQrToken } from "@/lib/server/db";
import { lookupVehicle } from "@/lib/server/data";
import { verifyQrToken } from "@/lib/server/qr";
import { formatKm } from "@/lib/format";

export const metadata: Metadata = { title: "Verify — TrustDrive" };
export const dynamic = "force-dynamic";

export default function VerifyTokenPage({ params }: { params: { token: string } }) {
  const raw = decodeURIComponent(params.token).trim();
  const payload = verifyQrToken(raw);
  let revoked = false;
  let via = "identifier";
  let result = null;

  if (payload) {
    via = "qr";
    const stored = getQrToken(raw);
    if (!stored || stored.revoked_at) revoked = true;
    else result = lookupVehicle("tdid", payload.vid) ?? lookupVehicle("any", payload.vid);
  } else {
    result = lookupVehicle("any", raw);
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-bg p-4 md:p-8">
      <a href="/" className="mb-6 flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-pill bg-primary text-[#08090A]">
          <Icon name="ShieldCheck" size={22} />
        </span>
        <span className="text-title font-extrabold text-ink">TrustDrive</span>
      </a>

      <div className="w-full max-w-2xl space-y-4">
        <div className="card p-5 text-center">
          <p className="text-caption font-semibold uppercase tracking-wide text-muted">QR verification</p>
          {revoked ? (
            <>
              <div className="mx-auto mt-3 flex h-14 w-14 items-center justify-center rounded-full bg-danger-bg text-danger">
                <Icon name="ShieldX" size={28} />
              </div>
              <h1 className="mt-3 text-card-title font-bold text-ink">This QR code has been revoked</h1>
              <p className="mt-1 text-body text-muted">Ask the seller for the current code on the vehicle.</p>
            </>
          ) : result ? (
            <>
              <div className="mx-auto mt-3 flex h-14 w-14 items-center justify-center rounded-full bg-success-bg text-success">
                <Icon name="BadgeCheck" size={28} />
              </div>
              <h1 className="mt-3 text-card-title font-bold text-ink">Vehicle record found</h1>
              <p className="mt-1 text-body text-muted">
                {result.vehicle.make} {result.vehicle.model} · {result.vehicle.regNo}
              </p>
              <p className="text-caption text-muted">
                Verified via {via === "qr" ? "signed QR token" : "identifier"} · TrustDrive ID {result.vehicle.trustdriveId}
              </p>
            </>
          ) : (
            <>
              <div className="mx-auto mt-3 flex h-14 w-14 items-center justify-center rounded-full bg-warning-bg text-warning">
                <Icon name="HelpCircle" size={28} />
              </div>
              <h1 className="mt-3 text-card-title font-bold text-ink">No TrustDrive record</h1>
              <p className="mt-1 text-body text-muted">
                This identifier is not registered. This is not an error — the vehicle may simply not be on TrustDrive.
              </p>
            </>
          )}
        </div>

        {result && (
          <>
            <section className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                <div>
                  <h2 className="text-card-title font-bold text-ink">
                    {result.vehicle.make} {result.vehicle.model}
                  </h2>
                  <p className="text-caption text-muted">
                    {result.vehicle.year} · {formatKm(result.vehicle.km)} · {result.vehicle.fuel} · {result.vehicle.location}
                  </p>
                  <p className="text-caption text-muted">VIN {result.vehicle.vin || "—"}</p>
                </div>
                <span className={"pill " + (result.chain.intact ? "bg-success-bg text-success" : "bg-danger-bg text-danger")}>
                  <Icon name={result.chain.intact ? "ShieldCheck" : "ShieldAlert"} size={13} />
                  Hash chain {result.chain.intact ? "intact" : "broken"} · {result.chain.records} records
                </span>
              </div>

              <div className="grid grid-cols-1 gap-5 py-4 md:grid-cols-[180px_1fr]">
                <div className="flex flex-col items-center">
                  <TrustRing score={result.trust.trustScore} size={150} />
                  <p className="mt-1 text-caption text-muted">{result.trust.evidenceCoverage}% evidence coverage</p>
                </div>
                <div className="space-y-1.5">
                  {result.insights.map((i) => (
                    <div key={i.label} className="flex items-center justify-between gap-2 rounded-pill border border-border px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-caption font-semibold text-ink">{i.label}</div>
                        <div className="truncate text-[11px] text-muted">{i.detail}</div>
                      </div>
                      <StatusBadge status={i.status} />
                    </div>
                  ))}
                </div>
              </div>

              {result.findings.length > 0 && (
                <div className="border-t border-border pt-3">
                  <h3 className="mb-2 text-body font-semibold text-ink">Open findings</h3>
                  <ul className="space-y-1.5">
                    {result.findings.map((f) => (
                      <li key={f.id} className="rounded-pill bg-warning-bg px-3 py-2 text-caption text-ink">
                        <span className="font-semibold">{f.title}</span> — {f.explanation}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <a href={`/vehicle/${result.vehicle.id}`} className="flex items-center gap-1.5 rounded-pill bg-primary px-4 py-2.5 text-caption font-semibold text-[#08090A] hover:bg-primary-600">
                  Open full report <Icon name="ChevronRight" size={14} />
                </a>
                <a href="/buyer/verification" className="rounded-pill border border-border bg-surface px-4 py-2.5 text-caption font-semibold text-ink hover:bg-bg">
                  Verify another vehicle
                </a>
              </div>
            </section>

            <p className="text-center text-caption text-muted">
              Findings are warnings that need investigation, not proof of fraud. “No record found” in supported sources is not a
              guarantee that no incident occurred.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
