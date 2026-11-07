"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SectionCard } from "@/components/shared/SectionCard";
import { InlineAlert } from "@/components/shared/InlineAlert";
import {
  documentsForCategory,
  fieldsForCategory,
  getCategory,
  implementedCategories,
  isElectric,
  validateIdentity,
} from "@/lib/vehicle-categories";

const steps = ["Basic info", "Photos", "Documents", "History", "Verification", "Review & publish"];

const stepDescription: Record<number, string> = {
  0: "Pick the vehicle category first — the form, validation and documents adapt to it. Make, model, registration and the category primary identifier are required before a draft is created.",
  1: "Add front, rear, left, right, interior, dashboard and odometer photos. JPEG, PNG or WebP, 10 MB each.",
  2: "Upload only documents you are allowed to share. The allowed document set follows the selected category. Buyer visibility is consent-gated and recorded.",
  3: "Add prior mileage / distance readings, service, repair, ownership or inspection events. Everything is submitted as Pending until verified.",
  4: "Run the deterministic pipeline: document completeness, identifier checks, duplicate detection and mileage analysis.",
  5: "Review the draft and publish. Blockers must be cleared; warnings stay labelled on the public report.",
};

/** Maps a fieldCatalog `column` to the VehicleInput core key. `specs` columns are
 *  stored separately as seller declarations. `primary_identifier` shares the `vin`
 *  column (chassis / frame number for two-wheelers, 17-char VIN for cars). */
const CORE_KEY: Record<string, string> = {
  reg_no: "regNo",
  vin: "vin",
  make: "make",
  model: "model",
  variant: "variant",
  year: "year",
  color: "color",
  location: "location",
  ownership_count: "ownershipCount",
  asking_price: "price",
  km_claimed: "km",
  transmission: "transmission",
};

// Identity / common fields preserved when the seller switches category so they
// don't have to retype the basics.
const KEEP_ON_SWITCH = [
  "reg_no",
  "primary_identifier",
  "make",
  "model",
  "variant",
  "year",
  "color",
  "location",
  "ownership_count",
  "asking_price",
];

interface Gate {
  blockers: string[];
  warnings: string[];
  canPublish: boolean;
}

type GroupField = ReturnType<typeof fieldsForCategory>[number]["fields"][number];

export function AddVehicleStepper() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [categoryId, setCategoryId] = useState<string>("passenger_car");
  const [form, setForm] = useState<Record<string, string>>({});
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [listingId, setListingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [gate, setGate] = useState<Gate | null>(null);
  const [checks, setChecks] = useState<{ label: string; status: string; note: string }[]>([]);
  const [historyRows, setHistoryRows] = useState<{ date: string; km: string; category: string; title: string }[]>([]);
  const [docType, setDocType] = useState<string>(
    () => documentsForCategory("passenger_car").find((d) => d.required)?.id ?? "rc"
  );
  const [docConsent, setDocConsent] = useState(true);
  const photoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  const cat = getCategory(categoryId);
  const groups = useMemo(() => fieldsForCategory(categoryId), [categoryId]);
  const docList = useMemo(() => documentsForCategory(categoryId), [categoryId]);

  const requiredNames = useMemo(
    () => groups.flatMap((g) => g.fields).filter((f) => f.required).map((f) => f.name),
    [groups]
  );
  const canSaveBasic = requiredNames.every((n) => (form[n] ?? "").trim().length > 0);

  const categoryNote = [
    cat?.labels?.primaryIdentifier ? `Primary identifier: ${cat.labels.primaryIdentifier}.` : "",
    isElectric(categoryId)
      ? "Electric: no engine number and no PUC. Battery State of Health comes only from a battery health report, never from a photo or distance."
      : "Combustion: engine number is optional; PUC applies where relevant.",
  ]
    .filter(Boolean)
    .join(" ");

  const setField = (name: string, value: string) => setForm((f) => ({ ...f, [name]: value }));

  const onCategoryChange = (id: string) => {
    setCategoryId(id);
    setForm((f) => {
      const next: Record<string, string> = {};
      for (const k of KEEP_ON_SWITCH) if (f[k] != null) next[k] = f[k];
      return next;
    });
    const docs = documentsForCategory(id);
    const firstReq = docs.find((d) => d.required)?.id ?? docs[0]?.id ?? "rc";
    setDocType(firstReq);
  };

  /** Split the dynamic form into the core VehicleInput columns and the category specs. */
  function buildBodies() {
    const core: Record<string, string> = {};
    const specs: Record<string, string> = {};
    for (const g of groups) {
      for (const f of g.fields) {
        const val = (form[f.name] ?? "").trim();
        if (f.column === "specs") {
          if (val) specs[f.name] = val;
        } else {
          const k = CORE_KEY[f.column];
          if (k) core[k] = val;
        }
      }
    }
    const c = getCategory(categoryId)!;
    const fuel = isElectric(categoryId)
      ? "Electric"
      : c.powertrain === "diesel"
        ? "Diesel"
        : c.powertrain === "cng"
          ? "CNG"
          : c.powertrain === "hybrid"
            ? "Hybrid"
            : "Petrol";
    const transmission =
      core.transmission ||
      (isElectric(categoryId) && c.class === "two_wheeler" ? "Direct drive" : "Manual");

    const post = {
      make: core.make,
      model: core.model,
      variant: core.variant || undefined,
      year: Number(core.year) || new Date().getFullYear(),
      regNo: core.regNo,
      vin: core.vin,
      fuel,
      transmission,
      category: c.label,
      color: core.color || undefined,
      location: core.location || undefined,
      ownershipCount: Number(core.ownershipCount) || 1,
      price: Number(core.price) || 0,
      km: Number(core.km) || 0,
      description: form.description || undefined,
      condition: "Good",
      categoryId,
      specs: Object.keys(specs).length ? specs : undefined,
    };
    const patch = {
      reg_no: core.regNo,
      vin: core.vin,
      make: core.make,
      model: core.model,
      variant: core.variant,
      year: Number(core.year) || new Date().getFullYear(),
      color: core.color,
      location: core.location,
      ownership_count: Number(core.ownershipCount) || 1,
      asking_price: Number(core.price) || 0,
      km_claimed: Number(core.km) || 0,
      transmission,
      fuel,
      category: c.label,
      description: form.description,
      condition: "Good",
      categoryId,
      specs,
    };
    return { post, patch };
  }

  async function saveBasic() {
    setBusy(true);
    setError(null);
    const { post } = buildBodies();
    try {
      const res = await fetch("/api/v1/seller/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(post),
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
        // Draft already exists — patch the basic fields (including category specs) before moving on.
        const { patch } = buildBodies();
        const res = await fetch(`/api/v1/seller/vehicles/${vehicleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
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
        setError("Make, model, registration and the category primary identifier are required.");
        return;
      }
      // Fast client-side identity feedback (server re-validates authoritatively).
      const v = validateIdentity(categoryId, {
        regNo: form.reg_no ?? "",
        primaryIdentifier: form.primary_identifier ?? "",
        engineNumber: form.engine_number ?? "",
        motorNumber: form.motor_number ?? "",
      });
      if (!v.ok) {
        setError(v.errors.join(" "));
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
    const row = {
      date: new Date().toISOString().slice(0, 10),
      km: form.odometer_km || "0",
      category: "service",
      title: "Seller-submitted record",
    };
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
    // Keep the id in a local variable. React state updates are asynchronous, so
    // reading `listingId` again in this same tick returns the OLD value (null)
    // and silently aborts the first publish after creating a draft.
    let id = listingId;
    if (!id) {
      const created = await fetch("/api/v1/seller/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId, description: form.description, price: Number(form.asking_price) }),
      });
      const json = (await created.json().catch(() => ({}))) as { data?: { id: string }; error?: { message: string } };
      if (!created.ok || !json.data) {
        setError(json.error?.message ?? "Could not create the listing.");
        return;
      }
      id = json.data.id;
      setListingId(id);
    }
    if (!id) {
      setError("Could not resolve the listing draft. Reopen the wizard and try again.");
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

  const renderField = (f: GroupField) => {
    if (f.type === "select") {
      return (
        <label className="block" key={f.name}>
          <span className="td-label">
            {f.label}
            {f.required ? " *" : ""}
          </span>
          <select
            value={form[f.name] ?? ""}
            onChange={(e) => setField(f.name, e.target.value)}
            className="td-input td-select"
          >
            <option value="">Select…</option>
            {f.options?.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          {f.help && <p className="td-help mt-1">{f.help}</p>}
        </label>
      );
    }
    return (
      <label className="block" key={f.name}>
        <span className="td-label">
          {f.label}
          {f.required ? " *" : ""}
        </span>
        <input
          type={f.type === "number" ? "number" : "text"}
          value={form[f.name] ?? ""}
          placeholder={f.placeholder ?? ""}
          min={f.min}
          max={f.max}
          step={f.step}
          onChange={(e) => setField(f.name, e.target.value)}
          className="td-input"
        />
        {f.help && <p className="td-help mt-1">{f.help}</p>}
      </label>
    );
  };

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
                    i === step
                      ? "bg-black/15 text-[var(--on-primary)]"
                      : i < step
                        ? "bg-success-bg text-success"
                        : "bg-surface-tint text-muted"
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
            <div className="space-y-5">
              <div className="rounded-[12px] border border-border bg-surface-tint p-4">
                <label className="block">
                  <span className="td-label">
                    Vehicle category <span className="text-danger">*</span>
                  </span>
                  <select
                    value={categoryId}
                    onChange={(e) => onCategoryChange(e.target.value)}
                    className="td-input td-select"
                  >
                    {implementedCategories().map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label} · {c.powertrain}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="td-help mt-1.5">{categoryNote}</p>
              </div>

              {groups.map((g) => (
                <div key={g.id} className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted md:col-span-3">
                    {g.label}
                  </p>
                  {g.fields.map((f) => renderField(f))}
                </div>
              ))}

              <label className="block md:col-span-3">
                <span className="td-label">Description</span>
                <textarea
                  value={form.description ?? ""}
                  onChange={(e) => setField("description", e.target.value)}
                  rows={3}
                  className="td-textarea"
                  placeholder="Describe the vehicle using verified facts."
                />
                <p className="td-help mt-1.5">
                  Buyer-facing copy. Avoid unverified claims about accident or service history.
                </p>
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
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="td-input td-select"
                  >
                    {docList.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                        {d.required ? " (required)" : ""}
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
                <input
                  type="checkbox"
                  checked={docConsent}
                  onChange={(e) => setDocConsent(e.target.checked)}
                />
                Share this document with buyers
              </label>
              <p className="td-help">
                The document set follows the selected category — two-wheelers use RC/insurance for
                two-wheelers and engine-chassis records; EVs add battery warranty, inspection, SOH and
                replacement documents. Uploading a document does not make it independently verified.
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
                    <li
                      key={c.label}
                      className="flex items-center justify-between gap-3 rounded-[11px] border border-border bg-surface-tint px-3.5 py-2.5"
                    >
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
                      {gate.blockers.length ? (
                        gate.blockers.map((b) => <li key={b}>{b}</li>)
                      ) : (
                        <li>None — ready to publish.</li>
                      )}
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
                      {gate.warnings.length ? (
                        gate.warnings.map((w) => <li key={w}>{w}</li>)
                      ) : (
                        <li>None.</li>
                      )}
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
