"use client";

import { useEffect, useState } from "react";

interface OcrBackend {
  engine: string;
  available: boolean;
}

interface Stack {
  connected: boolean;
  reason?: string;
  database?: { database?: string; tables?: number };
  ocr?: OcrBackend[];
  intelligence?: Record<string, { available?: boolean; engine?: string; backend?: string }>;
  llm?: { provider?: string; model?: string | null; active?: boolean };
  agent?: { orchestrator?: string; checkpointing?: boolean; nodes?: number };
  blockchain?: { configured?: boolean; anchoring_claimed?: boolean };
  worker?: { backend?: string };
}

/**
 * Documented build, NOT live status. When the intelligence service is
 * unreachable we must never paint a capability as "active": the whole point of
 * this section is to report what is actually running. Every fallback row is
 * therefore `off` and the section is explicitly labelled "not live".
 */
const FALLBACK: { label: string; value: string; state: "active" | "off" }[] = [
  { label: "OCR", value: "Documented: PaddleOCR / RapidOCR (status unknown)", state: "off" },
  { label: "Damage CV", value: "Documented: YOLO adapter (status unknown)", state: "off" },
  { label: "Anomaly ML", value: "Documented: rules + IForest/LOF + XGBoost (status unknown)", state: "off" },
  { label: "Retrieval", value: "Documented: keyword / sentence-transformers (status unknown)", state: "off" },
  { label: "Agent", value: "Documented: LangGraph 15/16 conditional nodes (status unknown)", state: "off" },
  { label: "LLM", value: "Documented: local / configurable (status unknown)", state: "off" },
  { label: "Integrity", value: "Documented: local SHA-256 chain (status unknown)", state: "off" },
  { label: "On-chain anchor", value: "Not configured · not claimed", state: "off" },
];

function Dot({ state }: { state: "active" | "off" }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full"
      style={{ background: state === "active" ? "#5BC08A" : "#8A8F98" }}
    />
  );
}

export function StackStatus() {
  const [stack, setStack] = useState<Stack | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/v1/ai/stack")
      .then((r) => r.json())
      .then((json: { data?: Stack }) => {
        if (!alive) return;
        if (!json.data) {
          setFailed("Live status unavailable.");
          return;
        }
        setStack(json.data);
        if (!json.data.connected) setFailed(json.data.reason ?? "Live status unavailable.");
      })
      .catch(() => alive && setFailed("Live status unavailable."));
    return () => {
      alive = false;
    };
  }, []);

  const rows = (() => {
    if (!stack?.connected) return FALLBACK;
    const intel = stack.intelligence ?? {};
    return [
      {
        label: "OCR",
        value: (stack.ocr ?? [])
          .filter((b) => b.available)
          .map((b) => b.engine)
          .join(" · ") || "unavailable",
        state: (stack.ocr ?? []).some((b) => b.available) ? "active" : "off",
      },
      {
        label: "Damage CV",
        value: intel.damage?.available ? `YOLO · ${intel.damage.engine}` : "inactive",
        state: intel.damage?.available ? "active" : "off",
      },
      {
        label: "Anomaly ML",
        value: intel.xgboost?.available ? "Isolation Forest + LOF + XGBoost" : "deterministic rules only (no fitted ML model)",
        state: intel.xgboost?.available ? "active" : "off",
      },
      {
        label: "Retrieval",
        value: intel.retrieval?.backend ?? "keyword",
        state: intel.retrieval?.available ? "active" : "off",
      },
      {
        label: "Agent",
        value: `${stack.agent?.orchestrator ?? "sequential"} · ${stack.agent?.nodes ?? 12} nodes`,
        state: "active",
      },
      {
        label: "LLM",
        value: stack.llm?.active
          ? `${stack.llm.provider} · ${stack.llm.model ?? ""}`
          : "deterministic fallback",
        state: stack.llm?.active ? "active" : "off",
      },
      {
        label: "Integrity",
        value: "Local SHA-256 chain",
        state: "active",
      },
      {
        label: "On-chain anchor",
        value: stack.blockchain?.anchoring_claimed ? "claimed" : "Not configured · not claimed",
        state: "off",
      },
    ] as { label: string; value: string; state: "active" | "off" }[];
  })();

  return (
    <section className="border-t border-[#23262A] bg-[#08090A] py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="mb-2 inline-block font-mono text-[11px] uppercase tracking-[0.24em] text-[#C5A46D]">
              Live stack
            </span>
            <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">
              What is actually running
            </h2>
            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[#BFC3C8]">
              Read from the intelligence service at request time. A capability is only
              marked active when its engine and weights are present.
            </p>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8A8F98]">
            {stack?.connected ? "service connected" : "live status unavailable · documented build"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map((row) => (
            <div
              key={row.label}
              className="rounded-[12px] border border-[#23262A] bg-[#0D0F11] p-4"
            >
              <div className="flex items-center gap-2">
                <Dot state={row.state} />
                <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8A8F98]">
                  {row.label}
                </span>
              </div>
              <p className="mt-2 text-[13px] font-medium leading-snug text-[#F5F5F5]">{row.value}</p>
            </div>
          ))}
        </div>

        {!stack?.connected && (
          <p className="mt-4 text-[12px] leading-relaxed text-[#8A8F98]">
            Live status is unavailable{failed ? ` (${failed})` : ""}. The list above is the{' '}
            <strong className="text-[#F5F5F5]">documented build, not live status</strong> — none of
            these engines is confirmed running, so none is marked active. Start the intelligence
            service to see the engines that are actually available.
          </p>
        )}
      </div>
    </section>
  );
}
