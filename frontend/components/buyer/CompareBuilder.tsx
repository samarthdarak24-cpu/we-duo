"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { formatINR, formatKm } from "@/lib/format";

export interface CompareRow {
  id: string;
  name: string;
  year: number;
  km: number;
  fuel: string;
  transmission: string;
  ownership: number;
  price: number;
  trustScore: number;
  coverage: number;
  findings: number;
  market: number;
  damage: number;
  serviceComplete: boolean;
  accident: boolean;
  saved: boolean;
}

export interface CompareOption {
  id: string;
  name: string;
  price: number;
  trustScore: number;
}

const rowsDef: { label: string; value: (r: CompareRow) => string; best?: (rows: CompareRow[]) => string | null }[] = [
  { label: "Price", value: (r) => formatINR(r.price), best: (rows) => rows.reduce((a, b) => (a.price <= b.price ? a : b)).id },
  { label: "Year", value: (r) => String(r.year), best: (rows) => rows.reduce((a, b) => (a.year >= b.year ? a : b)).id },
  { label: "Mileage", value: (r) => formatKm(r.km), best: (rows) => rows.reduce((a, b) => (a.km <= b.km ? a : b)).id },
  { label: "Fuel", value: (r) => r.fuel },
  { label: "Transmission", value: (r) => r.transmission },
  { label: "Ownership", value: (r) => (r.ownership === 1 ? "First owner" : `${r.ownership} owners`) },
  { label: "Service history", value: (r) => (r.serviceComplete ? "Verified records" : "Incomplete") },
  { label: "Accident records", value: (r) => (r.accident ? "Records found" : "None in sources") },
  { label: "Document verification", value: (r) => `${r.coverage}%` },
  { label: "Trust score", value: (r) => `${r.trustScore}/100`, best: (rows) => rows.reduce((a, b) => (a.trustScore >= b.trustScore ? a : b)).id },
  { label: "Damage records", value: (r) => String(r.damage) },
  { label: "Estimated market value", value: (r) => formatINR(r.market) },
  { label: "Price vs market", value: (r) => (r.market ? `${r.price <= r.market ? "−" : "+"}${formatINR(Math.abs(r.price - r.market))}` : "—") },
];

export function CompareBuilder({
  selected,
  options,
  rows,
  differences,
}: {
  selected: string[];
  options: CompareOption[];
  rows: CompareRow[];
  differences: string[];
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>(selected);

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 4 ? [...p, id] : p));
  }

  function apply() {
    router.push(picked.length ? `/buyer/compare?ids=${picked.join(",")}` : "/buyer/compare");
  }

  return (
    <div className="space-y-5">
      <section className="card space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="td-h2">Pick 2–4 vehicles</h2>
            <p className="text-[12px] text-muted">{picked.length} selected · maximum 4</p>
          </div>
          <button
            onClick={apply}
            disabled={picked.length < 2}
            className="td-btn td-btn-primary td-btn-sm"
          >
            <Icon name="GitCompare" size={14} /> Compare selected
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {options.map((o) => (
            <label
              key={o.id}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2 text-[12px] transition",
                picked.includes(o.id) ? "border-primary bg-surface-tint" : "border-border bg-bg hover:border-primary/40"
              )}
            >
              <input type="checkbox" checked={picked.includes(o.id)} onChange={() => toggle(o.id)} className="accent-primary" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-ink">{o.name}</span>
                <span className="block text-[11px] text-muted">
                  {formatINR(o.price)} · Trust {o.trustScore}/100
                </span>
              </span>
            </label>
          ))}
        </div>
      </section>

      {rows.length >= 2 ? (
        <>
          <section className="card p-5">
            <h2 className="td-h2 mb-2">Key differences</h2>
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted">
              {differences.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-muted">
              Generated deterministically from the records shown below. “None in sources” is not a guarantee.
            </p>
          </section>

          <section className="card overflow-x-auto td-scroll">
            <table className="w-full min-w-[680px] text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted">Attribute</th>
                  {rows.map((r) => (
                    <th key={r.id} className="px-4 py-3">
                      <a href={`/vehicle/${r.id}`} className="text-[13px] font-bold text-ink hover:text-primary">
                        {r.name}
                      </a>
                      <div className="text-[11px] font-normal text-muted">{r.year}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rowsDef.map((def) => {
                  const bestId = def.best?.(rows) ?? null;
                  return (
                    <tr key={def.label} className="border-b border-border/60">
                      <td className="px-4 py-2.5 text-[11.5px] font-semibold text-muted">{def.label}</td>
                      {rows.map((r) => (
                        <td key={r.id} className="px-4 py-2.5 text-[12.5px]">
                          <span className={cn(bestId === r.id && "rounded-full bg-success-bg px-2 py-1 font-semibold text-success")}>
                            {def.value(r)}
                          </span>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </>
      ) : (
        <div className="card flex flex-col items-center gap-2 p-12 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-info-bg text-primary">
            <Icon name="GitCompare" size={24} />
          </span>
          <p className="text-[15px] font-semibold text-ink">Select at least two vehicles</p>
          <p className="max-w-md text-[12.5px] text-muted">
            Use the picker above or add vehicles to your shortlist from the marketplace.
          </p>
          <a href="/buyer/saved" className="td-btn td-btn-primary td-btn-sm mt-1">
            Open saved vehicles
          </a>
        </div>
      )}
    </div>
  );
}
