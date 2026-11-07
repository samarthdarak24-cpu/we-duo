// ---------------------------------------------------------------------------
// Server-side client for the additive Python intelligence service.
//
// The Next.js app stays the system of record for portals, REST and the shared
// database. This client only calls optional intelligence endpoints (OCR,
// investigation, damage analysis) and is always labelled with the engine that
// actually answered. When the service is not configured or unreachable the
// caller must degrade honestly instead of inventing a result.
// ---------------------------------------------------------------------------
import { signServiceToken } from "./auth";

export interface IntelligenceResponse<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

function baseUrl(): string {
  return (process.env.TD_INTELLIGENCE_URL ?? "").replace(/\/$/, "");
}

function timeoutMs(): number {
  const raw = Number(process.env.TD_INTELLIGENCE_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? Math.min(Math.max(raw, 1_000), 180_000) : 90_000;
}

function authHeaders(): Record<string, string> {
  // SEC-002: the service never accepts anonymous intelligence calls. Prefer the
  // configured static service token, otherwise mint a short-lived service JWT.
  return process.env.TD_SERVICE_TOKEN
    ? { "X-Service-Token": process.env.TD_SERVICE_TOKEN }
    : { Authorization: `Bearer ${signServiceToken()}` };
}

export function intelligenceConfigured(): boolean {
  return baseUrl().length > 0;
}

export async function callIntelligence<T>(
  pathname: string,
  body: unknown,
  options: { method?: "GET" | "POST"; timeout?: number } = {}
): Promise<IntelligenceResponse<T>> {
  const base = baseUrl();
  if (!base) {
    return {
      ok: false,
      status: 0,
      data: null,
      error: "TD_INTELLIGENCE_URL is not configured; the intelligence service was not called.",
    };
  }
  try {
    const res = await fetch(`${base}${pathname}`, {
      method: options.method ?? "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: options.method === "GET" ? undefined : JSON.stringify(body ?? {}),
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeout ?? timeoutMs()),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const detail =
        json && typeof json === "object" && "detail" in json
          ? String((json as { detail: unknown }).detail)
          : `Intelligence service returned HTTP ${res.status}.`;
      return { ok: false, status: res.status, data: null, error: detail };
    }
    return { ok: true, status: res.status, data: (json as T) ?? null, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 0,
      data: null,
      error: `Intelligence service unreachable: ${message}`,
    };
  }
}
