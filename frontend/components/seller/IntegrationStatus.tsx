"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";

export interface FraudModelStatus {
  name?: string;
  version?: string;
  mode?: string;
  training_data?: string;
  metrics?: unknown;
  features?: unknown;
  disclaimer?: string;
  available?: boolean;
}

export interface NotificationsStatus {
  service?: string;
  enabled?: boolean;
  provider?: string;
  smtp_configured?: boolean;
  note?: string;
}

export interface RegistrySource {
  provider?: string;
  status?: "available" | "blocked" | string;
  configured?: boolean;
  reason?: string;
}

export interface RegistryStatus {
  service?: string;
  active_provider?: string;
  sources?: Record<string, RegistrySource>;
  note?: string;
}

export interface StorageStatus {
  service?: string;
  backend?: "local" | "s3" | string;
  configured?: boolean;
  provider?: string;
}

type LoadState<T> = { status: "idle" | "loading" | "ok" | "error"; data: T | null; error: string | null };

async function getJson<T>(url: string): Promise<{ status: number; data: T | null; error: string | null }> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    const data = (await res.json().catch(() => null)) as T | { error?: string } | null;
    if (!res.ok) {
      return { status: res.status, data: null, error: (data as { error?: string } | null)?.error ?? `HTTP ${res.status}` };
    }
    return { status: res.status, data: data as T, error: null };
  } catch {
    return { status: 0, data: null, error: "Request failed" };
  }
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" | "danger" | "neutral" }) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-danger"
          : "text-ink";
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 py-1.5 last:border-0">
      <span className="text-[12px] text-muted">{label}</span>
      <span className={"text-right text-[12px] font-semibold " + toneClass}>{value}</span>
    </div>
  );
}

/**
 * Read-only honesty panel. Surfaces the experimental nature of the fraud model
 * and the real (possibly unavailable) state of external integrations.
 */
export function IntegrationStatus() {
  const [fraud, setFraud] = useState<LoadState<FraudModelStatus>>({ status: "idle", data: null, error: null });
  const [notif, setNotif] = useState<LoadState<NotificationsStatus>>({ status: "idle", data: null, error: null });
  const [registry, setRegistry] = useState<LoadState<RegistryStatus>>({ status: "idle", data: null, error: null });
  const [storage, setStorage] = useState<LoadState<StorageStatus>>({ status: "idle", data: null, error: null });

  useEffect(() => {
    let alive = true;
    async function load() {
      const [f, n, r, s] = await Promise.all([
        getJson<FraudModelStatus>("/api/v1/ai/fraud/model-status"),
        getJson<NotificationsStatus>("/api/v1/system/notifications"),
        getJson<RegistryStatus>("/api/v1/system/registry"),
        getJson<StorageStatus>("/api/v1/system/storage"),
      ]);
      if (!alive) return;
      setFraud({ status: f.data ? "ok" : "error", data: f.data, error: f.error });
      setNotif({ status: n.data ? "ok" : "error", data: n.data, error: n.error });
      setRegistry({ status: r.data ? "ok" : "error", data: r.data, error: r.error });
      setStorage({ status: s.data ? "ok" : "error", data: s.data, error: s.error });
    }
    void load();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-[14px] border border-border bg-surface p-4">
        <div className="mb-2 flex items-center gap-2">
          <Icon name="BrainCircuit" size={15} />
          <h3 className="td-h3">Fraud model</h3>
        </div>
        {fraud.status === "error" ? (
          <p className="text-[12px] text-muted">Unavailable: {fraud.error}</p>
        ) : fraud.data ? (
          <div>
            <Row label="Name" value={fraud.data.name ?? "—"} />
            <Row label="Version" value={fraud.data.version ?? "—"} />
            <Row
              label="Mode"
              value={fraud.data.mode ?? "—"}
              tone={fraud.data.mode === "experimental" ? "warning" : "neutral"}
            />
            <Row label="Training data" value={fraud.data.training_data ?? "—"} tone="warning" />
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              {fraud.data.disclaimer ?? "Experimental model — not production-trained."}
            </p>
          </div>
        ) : (
          <p className="text-[12px] text-muted">Loading…</p>
        )}
      </div>

      <div className="rounded-[14px] border border-border bg-surface p-4">
        <div className="mb-2 flex items-center gap-2">
          <Icon name="Bell" size={15} />
          <h3 className="td-h3">Notifications</h3>
        </div>
        {notif.status === "error" ? (
          <p className="text-[12px] text-muted">Unavailable: {notif.error}</p>
        ) : notif.data ? (
          <div>
            <Row
              label="Enabled"
              value={notif.data.enabled ? "Yes" : "No"}
              tone={notif.data.enabled ? "success" : "warning"}
            />
            <Row label="Provider" value={notif.data.provider ?? "—"} />
            <Row
              label="SMTP configured"
              value={notif.data.smtp_configured ? "Yes" : "No"}
              tone={notif.data.smtp_configured ? "success" : "warning"}
            />
            <p className="mt-2 text-[11px] leading-relaxed text-muted">{notif.data.note}</p>
          </div>
        ) : (
          <p className="text-[12px] text-muted">Loading…</p>
        )}
      </div>

      <div className="rounded-[14px] border border-border bg-surface p-4">
        <div className="mb-2 flex items-center gap-2">
          <Icon name="Layers" size={15} />
          <h3 className="td-h3">Registry checks</h3>
        </div>
        {registry.status === "error" ? (
          <p className="text-[12px] text-muted">Unavailable: {registry.error}</p>
        ) : registry.data ? (
          <div>
            <Row
              label="Active provider"
              value={registry.data.active_provider ?? "—"}
              tone={registry.data.active_provider === "live" ? "success" : "warning"}
            />
            {registry.data.sources &&
              Object.entries(registry.data.sources).map(([key, src]) => (
                <Row
                  key={key}
                  label={key}
                  value={src.status ?? "—"}
                  tone={src.status === "available" ? "success" : "warning"}
                />
              ))}
            <p className="mt-2 text-[11px] leading-relaxed text-muted">{registry.data.note}</p>
          </div>
        ) : (
          <p className="text-[12px] text-muted">Loading…</p>
        )}
      </div>

      <div className="rounded-[14px] border border-border bg-surface p-4">
        <div className="mb-2 flex items-center gap-2">
          <Icon name="FolderOpen" size={15} />
          <h3 className="td-h3">Storage</h3>
        </div>
        {storage.status === "error" ? (
          <p className="text-[12px] text-muted">Unavailable: {storage.error}</p>
        ) : storage.data ? (
          <div>
            <Row
              label="Backend"
              value={storage.data.backend ?? "—"}
              tone={storage.data.backend === "s3" ? "success" : "neutral"}
            />
            <Row
              label="Configured"
              value={storage.data.configured ? "Yes" : "No"}
              tone={storage.data.configured ? "success" : "warning"}
            />
            <Row label="Provider" value={storage.data.provider ?? "—"} />
          </div>
        ) : (
          <p className="text-[12px] text-muted">Loading…</p>
        )}
      </div>
    </div>
  );
}
