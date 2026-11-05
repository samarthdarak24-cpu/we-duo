"use client";

import type { CSSProperties } from "react";
import { trustBand } from "@/lib/trust";
import { Icon } from "./Icon";

/**
 * Animated SVG trust ring (Section 3.3). The label comes from the deterministic
 * band (Section 9.6 / 16) — never "Excellent Condition". The arc is drawn with a
 * CSS keyframe (not JS timing) so it always renders its final value.
 */
export function TrustRing({
  score,
  size = 132,
  stroke = 12,
  showLabel = true,
}: {
  score: number;
  size?: number;
  stroke?: number;
  showLabel?: boolean;
}) {
  const band = trustBand(score);
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ * (1 - score / 100);

  const arcStyle = {
    "--ring-circ": `${circ}`,
    "--ring-offset": `${offset}`,
  } as CSSProperties;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--border)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={band.color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            className="animate-ring-fill"
            style={arcStyle}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="td-metric text-[32px] leading-none text-ink">{score}</span>
          <span className="mt-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">of 100</span>
        </div>
      </div>
      {showLabel && (
        <div className="mt-3 flex items-center gap-1.5">
          <span className="pill" style={{ color: band.color, background: band.bg }}>
            {band.label}
          </span>
          <button
            aria-label="How is the trust score calculated?"
            className="text-muted hover:text-primary"
            title="Trust score is computed by a deterministic rules engine from verified records — not by an LLM."
          >
            <Icon name="Info" size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
