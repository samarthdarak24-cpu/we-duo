// ---------------------------------------------------------------------------
// Idempotency-Key support (design.md §12): uploads, publishing, verification
// runs and report generation may be retried safely by a client. The first
// completed response is stored and replayed for the same key + scope.
// ---------------------------------------------------------------------------
import { NextResponse } from "next/server";
import { one, run } from "./db";

interface StoredResponse {
  status_code: number;
  response: string;
}

export async function withIdempotency(
  req: Request,
  scope: string,
  handler: () => Promise<Response> | Response
): Promise<Response> {
  const raw = req.headers.get("idempotency-key")?.trim();
  if (!raw) return handler();
  if (raw.length < 8 || raw.length > 200) {
    return NextResponse.json(
      { error: { code: "INVALID_IDEMPOTENCY_KEY", message: "Idempotency-Key must be 8–200 characters." } },
      { status: 400 }
    );
  }
  const key = `${scope}:${raw}`;
  const existing = one<StoredResponse>("SELECT status_code, response FROM idempotency_keys WHERE key = ?", key);
  if (existing) {
    let payload: unknown;
    try {
      payload = JSON.parse(existing.response);
    } catch {
      payload = { data: null };
    }
    return NextResponse.json(payload, {
      status: existing.status_code,
      headers: { "Idempotent-Replay": "true" },
    });
  }

  const response = await handler();
  if (response.status < 500) {
    try {
      const text = await response.clone().text();
      run(
        "INSERT OR REPLACE INTO idempotency_keys (key, scope, status_code, response, created_at) VALUES (?,?,?,?,?)",
        key,
        scope,
        response.status,
        text,
        new Date().toISOString()
      );
    } catch {
      // Storage is best-effort: never fail the original request because a
      // replay record could not be written.
    }
  }
  return response;
}
