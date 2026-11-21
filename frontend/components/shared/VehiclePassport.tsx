import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SectionCard } from "@/components/shared/SectionCard";
import type {
  MileageAnomaly,
  PassportRecordStatus,
  PassportTimelineEntry,
} from "@/lib/server/category-service";

/**
 * Read-only Vehicle History Passport projection.
 *
 * Every value comes from the SQLite evidence set through `vehiclePassport()`.
 * Nothing here is recomputed in the browser, and no status is inferred from a
 * missing record. Missing evidence is shown as unverified coverage.
 */
export interface VehiclePassportView {
  trust: { score: number; bandLabel: string; evidenceCoverage: number };
  timeline: PassportTimelineEntry[];
  mileageAnalysis: {
    label: string;
    unit: string;
    method: string;
    version: string;
    consistency: "attention" | "no_anomaly_detected" | "insufficient_data";
    readings: {
      id: string;
      date: string;
      km: number;
      source: string;
      verified: boolean;
      flagged: boolean;
      sellerClaim: boolean;
      deltaFromPreviousKm: number | null;
      direction: string;
    }[];
    anomalies: MileageAnomaly[];
    note: string;
    rules: { dailyMaxKm: number; rollbackToleranceKm: number };
  };
  assessment: {
    status: PassportRecordStatus;
    summary: string;
    method: string;
    version: string;
    coverage: {
      documents: number;
      verifiedDocuments: number;
      pendingDocuments: number;
      requiredDocuments: number;
      verifiedRequiredDocuments: number;
      mileageReadings: number;
      damageRecords: number;
    };
    positives: string[];
    riskIndicators: {
      code: string;
      severity: string;
      title: string;
      explanation: string;
      recommendation: string;
      status: string;
      evidenceRefs: string[];
    }[];
    missingInformation: { code: string; label: string; detail: string; status: PassportRecordStatus }[];
    limitations: string[];
    evidenceRefs: string[];
  };
}

function statusKey(status: PassportRecordStatus) {
  return status.toLowerCase();
}

function dateLabel(value: string | null) {
  if (!value) return "Date not recorded";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function num(value: number) {
  return value.toLocaleString("en-IN");
}

function AssessmentList({
  title,
  tone,
  items,
  empty,
}: {
  title: string;
  tone: "success" | "danger" | "warning" | "muted";
  items: string[];
  empty: string;
}) {
  const palette = {
    success: { color: "var(--success)", bg: "var(--success-bg)", icon: "CheckCircle2" },
    danger: { color: "var(--danger)", bg: "var(--danger-bg)", icon: "AlertTriangle" },
    warning: { color: "var(--warning)", bg: "var(--warning-bg)", icon: "HelpCircle" },
    muted: { color: "var(--muted)", bg: "var(--surface-tint)", icon: "Info" },
  }[tone];
  return (
    <div className="rounded-[12px] border border-border bg-surface-tint p-4">
      <div className="flex items-center gap-2 text-[12px] font-semibold text-ink">
        <span
          className="flex h-5 w-5 items-center justify-center rounded-full"
          style={{ background: palette.bg, color: palette.color }}
        >
          <Icon name={palette.icon} size={12} />
        </span>
        {title}
      </div>
      {items.length ? (
        <ul className="mt-2 space-y-1.5">
          {items.map((item, index) => (
            <li
              key={`${index}:${item}`}
              className="flex items-start gap-2 text-[11.5px] leading-relaxed text-muted"
            >
              <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full" style={{ background: palette.color }} />
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{empty}</p>
      )}
    </div>
  );
}

export function VehiclePassport({ data }: { data: VehiclePassportView }) {
  const { assessment, mileageAnalysis, timeline } = data;
  const anomalies = mileageAnalysis.anomalies;

  return (
    <div className="space-y-5">
      <SectionCard
        id="passport"
        title="Vehicle History Passport"
        description="A chronological, evidence-backed projection of every stored record. Missing records are unverified coverage — not proof of a clean history."
        action={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={statusKey(assessment.status)} label={assessment.status.replace(/_/g, " ")} />
            <span className="td-chip font-mono">{assessment.version}</span>
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Trust score", `${data.trust.score}/100`, data.trust.bandLabel],
            ["Evidence coverage", `${data.trust.evidenceCoverage}%`, "Verified document weight"],
            ["Documents", `${assessment.coverage.verifiedDocuments}/${assessment.coverage.documents}`, "verified / stored"],
            ["Required docs", `${assessment.coverage.verifiedRequiredDocuments}/${assessment.coverage.requiredDocuments}`, "verified / required"],
            ["Distance readings", String(assessment.coverage.mileageReadings), mileageAnalysis.label],
            ["Damage records", String(assessment.coverage.damageRecords), "stored disclosure"],
          ].map(([label, value, note]) => (
            <div key={label} className="rounded-[11px] border border-border bg-surface-tint px-3 py-2.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</div>
              <div className="mt-0.5 text-[17px] font-bold leading-tight text-ink td-metric">{value}</div>
              <div className="mt-0.5 truncate text-[10.5px] text-muted" title={note}>{note}</div>
            </div>
          ))}
        </div>

        <p className="mt-3 rounded-[10px] border border-border bg-surface-tint px-4 py-3 text-[12.5px] leading-relaxed text-muted">
          {assessment.summary}
        </p>

        <div className="mt-3 grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          <AssessmentList
            title="Positive indicators"
            tone="success"
            items={assessment.positives}
            empty="No positive indicator can be claimed from the records on file."
          />
          <AssessmentList
            title="Risk indicators"
            tone="danger"
            items={assessment.riskIndicators.map(
              (r) => `${r.title} (${r.severity}) — ${r.recommendation}`
            )}
            empty="No open deterministic finding was raised from the available records."
          />
          <AssessmentList
            title="Missing information"
            tone="warning"
            items={assessment.missingInformation.map((m) => `${m.label}: ${m.detail}`)}
            empty="No required category document is missing a verified record."
          />
          <AssessmentList
            title="Assessment limitations"
            tone="muted"
            items={assessment.limitations}
            empty="No limitation was recorded."
          />
        </div>

        <p className="mt-3 font-mono text-[10.5px] text-muted">
          Method: {assessment.method} · rules {assessment.version} · {assessment.evidenceRefs.length} evidence reference(s)
        </p>
      </SectionCard>

      <SectionCard
        title={`${mileageAnalysis.label} analysis`}
        description="Chronological delta rules. A decreasing reading is a warning that requires investigation, not proof of tampering."
        action={
          <StatusBadge
            status={
              mileageAnalysis.consistency === "attention"
                ? "needs_review"
                : mileageAnalysis.consistency === "no_anomaly_detected"
                  ? "verified"
                  : "unverified"
            }
            label={mileageAnalysis.consistency.replace(/_/g, " ")}
          />
        }
      >
        {anomalies.length ? (
          <div className="space-y-2.5">
            {anomalies.map((anomaly) => (
              <article
                key={anomaly.id}
                className="rounded-[12px] border border-border bg-surface-tint p-4"
                style={{ borderLeft: `3px solid ${anomaly.severity === "medium" ? "var(--warning)" : "var(--danger)"}` }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-ink">
                      {anomaly.type === "ROLLBACK" ? "Reading decreased" : "Implausible distance jump"}
                    </span>
                    <StatusBadge status={anomaly.severity === "medium" ? "pending" : "suspicious"} label={anomaly.severity} />
                    <StatusBadge status="needs_review" />
                  </div>
                  <span className="font-mono text-[10.5px] text-muted">{anomaly.rulesVersion}</span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
                  <span className="rounded-[8px] border border-border bg-surface px-2.5 py-1.5">
                    <span className="text-muted">{dateLabel(anomaly.previous.date)} · </span>
                    <span className="font-semibold text-ink">{num(anomaly.previous.km)} {mileageAnalysis.unit}</span>
                    <span className="ml-1 text-[10px] text-muted">({anomaly.previous.source})</span>
                  </span>
                  <Icon name="ArrowRight" size={13} className="text-muted" />
                  <span className="rounded-[8px] border border-border bg-surface px-2.5 py-1.5">
                    <span className="text-muted">{dateLabel(anomaly.current.date)} · </span>
                    <span className="font-semibold text-ink">{num(anomaly.current.km)} {mileageAnalysis.unit}</span>
                    <span className="ml-1 text-[10px] text-muted">({anomaly.current.source})</span>
                  </span>
                  <span className="td-chip font-semibold text-danger">
                    {anomaly.differenceKm > 0 ? "+" : ""}
                    {num(anomaly.differenceKm)} {mileageAnalysis.unit}
                  </span>
                  <span className="text-[11px] text-muted">over {anomaly.daysBetween} day(s)</span>
                </div>

                <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{anomaly.explanation}</p>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink">
                  <span className="font-semibold">Recommended action: </span>
                  {anomaly.recommendedAction}
                </p>
                <p className="mt-1 font-mono text-[10px] text-muted">
                  {anomaly.method} · {anomaly.evidenceRefs.length
                    ? `${anomaly.evidenceRefs.length} supporting record(s)`
                    : "no supporting document linked"}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="rounded-[10px] border border-border bg-surface-tint px-4 py-3 text-[12.5px] leading-relaxed text-muted">
            {mileageAnalysis.consistency === "insufficient_data"
              ? "Fewer than two readings are stored, so no consistency conclusion can be drawn."
              : "No decrease or implausible jump was detected between the stored readings. This does not prove the distance is accurate."}
          </p>
        )}
        <p className="mt-2 text-[10.5px] text-muted">
          Method: {mileageAnalysis.method} · rules {mileageAnalysis.version} · ceiling {mileageAnalysis.rules.dailyMaxKm} {mileageAnalysis.unit}/day · rollback tolerance {mileageAnalysis.rules.rollbackToleranceKm} {mileageAnalysis.unit}
        </p>
      </SectionCard>

      <SectionCard
        title="Evidence timeline"
        description="Documents, history events, readings, damage records, findings and verification runs in date order."
        action={<span className="td-chip">{timeline.length} entries</span>}
      >
        {timeline.length ? (
          <ol className="relative ml-3 border-l border-border">
            {timeline.map((entry) => (
              <li key={entry.id} className="relative pb-4 pl-5 last:pb-0">
                <span
                  className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-surface"
                  style={{
                    background:
                      entry.status === "VERIFIED"
                        ? "var(--success)"
                        : entry.status === "PENDING"
                          ? "var(--warning)"
                          : entry.status === "SUSPICIOUS" || entry.status === "NEEDS_REVIEW"
                            ? "var(--danger)"
                            : "var(--muted)",
                  }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12.5px] font-semibold text-ink">{entry.title}</span>
                  <StatusBadge status={statusKey(entry.status)} label={entry.status.replace(/_/g, " ")} />
                  <span className="td-chip">{entry.source.replace(/_/g, " ")}</span>
                  {entry.severity && <span className="td-chip">severity {entry.severity}</span>}
                  {entry.mileageKm != null && <span className="td-chip">{num(entry.mileageKm)} {mileageAnalysis.unit}</span>}
                </div>
                <div className="mt-0.5 text-[11px] text-muted">{dateLabel(entry.date)}</div>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{entry.description}</p>
                {entry.evidenceRefs.length > 0 && (
                  <p className="mt-0.5 font-mono text-[10px] text-muted">
                    Evidence: {entry.evidenceRefs.join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-[10px] border border-border bg-surface-tint px-4 py-3 text-[12.5px] text-muted">
            No timeline records are stored. This is unverified coverage, not a clean history.
          </p>
        )}
      </SectionCard>
    </div>
  );
}
