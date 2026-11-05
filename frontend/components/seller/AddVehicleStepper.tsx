"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SectionCard } from "@/components/shared/SectionCard";
import { InlineAlert } from "@/components/shared/InlineAlert";

const steps = ["Basic info", "Photos", "Documents", "History", "Verification", "Review & publish"];

const stepDescription: Record<number, string> = {
  0: "Start with the identifiers on the registration certificate. Make, model, registration and year are required before a draft is created.",
  1: "Add front, rear, left, right, interior, dashboard and odometer photos. JPEG, PNG or WebP, 10 MB each.",
  2: "Upload only documents you are allowed to share. Buyer visibility is consent-gated and recorded.",
  3: "Add prior mileage readings, service, repair, ownership or inspection events. Everything is submitted as Pending until verified.",
  4: "Run the deterministic pipeline: document completeness, identifier checks, duplicate detection and mileage analysis.",
  5: "Review the draft and publish. Blockers must be cleared; warnings stay labelled on the public report.",
};

interface FormState {
  make: string;
  model: string;
  variant: string;
  year: string;
  regNo: string;
  vin: string;
  fuel: string;
  transmission: string;
  category: string;
  color: string;
  ownershipCount: string;
  location: string;
  km: string;
  price: string;
  description: string;
  condition: string;
}

const empty: FormState = {
  make: "",
  model: "",
  variant: "",
  year: String(new Date().getFullYear()),
  regNo: "",
  vin: "",
  fuel: "Petrol",
  transmission: "Automatic",
  category: "Sedan",
  color: "",
  ownershipCount: "1",
  location: "",
  km: "",
  price: "",
  description: "",
  condition: "Good",
};

const docTypes = [
  { value: "rc", label: "Registration Certificate (RC)" },
  { value: "insurance", label: "Insurance Policy" },
  { value: "puc", label: "PUC Certificate" },
  { value: "service", label: "Service Invoice" },
  { value: "inspection", label: "Inspection Report" },
  { value: "ownership", label: "Ownership Document" },
  { value: "repair", label: "Repair Invoice" },
  { value: "accident_claim", label: "Accident Claim" },
];

interface Gate {
  blockers: string[];
  warnings: string[];
  canPublish: boolean;
}

export function AddVehicleStepper() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(empty);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [listingId, setListingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [gate, setGate] = useState<Gate | null>(null);
  const [checks, setChecks] = useState<{ label: string; status: string; note: string }[]>([]);
  const [historyRows, setHistoryRows] = useState<{ date: string; km: string; category: string; title: string }[]>([]);
  const [docType, setDocType] = useState("rc");
  const [docConsent, setDocConsent] = useState(true);
  const photoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const canSaveBasic = useMemo(
    () => !!(form.make && form.model && form.regNo && form.year),
    [form]
  );

  async function saveBasic() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/seller/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, ownershipCount: Number(form.ownershipCount) }),
      });
      const json = (await res.json()) as { data?: { id: string; listingId: string }; error?: { message: string } };
      if (!res.ok || !json.data) {
        setError(json.error?.message ?? "Could not save the draft.");
        return false;
      }
      setVehicleId(json.data.id);
      setListingId(json.data.listingId);
      setInfo("Draft saved. You can leave and come back — the vehicle is in My Vehicles.");
      return true;
    } catch {
      setError("Network error — please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    setError(null);
    if (step === 0) {
      if (vehicleId) {
        // Draft already exists — patch the basic fields before moving on.
        const res = await fetch(`/api/v1/seller/vehicles/${vehicleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, year: Number(form.year), km_claimed: Number(form.km), asking_price: Number(form.price), ownership_count: Number(form.ownershipCount) }),
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          setError(json.error?.message ?? "Could not update the draft.");
          return;
        }
        setStep(1);
        return;
      }
      if (!canSaveBasic) {
        setError("Make, model, registration and year are required.");
        return;
      }
      const ok = await saveBasic();
      if (ok) setStep(1);
      return;
    }
    setStep((s) => Math.min(steps.length - 1, s + 1));
  }

  async function uploadPhotos() {
    if (!vehicleId || !photoRef.current?.files?.length) {
      setError("Choose at least one photo.");
      return;
    }
    setBusy(true);
    setError(null);
    const fd = new FormData();
    Array.from(photoRef.current.files).forEach((f) => fd.append("files", f));
    const res = await fetch(`/api/v1/vehicles/${vehicleId}/photos`, { method: "POST", body: fd });
    const json = (await res.json().catch(() => ({}))) as { data?: { uploaded: number }; error?: { message: string } };
    setBusy(false);
    if (!res.ok) {
      setError(json.error?.message ?? "Photo upload failed.");
      return;
    }
    setInfo(`${json.data?.uploaded ?? 0} photo(s) added.`);
  }

  async function uploadDocument() {
    if (!vehicleId || !docRef.current?.files?.[0]) {
      setError("Choose a document file.");
      return;
    }
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("type", docType);
    fd.append("consent", String(docConsent));
    fd.append("file", docRef.current.files[0]);
    const res = await fetch(`/api/v1/vehicles/${vehicleId}/documents`, { method: "POST", body: fd });
    const json = (await res.json().catch(() => ({}))) as { error?: { message: string } };
    setBusy(false);
    if (!res.ok) {
      setError(json.error?.message ?? "Document upload failed.");
      return;
    }
    setInfo("Document uploaded and queued for verification.");
  }

  async function addHistoryRow() {
    if (!vehicleId) return;
    const row = { date: new Date().toISOString().slice(0, 10), km: form.km || "0", category: "service", title: "Seller-submitted record" };
    setBusy(true);
    const res = await fetch(`/api/v1/vehicles/${vehicleId}/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...row, description: "Added during vehicle onboarding." }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Could not add the history row.");
      return;
    }
    setHistoryRows((rows) => [...rows, row]);
  }

  async function runVerification() {
    if (!vehicleId) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/v1/vehicles/${vehicleId}/verify`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as {
      data?: { runId: string; checks: { label: string; status: string; note: string }[] };
      error?: { message: string };
    };
    setBusy(false);
    if (!res.ok || !json.data) {
      setError(json.error?.message ?? "Verification could not start.");
      return;
    }
    setChecks(json.data.checks);
    setInfo(`Verification run ${json.data.runId} complete.`);
  }

  async function loadGate() {
    if (!vehicleId) return;
    const res = await fetch("/api/v1/seller/listings?pageSize=100");
    const json = (await res.json().catch(() => ({}))) as {
      data?: { items: { vehicle: { id: string }; gate: Gate }[] };
    };
    const row = json.data?.items.find((r) => r.vehicle.id === vehicleId);
    if (row) setGate(row.gate);
  }

  async function publish() {
    if (!vehicleId) return;
    await loadGate();
    if (!listingId) {
      const created = await fetch("/api/v1/seller/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId, description: form.description, price: Number(form.price) }),
      });
      const json = (await created.json().catch(() => ({}))) as { data?: { id: string }; error?: { message: string } };
      if (!created.ok || !json.data) {
        setError(json.error?.message ?? "Could not create the listing.");
        return;
      }
      setListingId(json.data.id);
    }
    const id = listingId;
    if (!id) {
      // Re-read from the server to get the id we just created.
      const res = await fetch(`/api/v1/seller/listings?pageSize=100`);
      const json = (await res.json().catch(() => ({}))) as { data?: { items: { vehicle: { id: string }; listing: { id: string } | null }[] } };
      const row = json.data?.items.find((r) => r.vehicle.id === vehicleId);
      if (!row?.listing) {
        setError("Create the listing draft first.");
        return;
      }
      setListingId(row.listing.id);
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/v1/seller/listings/${id}/publish`, { method: "POST" });
    const json = (await res.json().catch(() => ({}))) as { error?: { message: string; details?: Gate } };
    setBusy(false);
    if (!res.ok) {
      setError(json.error?.message ?? "Publishing is blocked.");
      if (json.error?.details) setGate(json.error.details);
      return;
    }
    router.push("/seller/listings");
  }

  const field = (label: string, key: keyof FormState, type = "text", placeholder = "") => (
    <label className="block">
      <span className="td-label">{label}</span>
      <input
        type={type}
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => set(key, e.target.value)}
        className="td-input"
      />
    </label>
  );

  const select = (label: string, key: keyof FormState, options: string[]) => (
    <label className="block">
      <span className="td-label">{label}</span>
      <select value={form[key]} onChange={(e) => set(key, e.target.value)} className="td-input td-select">
        {options.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="td-page">
      <ol className="td-scroll flex items-center gap-1 overflow-x-auto rounded-[14px] border border-border bg-surface p-2">
        {steps.map((s, i) => {
          const clickable = i <= step || Boolean(vehicleId);
          return (
            <li key={s} className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => (clickable ? setStep(i) : null)}
                disabled={!clickable}
                aria-current={i === step ? "step" : undefined}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-[8px] px-2.5 text-[12px] font-semibold transition",
                  i === step
                    ? "bg-primary text-[var(--on-primary)]"
                    : i < step
                      ? "text-ink hover:bg-surface-tint"
                      : "text-muted hover:bg-surface-tint",
                  !clickable && "cursor-default opacity-75"
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[10.5px] font-bold",
                    i === step ? "bg-black/15 text-[var(--on-primary)]" : i < step ? "bg-success-bg text-success" : "bg-surface-tint text-muted"
                  )}
                >
                  {i < step ? <Icon name="Check" size={11} strokeWidth={3} /> : i + 1}
                </span>
                {s}
              </button>
              {i < steps.length - 1 && <span className="h-px w-3 bg-border" />}
            </li>
          );
        })}
      </ol>

      <SectionCard
        title={steps[step]}
        description={stepDescription[step]}
        action={<span className="td-chip">Step {step + 1} of {steps.length}</span>}
      >
        <div className="space-y-5">
          {step === 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {field("Registration number", "regNo", "text", "MH01AB1234")}
              {field("VIN (17 chars)", "vin", "text", "WBA5R1C50KAK12345")}
              {field("Make", "make", "text", "BMW")}
              {field("Model", "model", "text", "3 Series")}
              {field("Variant", "variant", "text", "330i")}
              {field("Year", "year", "number")}
              {select("Fuel", "fuel", ["Petrol", "Diesel", "Hybrid", "Electric", "CNG"])}
              {select("Transmission", "transmission", ["Automatic", "Manual"])}
              {select("Category", "category", ["Sedan", "SUV", "Hatchback", "MUV", "Coupe"])}
              {field("Colour", "color", "text", "Silver")}
              {field("Ownership count", "ownershipCount", "number")}
              {field("Location", "location", "text", "Mumbai")}
              {field("Current mileage (km)", "km", "number")}
              {field("Asking price (₹)", "price", "number")}
              {field("Condition", "condition", "text", "Good")}
              <label className="block md:col-span-3">
                <span className="td-label">Description</span>
                <textarea
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  rows={3}
                  className="td-textarea"
                  placeholder="Describe the vehicle using verified facts."
                />
                <p className="td-help mt-1.5">Buyer-facing copy. Avoid unverified claims about accident or service history.</p>
              </label>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="rounded-[12px] border border-dashed border-border bg-surface-tint p-5">
                <Icon name="ImagePlus" size={22} className="text-muted" />
                <p className="mt-2 text-[13px] font-semibold text-ink">Vehicle photos</p>
                <p className="mt-0.5 text-[12px] text-muted">JPEG, PNG or WebP · 10 MB each · multiple files allowed.</p>
                <input
                  ref={photoRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  aria-label="Vehicle photos"
                  className="mt-3 block w-full text-[12px] text-muted file:mr-3 file:cursor-pointer file:rounded-[9px] file:border-0 file:bg-surface file:px-3 file:py-2 file:text-[12px] file:font-semibold file:text-ink"
                />
              </div>
              <button onClick={uploadPhotos} disabled={busy} className="td-btn td-btn-primary">
                <Icon name="Upload" size={14} /> {busy ? "Uploading…" : "Upload photos"}
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <label className="block">
                  <span className="td-label">Document type</span>
                  <select value={docType} onChange={(e) => setDocType(e.target.value)} className="td-input td-select">
                    {docTypes.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block md:col-span-2">
                  <span className="td-label">File (PDF or image, max 10 MB)</span>
                  <input
                    ref={docRef}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    className="mt-2 block w-full text-[12px] text-muted file:mr-3 file:cursor-pointer file:rounded-[9px] file:border-0 file:bg-surface-tint file:px-3 file:py-2 file:text-[12px] file:font-semibold file:text-ink"
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-[12.5px] text-ink">
                <input type="checkbox" checked={docConsent} onChange={(e) => setDocConsent(e.target.checked)} />
                Share this document with buyers
              </label>
              <p className="td-help">
                Shared documents appear on the buyer report. Uploading a document does not make it independently verified.
              </p>
              <button onClick={uploadDocument} disabled={busy} className="td-btn td-btn-primary">
                <Icon name="FileText" size={14} /> {busy ? "Uploading…" : "Upload document"}
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-[12px] border border-border bg-surface-tint p-4">
                <p className="text-[12.5px] leading-relaxed text-muted">
                  Each row is recorded as a seller claim and stays <strong className="text-ink">Pending</strong> until evidence is verified.
                </p>
              </div>
              <button onClick={addHistoryRow} disabled={busy} className="td-btn td-btn-secondary">
                <Icon name="Plus" size={14} /> Add current reading as history
              </button>
              {historyRows.length > 0 ? (
                <ul className="divide-y divide-border rounded-[12px] border border-border">
                  {historyRows.map((r, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-x-2 px-4 py-2.5 text-[12px] text-muted">
                      <span className="font-semibold text-ink">{r.date}</span>
                      <span>·</span>
                      <span className="capitalize">{r.category}</span>
                      <span>·</span>
                      <span className="td-metric text-ink">{r.km} km</span>
                      <span>·</span>
                      <span>{r.title}</span>
                      <StatusBadge status="pending" className="ml-auto" />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-[12px] border border-dashed border-border px-4 py-6 text-center text-[12px] text-muted">
                  No history rows added yet.
                </p>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <button onClick={runVerification} disabled={busy || !vehicleId} className="td-btn td-btn-primary">
                <Icon name={busy ? "Loader2" : "ScanSearch"} size={14} className={busy ? "animate-spin" : ""} />
                {busy ? "Running checks…" : "Run verification"}
              </button>
              {checks.length > 0 ? (
                <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {checks.map((c) => (
                    <li key={c.label} className="flex items-center justify-between gap-3 rounded-[11px] border border-border bg-surface-tint px-3.5 py-2.5">
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-semibold text-ink">{c.label}</p>
                        <p className="truncate text-[11px] text-muted">{c.note}</p>
                      </div>
                      <StatusBadge status={c.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-[12px] border border-dashed border-border px-4 py-6 text-center text-[12px] text-muted">
                  No checks have run yet.
                </p>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <button onClick={loadGate} className="td-btn td-btn-secondary">
                  <Icon name="ClipboardCheck" size={14} /> Check publish readiness
                </button>
                <button onClick={publish} disabled={busy} className="td-btn td-btn-primary">
                  <Icon name="Upload" size={14} /> {busy ? "Publishing…" : "Publish listing"}
                </button>
                {vehicleId && (
                  <a href={`/vehicle/${vehicleId}`} className="td-btn td-btn-ghost">
                    <Icon name="ExternalLink" size={14} /> Preview as buyer
                  </a>
                )}
              </div>

              {gate && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div
                    className="rounded-[12px] border p-4"
                    style={{
                      background: "var(--danger-bg)",
                      borderColor: "color-mix(in srgb, var(--danger) 25%, transparent)",
                    }}
                  >
                    <div className="flex items-center gap-2 text-[12.5px] font-semibold" style={{ color: "var(--danger)" }}>
                      <Icon name="ShieldAlert" size={14} /> Blockers ({gate.blockers.length})
                    </div>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] text-ink">
                      {gate.blockers.length ? gate.blockers.map((b) => <li key={b}>{b}</li>) : <li>None — ready to publish.</li>}
                    </ul>
                  </div>
                  <div
                    className="rounded-[12px] border p-4"
                    style={{
                      background: "var(--warning-bg)",
                      borderColor: "color-mix(in srgb, var(--warning) 25%, transparent)",
                    }}
                  >
                    <div className="flex items-center gap-2 text-[12.5px] font-semibold" style={{ color: "var(--warning)" }}>
                      <Icon name="AlertTriangle" size={14} /> Warnings ({gate.warnings.length})
                    </div>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] text-ink">
                      {gate.warnings.length ? gate.warnings.map((w) => <li key={w}>{w}</li>) : <li>None.</li>}
                    </ul>
                  </div>
                </div>
              )}

              {vehicleId && (
                <p className="font-mono text-[11px] text-muted">
                  Draft ID: {vehicleId}
                  {listingId ? ` · Listing: ${listingId}` : ""}
                </p>
              )}
            </div>
          )}

          <div className="space-y-3">
            {error && <InlineAlert tone="danger" title="That didn’t work" detail={error} />}
            {info && <InlineAlert tone="success" title={info} />}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="td-btn td-btn-ghost"
            >
              <Icon name="ArrowLeft" size={14} /> Back
            </button>
            <button
              onClick={next}
              disabled={busy || step === steps.length - 1}
              className="td-btn td-btn-primary"
            >
              {step === 0 ? "Save draft & continue" : "Continue"}
              <Icon name="ArrowRight" size={14} />
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
