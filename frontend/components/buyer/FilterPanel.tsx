"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { SectionCard } from "@/components/shared/SectionCard";

export interface SavedSearchView {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  alertsEnabled: boolean;
  createdAt: string;
}

const sortOptions = [
  { value: "", label: "Newest first" },
  { value: "lowest_price", label: "Lowest price" },
  { value: "highest_price", label: "Highest price" },
  { value: "lowest_mileage", label: "Lowest mileage" },
  { value: "highest_trust", label: "Highest trust" },
  { value: "recently_verified", label: "Recently verified" },
];

const empty = {
  q: "",
  make: "",
  priceMin: "",
  priceMax: "",
  yearMin: "",
  yearMax: "",
  kmMax: "",
  fuel: "",
  transmission: "",
  location: "",
  ownershipMax: "",
  condition: "",
  verification: "all",
  accident: "all",
  trustMin: "",
  sort: "",
};

type FormState = typeof empty;

function buildQuery(f: FormState) {
  const p = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => {
    if (v && !(k === "verification" && v === "all") && !(k === "accident" && v === "all")) p.set(k, String(v));
  });
  return p.toString();
}

export function FilterPanel({
  initial,
  makes,
  savedSearches,
}: {
  initial: Partial<FormState>;
  makes: string[];
  savedSearches: SavedSearchView[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({ ...empty, ...initial });
  const [list, setList] = useState(savedSearches);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function field(label: string, key: keyof FormState, type = "text", placeholder?: string) {
    return (
      <label className="block">
        <span className="td-label">{label}</span>
        <input
          type={type}
          value={form[key]}
          placeholder={placeholder}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className="td-input"
        />
      </label>
    );
  }

  function select(label: string, key: keyof FormState, options: { value: string; label: string }[]) {
    return (
      <label className="block">
        <span className="td-label">{label}</span>
        <select
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className="td-input td-select"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  function apply() {
    const qs = buildQuery(form);
    router.push(qs ? `/buyer/search?${qs}` : "/buyer/search");
  }

  function reset() {
    setForm(empty);
    router.push("/buyer/search");
  }

  async function saveSearch() {
    if (!name.trim()) {
      setError("Give this search a name first.");
      return;
    }
    setBusy("save");
    setError(null);
    setInfo(null);
    const filters: Record<string, string> = {};
    Object.entries(form).forEach(([k, v]) => {
      if (v && !(k === "verification" && v === "all") && !(k === "accident" && v === "all")) filters[k] = String(v);
    });
    const res = await fetch("/api/v1/saved-searches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), filters, alertsEnabled: true }),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: { id: string }; error?: { message?: string } };
    setBusy(null);
    if (!res.ok) {
      setError(json.error?.message ?? "Could not save this search.");
      return;
    }
    setInfo("Search saved. You will be alerted about matching listings.");
    setName("");
    setList((l) => [
      { id: json.data?.id ?? `local-${Date.now()}`, name: name.trim(), filters, alertsEnabled: true, createdAt: new Date().toISOString() },
      ...l,
    ]);
    router.refresh();
  }

  async function removeSearch(id: string) {
    setBusy(id);
    const res = await fetch(`/api/v1/saved-searches?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setBusy(null);
    if (res.ok) {
      setList((l) => l.filter((s) => s.id !== id));
      router.refresh();
    } else {
      setError("Could not delete the saved search.");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <SectionCard
        title="Filters"
        description="All filters run against persisted listing and verification data."
        action={<Icon name="Filter" size={18} className="text-primary" />}
        bodyClassName="p-5 space-y-4"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {field("Keyword", "q", "text", "Make, model, location…")}
          {select("Make", "make", [{ value: "", label: "Any make" }, ...makes.map((m) => ({ value: m, label: m }))])}
          {field("Min price (₹)", "priceMin", "number")}
          {field("Max price (₹)", "priceMax", "number")}
          {field("Year from", "yearMin", "number")}
          {field("Year to", "yearMax", "number")}
          {field("Max mileage (km)", "kmMax", "number")}
          {field("Location", "location")}
          {select("Fuel", "fuel", [
            { value: "", label: "Any fuel" },
            ...["Petrol", "Diesel", "CNG", "Hybrid", "Electric"].map((f) => ({ value: f, label: f })),
          ])}
          {select("Transmission", "transmission", [
            { value: "", label: "Any transmission" },
            ...["Automatic", "Manual"].map((t) => ({ value: t, label: t })),
          ])}
          {select("Ownership (max)", "ownershipMax", [
            { value: "", label: "Any" },
            { value: "1", label: "First owner" },
            { value: "2", label: "Up to 2 owners" },
            { value: "3", label: "Up to 3 owners" },
          ])}
          {select("Condition", "condition", [
            { value: "", label: "Any condition" },
            ...["Excellent", "Good", "Fair", "Needs work"].map((c) => ({ value: c, label: c })),
          ])}
          {select("Verification", "verification", [
            { value: "all", label: "Any trust level" },
            { value: "verified", label: "Verified (65+)" },
            { value: "caution", label: "Caution (below 65)" },
          ])}
          {select("Accident records", "accident", [
            { value: "all", label: "Any" },
            { value: "none", label: "None found" },
            { value: "found", label: "Records found" },
          ])}
          {field("Minimum trust score", "trustMin", "number")}
          {select("Sort by", "sort", sortOptions)}
        </div>

        {error && <p className="rounded-[10px] bg-danger-bg px-3 py-2 text-[12px] font-semibold text-danger">{error}</p>}
        {info && <p className="rounded-[10px] bg-success-bg px-3 py-2 text-[12px] font-semibold text-success">{info}</p>}

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <button onClick={apply} className="td-btn td-btn-primary">
            <Icon name="Search" size={15} /> Apply filters
          </button>
          <button onClick={reset} className="td-btn td-btn-secondary">
            Reset
          </button>
          <span className="ml-auto text-[11.5px] text-muted">Filters are shareable via the URL.</span>
        </div>

        <div className="border-t border-border pt-4">
          <h3 className="text-[13px] font-semibold text-ink">Save this search</h3>
          <p className="text-[11.5px] text-muted">Get notified when a matching listing is published or changes price.</p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Automatic BMW under ₹30L"
              className="td-input flex-1"
            />
            <button
              onClick={saveSearch}
              disabled={busy === "save"}
              className="td-btn td-btn-secondary"
            >
              {busy === "save" ? "Saving…" : "Save search"}
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Saved searches" description={`${list.length} saved`} className="h-fit" bodyClassName="p-4">
        <ul className="space-y-1.5">
          {list.map((s) => {
            const qs = new URLSearchParams(
              Object.entries(s.filters).reduce<Record<string, string>>((acc, [k, v]) => {
                if (v !== undefined && v !== null && v !== "") acc[k] = String(v);
                return acc;
              }, {})
            ).toString();
            return (
              <li key={s.id} className="flex items-center gap-2 rounded-[10px] bg-surface-tint px-3 py-2">
                <a href={qs ? `/buyer/search?${qs}` : "/buyer/search"} className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-semibold text-ink">{s.name}</span>
                  <span className="block text-[10.5px] text-muted">
                    {Object.keys(s.filters).length} filter{Object.keys(s.filters).length === 1 ? "" : "s"} · alerts{" "}
                    {s.alertsEnabled ? "on" : "off"}
                  </span>
                </a>
                <button
                  onClick={() => removeSearch(s.id)}
                  disabled={busy === s.id}
                  aria-label={`Delete saved search ${s.name}`}
                  className="text-muted transition hover:text-danger disabled:opacity-40"
                >
                  <Icon name="Trash2" size={14} />
                </button>
              </li>
            );
          })}
          {!list.length && <li className="py-6 text-center text-[12px] text-muted">No saved searches yet.</li>}
        </ul>
      </SectionCard>
    </div>
  );
}
