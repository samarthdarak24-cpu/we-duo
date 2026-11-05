"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TrustRing } from "@/components/ui/TrustRing";
import { SectionCard } from "@/components/shared/SectionCard";
import { InlineAlert } from "@/components/shared/InlineAlert";
import { formatKm } from "@/lib/format";

type LookupType = "reg" | "vin" | "tdid" | "qr";

interface LookupResult {
  via?: string;
  vehicle: {
    id: string;
    make: string;
    model: string;
    regNo: string;
    vin: string;
    year: number;
    trustdriveId: string;
    location: string;
    km: number;
    fuel: string;
    transmission: string;
  };
  trust: { trustScore: number; riskScore: number; band: string; bandLabel: string; evidenceCoverage: number };
  checks: { key: string; label: string; status: string; note: string; source: string }[];
  insights: { label: string; detail: string; status: string }[];
  chain: { records: number; intact: boolean; brokenAt?: number | null };
  theft: { status: string; source: string } | null;
  findings: { id: string; code: string; severity: string; title: string; explanation: string; recommendation: string; status: string }[];
  qr?: { token: string; createdAt: string }[];
}

const types: { value: LookupType; label: string; placeholder: string }[] = [
  { value: "reg", label: "Registration", placeholder: "MH01AB1234" },
  { value: "vin", label: "VIN", placeholder: "17-character chassis number" },
  { value: "tdid", label: "TrustDrive ID", placeholder: "TD-XXXXXX" },
  { value: "qr", label: "QR token", placeholder: "Paste the code from the vehicle QR" },
];

function extractQrToken(raw: string): string {
  const value = raw.trim();
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    const at = parts.indexOf("verify");
    if (at >= 0 && parts[at + 1]) return decodeURIComponent(parts[at + 1]);
    return url.searchParams.get("token") ?? url.searchParams.get("qr") ?? value;
  } catch {
    return value.split("?")[0];
  }
}

export function VerificationLookup({ initial = "", initialType = "reg" }: { initial?: string; initialType?: LookupType }) {
  const [type, setType] = useState<LookupType>(initialType);
  const [q, setQ] = useState(initial);
  const [data, setData] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<{ detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> } | null>(null);
  const scanTimer = useRef<number | null>(null);

  const lookup = useCallback(async (query: string, kind: LookupType) => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      // QR tokens are signed and verified at /verify/:token; other identifiers use the lookup API.
      const res =
        kind === "qr"
          ? await fetch(`/api/v1/verify/${encodeURIComponent(query.trim())}`)
          : await fetch("/api/v1/verification/lookup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: kind, value: query.trim() }),
            });
      const json = (await res.json().catch(() => ({}))) as { data?: LookupResult; error?: { message?: string; code?: string } };
      if (res.ok && json.data) {
        setData(json.data);
      } else {
        setData(null);
        setError(
          json.error?.code === "QR_REVOKED"
            ? json.error.message ?? "This QR code has been revoked."
            : json.error?.message ??
              "No TrustDrive record for this identifier. This is not an error — the vehicle may not be registered."
        );
      }
    } catch {
      setError("Lookup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initial) lookup(initial, initialType);
  }, [initial, initialType, lookup]);

  const stopScan = useCallback(() => {
    if (scanTimer.current) {
      window.clearTimeout(scanTimer.current);
      scanTimer.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    detectorRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setScanning(false);
  }, []);

  useEffect(() => stopScan, [stopScan]);
  useEffect(() => {
    if (type !== "qr") stopScan();
  }, [type, stopScan]);

  async function startScan() {
    setScanError(null);
    setType("qr");
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setScanError("This browser cannot access a camera. Paste the QR token or open the QR link instead.");
      setScanning(true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setScanning(true);
      // Wait for the video element to mount before attaching.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
      });
      const Detector = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
      if (!Detector) {
        setScanError("Live QR decoding is not supported in this browser. Frame the code and type the token, or use your phone camera to open the QR link.");
        return;
      }
      detectorRef.current = new Detector({ formats: ["qr_code"] });
      const tick = async () => {
        if (!streamRef.current || !detectorRef.current) return;
        const video = videoRef.current;
        if (video && video.readyState >= 2) {
          try {
            const codes = await detectorRef.current.detect(video);
            const raw = codes[0]?.rawValue;
            if (raw) {
              const token = extractQrToken(raw);
              stopScan();
              setQ(token);
              lookup(token, "qr");
              return;
            }
          } catch {
            // Transient detector failures are expected while the frame settles.
          }
        }
        scanTimer.current = window.setTimeout(tick, 350);
      };
      tick();
    } catch {
      setScanning(true);
      setScanError("Camera permission was denied or no camera is available. Paste the QR token instead.");
    }
  }

  return (
    <div className="space-y-5">
      <SectionCard
        title="Verify a vehicle"
        description="Check registration, VIN or a signed QR token against the evidence chain."
        action={
          <button
            type="button"
            onClick={scanning ? stopScan : startScan}
            className="td-btn td-btn-secondary td-btn-sm"
          >
            <Icon name="QrCode" size={14} /> {scanning ? "Stop camera" : "Scan QR"}
          </button>
        }
      >
        {scanning && (
          <div className="mb-3 overflow-hidden rounded-[12px] border border-primary/30 bg-bg">
            <div className="relative aspect-[16/10] w-full">
              <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-40 w-40 rounded-xl border-2 border-primary/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]">
                  <span className="absolute left-1/2 top-1/2 h-px w-36 -translate-x-1/2 -translate-y-1/2 bg-primary/70" />
                  <span className="absolute left-1/2 top-1/2 h-36 w-px -translate-x-1/2 -translate-y-1/2 bg-primary/70" />
                </div>
              </div>
              <div className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-primary">
                {scanError ? "Manual fallback" : "Point at the TrustDrive QR"}
              </div>
            </div>
            {scanError && <p className="border-t border-border px-3 py-2 text-[11.5px] text-warning">{scanError}</p>}
          </div>
        )}

        <div className="mb-3 flex flex-wrap gap-1.5">
          {types.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={
                "h-8 rounded-full border px-3 text-[11.5px] font-semibold transition " +
                (type === t.value
                  ? "border-primary/40 bg-info-bg text-primary"
                  : "border-transparent bg-surface-tint text-muted hover:text-ink")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            lookup(q, type);
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <div className="relative flex-1">
            <Icon name="Search" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={types.find((t) => t.value === type)?.placeholder}
              aria-label="Vehicle identifier"
              className="td-input pl-10"
            />
          </div>
          <button type="submit" disabled={loading} className="td-btn td-btn-primary">
            {loading ? (
              <>
                <Icon name="Loader2" size={14} className="animate-spin" /> Checking…
              </>
            ) : (
              <>
                <Icon name="ScanSearch" size={15} /> Verify
              </>
            )}
          </button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
          <span className="font-semibold">Try:</span>
          {[
            { label: "MH01AB1234", type: "reg" as LookupType },
            { label: "v-bmw", type: "tdid" as LookupType },
            { label: "v-seller", type: "tdid" as LookupType },
          ].map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => {
                setType(s.type);
                setQ(s.label);
                lookup(s.label, s.type);
              }}
              className="rounded-full border border-border bg-surface-tint px-2.5 py-1 font-semibold text-primary transition hover:border-primary/40"
            >
              {s.label}
            </button>
          ))}
        </div>
      </SectionCard>

      {error && <InlineAlert tone="warning" title="No record found" detail={error} />}

      {data && (
        <section className="card animate-fade-up p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div>
              <h2 className="td-h2">
                {data.vehicle.make} {data.vehicle.model}
              </h2>
              <p className="mt-0.5 text-[12px] text-muted">
                {data.vehicle.regNo} · {data.vehicle.year} · {formatKm(data.vehicle.km)} · {data.vehicle.location}
              </p>
              <p className="text-[11.5px] text-muted">
                VIN {data.vehicle.vin || "—"} · TrustDrive ID {data.vehicle.trustdriveId}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="pill"
                style={{
                  color: data.chain.intact ? "var(--success)" : "var(--danger)",
                  background: data.chain.intact ? "var(--success-bg)" : "var(--danger-bg)",
                }}
              >
                <Icon name={data.chain.intact ? "ShieldCheck" : "ShieldAlert"} size={13} />
                Hash chain {data.chain.intact ? "intact" : "broken"} · {data.chain.records} records
              </span>
              <a href={`/vehicle/${data.vehicle.id}`} className="td-btn td-btn-secondary td-btn-sm">
                Open full report <Icon name="ChevronRight" size={12} />
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 py-4 md:grid-cols-[200px_1fr]">
            <div className="flex flex-col items-center">
              <TrustRing score={data.trust.trustScore} size={150} />
              <p className="mt-2 text-[11.5px] text-muted">Evidence coverage {data.trust.evidenceCoverage}%</p>
            </div>
            <div className="space-y-2">
              {data.insights.map((i) => (
                <div key={i.label} className="flex items-start justify-between gap-3 rounded-[11px] border border-border bg-surface-tint px-4 py-2.5">
                  <div>
                    <div className="text-[13px] font-semibold text-ink">{i.label}</div>
                    <div className="text-[11.5px] text-muted">{i.detail}</div>
                  </div>
                  <StatusBadge status={i.status} />
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <h3 className="td-h3 mb-2">Verification checks</h3>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {data.checks.map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-2 rounded-[10px] bg-surface-tint px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-semibold text-ink">{c.label}</div>
                    <div className="truncate text-[11px] text-muted">{c.note}</div>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
              ))}
            </div>
          </div>

          {data.findings.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <h3 className="td-h3 mb-2">Open findings ({data.findings.length})</h3>
              <ul className="space-y-2">
                {data.findings.map((f) => (
                  <li key={f.id} className="rounded-[10px] border border-warning/30 bg-warning-bg px-4 py-2 text-[12px] text-ink">
                    <span className="font-semibold">{f.title}</span> — {f.explanation}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4 text-[11.5px]">
            <span className="text-muted">Legend:</span>
            {["verified", "pending", "suspicious", "unverified", "unavailable", "needs_correction"].map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            No theft or accident record in supported sources does not guarantee the vehicle has none. Findings are warnings that need
            investigation — they are not proof of fraud.
          </p>
        </section>
      )}
    </div>
  );
}
