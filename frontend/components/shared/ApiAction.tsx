"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";

type Method = "POST" | "PATCH" | "DELETE" | "PUT";

interface ApiActionOptions {
  onSuccess?: (data: unknown) => void;
  refresh?: boolean;
}

/** Small hook for JSON API actions with loading + inline error state. */
export function useApiAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run(url: string, method: Method = "POST", body?: unknown, options: ApiActionOptions = {}) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const json = (await res.json().catch(() => ({}))) as { data?: unknown; error?: { message?: string } };
      if (!res.ok) {
        setError(json.error?.message ?? `Request failed (${res.status})`);
        return null;
      }
      setMessage("Saved.");
      if (options.refresh !== false) router.refresh();
      options.onSuccess?.(json.data);
      return json.data;
    } catch {
      setError("Network error — please try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { run, busy, error, message, setError };
}

export function ApiButton({
  url,
  method = "POST",
  body,
  label,
  busyLabel,
  icon,
  className,
  variant = "primary",
  confirmText,
  onSuccess,
}: {
  url: string;
  method?: Method;
  body?: unknown;
  label: string;
  busyLabel?: string;
  icon?: string;
  className?: string;
  variant?: "primary" | "outline" | "ghost" | "danger";
  confirmText?: string;
  onSuccess?: (data: unknown) => void;
}) {
  const { run, busy, error } = useApiAction();
  const styles: Record<string, string> = {
    primary: "bg-primary text-[var(--on-primary)] hover:bg-primary-600",
    outline: "border border-border bg-surface text-ink hover:bg-bg",
    ghost: "text-primary hover:bg-surface-tint",
    danger: "border border-danger/30 bg-danger-bg text-danger hover:bg-danger/10",
  };
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (confirmText && !window.confirm(confirmText)) return;
          void run(url, method, body, { onSuccess });
        }}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-pill px-3.5 py-2 text-caption font-semibold transition disabled:opacity-60",
          styles[variant],
          className
        )}
      >
        {icon && <Icon name={busy ? "Activity" : icon} size={15} className={busy ? "animate-pulse" : ""} />}
        {busy ? busyLabel ?? "Working…" : label}
      </button>
      {error && <span className="text-[11px] font-medium text-danger">{error}</span>}
    </span>
  );
}
