"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/cn";
import { formatKm } from "@/lib/format";
import type { MileagePoint } from "@/lib/seed";

const ranges = [
  { label: "1Y", count: 1 },
  { label: "3Y", count: 3 },
  { label: "5Y", count: 5 },
];

export function MileageChart({
  data,
  unit = "km",
}: {
  data: MileagePoint[];
  unit?: string;
}) {
  const [range, setRange] = useState(5);
  const view = data.slice(-range);
  const latest = data[data.length - 1];

  return (
    <div>
      <div className="mb-2 flex items-center justify-end gap-1">
        {ranges.map((r) => (
          <button
            key={r.label}
            onClick={() => setRange(r.count)}
            className={cn(
              "rounded-pill px-2.5 py-1 text-caption font-semibold transition",
              range === r.count
                ? "bg-primary text-[var(--on-primary)]"
                : "bg-bg text-muted hover:text-ink"
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={view} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="mileageFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="year"
              tick={{ fontSize: 11, fill: "var(--muted)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--muted)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v / 1000}k`}
              width={36}
            />
            <Tooltip
              cursor={{ stroke: "var(--primary)", strokeDasharray: "4 4" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as MileagePoint;
                const isLatest = p.year === latest.year;
                return (
                  <div className="rounded-pill border border-border bg-surface px-3 py-2 text-caption shadow-card">
                    <div className="font-semibold text-ink">
                      {isLatest ? "Latest: " : `${p.year}: `}
                      {formatKm(p.km)}
                    </div>
                    {p.flagged && (
                      <div className="mt-0.5 font-semibold text-warning">Review reading</div>
                    )}
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="km"
              stroke="var(--primary)"
              strokeWidth={2.5}
              fill="url(#mileageFill)"
              dot={{ r: 3, fill: "var(--primary)" }}
              activeDot={{ r: 5 }}
            />
            {latest.flagged && (
              <ReferenceDot
                x={latest.year}
                y={latest.km}
                r={7}
                fill="var(--warning)"
                stroke="var(--bg)"
                strokeWidth={2}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
