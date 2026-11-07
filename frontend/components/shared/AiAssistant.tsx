"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { InlineAlert } from "@/components/shared/InlineAlert";

interface Citation {
  kind: string;
  id: string;
  label: string;
  detail: string;
}

interface Action {
  label: string;
  href: string;
}

interface Answer {
  intent: string;
  answer: string;
  citations: Citation[];
  confidence: number;
  followUps: string[];
  actions: Action[];
  model: string;
  disclaimer: string;
}

interface Turn {
  role: "user" | "ai";
  text: string;
  data?: Answer;
}

export function AiAssistant({
  vehicleId,
  vehicleLabel,
  defaultOpen = false,
}: {
  vehicleId?: string;
  vehicleLabel?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState("rules-v1");
  const [suggestions, setSuggestions] = useState<string[]>([
    "What is the trust score and why?",
    "Is there any accident or damage record?",
    "Which documents are verified?",
  ]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    fetch(`/api/v1/ai/assistant${vehicleId ? `?vehicleId=${encodeURIComponent(vehicleId)}` : ""}`)
      .then((r) => r.json())
      .then((json) => {
        if (active && Array.isArray(json?.data?.suggestions)) setSuggestions(json.data.suggestions.slice(0, 5));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [open, vehicleId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setError(null);
    setTurns((t) => [...t, { role: "user", text: q }]);
    setBusy(true);
    try {
      const res = await fetch("/api/v1/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleId, question: q }),
      });
      const json = (await res.json().catch(() => ({}))) as { data?: Answer; error?: { message?: string } };
      if (!res.ok || !json.data) {
        setError(json.error?.message ?? "The assistant could not answer that.");
        setBusy(false);
        return;
      }
      setTurns((t) => [...t, { role: "ai", text: json.data!.answer, data: json.data! }]);
      setEngine(json.data.model?.startsWith("llm:") ? "llm + rules" : "rules-v1");
      if (json.data.followUps?.length) setSuggestions(json.data.followUps.slice(0, 4));
    } catch {
      setError("Network error — the assistant is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open TrustDrive AI assistant"
        aria-expanded={open}
        className="td-focus-ring fixed bottom-20 right-4 z-40 flex h-11 items-center gap-2.5 rounded-full border px-3.5 text-[12.5px] font-semibold shadow-[0_12px_40px_rgba(0,0,0,0.28)] transition hover:brightness-105 md:bottom-6 md:right-6"
        style={{ background: "var(--surface)", color: "var(--ink, var(--text))", borderColor: "color-mix(in srgb, var(--primary) 38%, var(--border))" }}
      >
        <span
          className="relative flex h-6 w-6 items-center justify-center rounded-full"
          style={{ background: "var(--info-bg)", color: "var(--primary)" }}
        >
          <Icon name="Sparkles" size={14} />
          <span
            className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--success)" }}
          />
        </span>
        <span className="hidden sm:inline">Ask TrustDrive</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-end bg-black/50 p-0 backdrop-blur-sm sm:p-4"
          onClick={() => setOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="TrustDrive grounded AI assistant"
            onClick={(e) => e.stopPropagation()}
            className="flex h-[86vh] w-full flex-col overflow-hidden rounded-t-[20px] border border-border bg-surface shadow-2xl sm:h-[640px] sm:max-w-[460px] sm:rounded-[20px]"
          >
            <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="td-icon-chip">
                  <Icon name="Sparkles" size={18} />
                </span>
                <div>
                  <h2 className="text-[14.5px] font-semibold text-ink">TrustDrive Assistant</h2>
                  <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    grounded · {engine} · {vehicleLabel ?? "general"}
                  </p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close assistant" className="td-icon-btn">
                <Icon name="X" size={16} />
              </button>
            </header>

            <div ref={listRef} className="td-scroll flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {!turns.length && (
                <div className="space-y-4">
                  <div className="rounded-[12px] border border-border bg-surface-tint p-4">
                    <p className="text-[12.5px] leading-relaxed text-ink">
                      I answer only from stored TrustDrive records and cite what I use. I cannot inspect a car physically, approve a
                      listing or guarantee condition.
                    </p>
                  </div>
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Try asking</p>
                    <div className="flex flex-col gap-1.5">
                      {suggestions.map((s) => (
                        <button
                          key={s}
                          onClick={() => ask(s)}
                          className="rounded-[10px] border border-border bg-surface px-3 py-2.5 text-left text-[12.5px] text-ink transition hover:border-primary hover:bg-surface-tint"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {turns.map((t, i) =>
                t.role === "user" ? (
                  <div
                    key={i}
                    className="ml-auto max-w-[85%] rounded-[14px] rounded-tr-[4px] px-3.5 py-2.5 text-[12.5px] font-medium"
                    style={{ background: "var(--primary)", color: "var(--on-primary)" }}
                  >
                    {t.text}
                  </div>
                ) : (
                  <div key={i} className="max-w-[95%] space-y-2">
                    <div className="rounded-[14px] rounded-tl-[4px] border border-border bg-surface-tint px-3.5 py-3 text-[12.5px] leading-relaxed text-ink">
                      {t.text}
                    </div>
                    {!!t.data?.citations.length && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Evidence used</p>
                        <div className="flex flex-wrap gap-1">
                          {t.data.citations.map((c) => (
                            <span
                              key={`${c.kind}-${c.id}`}
                              title={c.detail}
                              className="rounded-full border border-border bg-surface px-2 py-1 font-mono text-[9.5px] text-muted"
                            >
                              {c.kind}: {c.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {!!t.data?.actions.length && (
                      <div className="flex flex-wrap gap-1.5">
                        {t.data.actions.slice(0, 3).map((a) => (
                          <a
                            key={a.href + a.label}
                            href={a.href}
                            className="rounded-full bg-[var(--info-bg)] px-2.5 py-1.5 text-[11px] font-semibold text-primary transition hover:brightness-95"
                          >
                            {a.label}
                          </a>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] leading-relaxed text-muted">{t.data?.disclaimer}</p>
                  </div>
                )
              )}

              {busy && (
                <div className="flex items-center gap-2 rounded-[14px] rounded-tl-[4px] border border-border bg-surface-tint px-3.5 py-3 text-[12px] text-muted">
                  <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary [animation-delay:240ms]" />
                  </span>
                  Thinking…
                </div>
              )}
              {error && <InlineAlert tone="danger" title="Assistant unavailable" detail={error} />}
            </div>

            {!!turns.length && !!suggestions.length && (
              <div className="td-scroll flex gap-1.5 overflow-x-auto px-4 pb-2">
                {suggestions.slice(0, 3).map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    className="whitespace-nowrap rounded-full border border-border px-2.5 py-1.5 text-[10.5px] text-muted transition hover:border-primary hover:text-ink"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask(input);
              }}
              className="flex items-center gap-2 border-t border-border bg-surface p-3"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={vehicleId ? "Ask about this vehicle…" : "Ask how TrustDrive works…"}
                aria-label="Question"
                className="td-input"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                aria-label="Send question"
                className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[11px] transition hover:brightness-110 disabled:opacity-40"
                style={{ background: "var(--primary)", color: "var(--on-primary)" }}
              >
                <Icon name="Send" size={16} />
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
