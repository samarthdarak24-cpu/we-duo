// ---------------------------------------------------------------------------
// Client-side fetch helper for the portal widgets.
//
// Portal pages are only rendered for a real, verified session (see
// lib/server/session.ts). There is NO anonymous "demo account" fallback and the
// workspace is NOT read-only: every action below writes to the shared SQLite
// database through the Next.js API routes. The only way a write is rejected
// with 401 is an expired/revoked session, so the copy says exactly that.
//
// To stop an expired access token from silently breaking a seller/buyer action,
// both `apiCall` and the global `installSessionRecovery` wrapper refresh the
// httpOnly session cookie once and retry the original request.
// ---------------------------------------------------------------------------

export const SIGN_IN_REQUIRED =
  "Your session expired, so this change was not saved. Sign in again and retry.";

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  message: string;
  needsSignIn: boolean;
}

const REFRESH_URL = "/api/v1/auth/refresh";

/** Rotate the access cookie at most once, even if several calls fail together. */
let refreshInFlight: Promise<boolean> | null = null;

export function refreshSession(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (!refreshInFlight) {
    refreshInFlight = fetch(REFRESH_URL, { method: "POST", credentials: "same-origin" })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/** True only for same-origin product API calls (never auth endpoints). */
function isRecoverable(url: string): boolean {
  if (!url.startsWith("/api/v1/")) return false;
  return !url.startsWith("/api/v1/auth/");
}

/** A body can only be replayed safely when it is a string or absent. */
function canReplay(input: RequestInfo | URL, init?: RequestInit): boolean {
  // A Request object consumes its stream on the first send; never replay it.
  if (typeof Request !== "undefined" && input instanceof Request && input.method !== "GET" && input.method !== "HEAD") {
    return false;
  }
  if (!init?.body) return true;
  return typeof init.body === "string" || init.body instanceof URLSearchParams;
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/**
 * Run a request, refreshing an expired session once and replaying the exact
 * same call. Only JSON/no-body actions are replayed; multipart uploads keep
 * the honest 401 so the user can re-submit the file after signing in.
 */
let globalRecoveryInstalled = false;

async function fetchWithRecovery(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // When the app-wide wrapper is mounted, plain fetch already recovers.
  if (globalRecoveryInstalled) return fetch(input, init);
  const res = await fetch(input, init);
  const url = urlOf(input);
  if (res.status !== 401 || !isRecoverable(url) || !canReplay(input, init)) return res;
  if (!(await refreshSession())) return res;
  return fetch(input, init);
}

/** Perform a request and translate transport/auth failures into honest copy. */
export async function apiCall<T>(
  url: string,
  init?: RequestInit,
  fallback = "The server did not accept that change."
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetchWithRecovery(url, init);
  } catch {
    return { ok: false, status: 0, message: "Network error — nothing was saved.", needsSignIn: false };
  }

  const body = (await res.json().catch(() => ({}))) as {
    data?: T;
    error?: { code?: string; message?: string };
  };

  if (res.ok) return { ok: true, status: res.status, data: body.data, message: "", needsSignIn: false };

  const needsSignIn = res.status === 401 || body.error?.code === "UNAUTHENTICATED";
  const forbidden = res.status === 403 || body.error?.code === "FORBIDDEN_ROLE";
  const message = needsSignIn
    ? SIGN_IN_REQUIRED
    : forbidden
      ? "Your account is not allowed to change this record."
      : body.error?.message || fallback;

  return { ok: false, status: res.status, message, needsSignIn };
}

/**
 * Install one fetch wrapper for the whole app so components that call `fetch`
 * directly (saved vehicles, inquiries, uploads, notifications, settings, …)
 * also recover from an expired session instead of appearing broken.
 * Idempotent: mounting several times never stacks wrappers.
 */
export function installSessionRecovery(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { __tdSessionRecovery?: boolean };
  if (w.__tdSessionRecovery) return;
  w.__tdSessionRecovery = true;
  globalRecoveryInstalled = true;

  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const res = await original(input, init);
    const url = urlOf(input);
    if (res.status !== 401 || !isRecoverable(url) || !canReplay(input, init)) return res;
    // Use `original`, not the wrapper, so the refresh call cannot recurse.
    if (!(await refreshSession())) return res;
    return original(input, init);
  };
}

/** Sign-in link markup for an inline alert; callers render it beside the message. */
export function signInHref(): string {
  const here = typeof window === "undefined" ? "/" : window.location.pathname + window.location.search;
  return `/login?next=${encodeURIComponent(here.replace(/^\/(seller|buyer|admin)/, ""))}`;
}
