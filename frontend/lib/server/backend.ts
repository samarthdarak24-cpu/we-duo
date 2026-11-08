// ---------------------------------------------------------------------------
// Server-side proxy for Python backend endpoints that require a *user* identity.
//
// The additive intelligence service (lib/server/intelligence.ts) is protected by
// the service token (or a signed service JWT). That token carries
// `sub: "service:nextjs"` and has NO user row, so it cannot satisfy the
// Python `current_user` / `require_role` guards that back these endpoints
// (see backend/app/security.py::current_user and backend/app/routers/v1.py).
//
// Those guards read the `Authorization: Bearer <user JWT>` header and look the
// caller up by `sub`, so a Next.js proxy must forward the logged-in seller's
// own session token. We read the same `td_token` httpOnly cookie that
// lib/server/http.ts::getAuth uses and forward it as a bearer token. This is the
// single source of truth that proves the forwarding decision.
// ---------------------------------------------------------------------------
import { readCookie } from "./http";
import { LOCAL_ENGINE, localBackendFallback } from "./backend-local";

export interface BackendProxyResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  /** Which runtime actually answered: "python-intelligence" or LOCAL_ENGINE. */
  engine?: string;
}

function baseUrl(): string {
  return (process.env.TD_INTELLIGENCE_URL ?? "").replace(/\/$/, "");
}

function timeoutMs(): number {
  const raw = Number(process.env.TD_INTELLIGENCE_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? Math.min(Math.max(raw, 1_000), 180_000) : 90_000;
}

/**
 * When the additive Python service is absent or unreachable, run the same real
 * operation locally against the shared database instead of returning a bare
 * 502. Only paths with a local adapter are handled; anything else still reports
 * the transport failure honestly. Every local payload names its engine.
 */
function fallback<T>(pathname: string, method: string, body: unknown,
                     token: string): BackendProxyResult<T> | null {
  const local = localBackendFallback(pathname, method, body, token);
  if (!local) return null;
  const ok = local.status >= 200 && local.status < 300;
  const detail = !ok && local.body && typeof local.body === "object"
    ? String((local.body as { reason?: string; error?: string }).reason
      ?? (local.body as { error?: string }).error ?? `Local adapter returned ${local.status}.`)
    : null;
  return {
    ok,
    status: local.status,
    data: (local.body as T) ?? null,
    error: detail,
    engine: LOCAL_ENGINE,
  };
}

/** Raw user bearer token from the incoming session cookie (null if absent). */
export function userBearer(req: Request): string | null {
  const token = readCookie(req, "td_token");
  return token || null;
}

/**
 * Proxy a request to the Python service AS the authenticated user.
 * Returns the upstream JSON and HTTP status verbatim — never invents a success
 * body when the upstream failed.
 */
export async function callBackendAsUser<T>(
  pathname: string,
  token: string,
  body: unknown,
  options: { method?: "GET" | "POST" | "PATCH"; timeout?: number } = {}
): Promise<BackendProxyResult<T>> {
  const base = baseUrl();
  const method = options.method ?? "POST";
  if (!base) {
    const local = fallback<T>(pathname, method, body, token);
    if (local) return local;
    return {
      ok: false,
      status: 0,
      data: null,
      error: "TD_INTELLIGENCE_URL is not configured; the backend service was not called.",
    };
  }
  try {
    const res = await fetch(`${base}${pathname}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
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
      if (res.status >= 500) {
        const local = fallback<T>(pathname, method, body, token);
        if (local) return local;
      }
      const detail =
        json && typeof json === "object" && "detail" in json
          ? String((json as { detail: unknown }).detail)
          : `Backend returned HTTP ${res.status}.`;
      return { ok: false, status: res.status, data: null, error: detail,
        engine: "python-intelligence" };
    }
    return { ok: true, status: res.status, data: (json as T) ?? null, error: null,
      engine: "python-intelligence" };
  } catch (err) {
    const local = fallback<T>(pathname, method, body, token);
    if (local) return local;
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 0,
      data: null,
      error: `Backend unreachable: ${message}`,
    };
  }
}
