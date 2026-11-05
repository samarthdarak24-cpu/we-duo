"use client";

import { useEffect } from "react";
import { Icon } from "@/components/ui/Icon";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("TrustDrive runtime error:", error);
  }, [error]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg p-6">
      <div className="pointer-events-none absolute -left-40 top-0 h-[420px] w-[420px] rounded-full bg-primary/10 blur-[150px]" />
      <div className="pointer-events-none absolute -bottom-40 right-0 h-[420px] w-[420px] rounded-full bg-danger/10 blur-[150px]" />

      <div className="relative w-full max-w-lg">
        <div className="card overflow-hidden">
          <div className="flex items-center gap-3 border-b border-border bg-danger-bg/60 px-6 py-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-danger/15 text-danger">
              <Icon name="AlertTriangle" size={20} />
            </span>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-danger">Runtime fault</div>
              <h1 className="text-card-title font-extrabold text-ink">Something broke on our side</h1>
            </div>
          </div>
          <div className="space-y-4 p-6">
            <p className="text-body text-muted">
              The page hit an unexpected error. Your data is safe — nothing was changed. Retry, or head back to a stable page.
            </p>
            <pre className="max-h-32 overflow-auto rounded-card border border-border bg-bg p-3 font-mono text-[11px] leading-relaxed text-muted">
              {error.message || "Unknown error"}
              {error.digest ? `\nDigest: ${error.digest}` : ""}
            </pre>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={reset}
                className="flex items-center gap-1.5 rounded-pill bg-primary px-4 py-2.5 text-caption font-semibold text-[var(--on-primary)] hover:bg-primary-600"
              >
                <Icon name="RotateCw" size={14} /> Try again
              </button>
              <a
                href="/"
                className="flex items-center gap-1.5 rounded-pill border border-border px-4 py-2.5 text-caption font-semibold text-ink hover:bg-bg"
              >
                <Icon name="ArrowLeft" size={14} /> Back home
              </a>
            </div>
          </div>
        </div>
        <p className="mt-4 text-center font-mono text-[11px] text-muted">TrustDrive · deterministic verification · failures are logged</p>
      </div>
    </div>
  );
}
