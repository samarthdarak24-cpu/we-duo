"use client";

import { riskLabel } from "@/lib/trust";

/** Semicircular 0–100 risk gauge (design.md §4.4 B7). */
export function RiskGauge({ risk, size = 220 }: { risk: number; size?: number }) {
  const label = riskLabel(risk);
  const r = (size - 28) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = Math.PI * r; // half circle
  const offset = circumference * (1 - Math.min(100, Math.max(0, risk)) / 100);
  const startX = cx - r;
  const endX = cx + r;
  const path = `M ${startX} ${cy} A ${r} ${r} 0 0 1 ${endX} ${cy}`;

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 16} viewBox={`0 0 ${size} ${size / 2 + 16}`}>
        <path d={path} fill="none" stroke="var(--border)" strokeWidth={16} strokeLinecap="round" />
        <path
          d={path}
          fill="none"
          stroke={label.color}
          strokeWidth={16}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s ease-out" }}
        />
        <text x={cx} y={cy - 6} textAnchor="middle" className="fill-ink td-metric" style={{ fontSize: 42 }}>
          {risk}
        </text>
        <text x={cx} y={cy + 18} textAnchor="middle" className="fill-muted" style={{ fontSize: 11, letterSpacing: "0.08em" }}>
          OF 100
        </text>
      </svg>
      <span className="pill -mt-2" style={{ color: label.color, background: `color-mix(in srgb, ${label.color} 12%, transparent)` }}>
        {label.label}
      </span>
    </div>
  );
}
