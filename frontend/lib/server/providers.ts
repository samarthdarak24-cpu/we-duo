// ---------------------------------------------------------------------------
// External registry / vehicle-data provider adapters (Phase 11).
//
// SINGLE IMPLEMENTATION RULE: the provider adapters themselves live in the
// Python service (`backend/app/integrations/registry.py`), which owns consent
// handling, rate limiting, provenance, audit logging and the provider request
// mapping. This module is the Next.js-side client for that service — it does
// NOT open its own HTTP connection to VAHAN, an insurer or a theft registry,
// because a second implementation would drift from the first and would not
// share its consent and audit guarantees.
//
// Absent configuration => `unavailable`, never `clean` or `verified`. A
// configured source whose lookup fails is `blocked`, never `available`.
// ---------------------------------------------------------------------------
import { callBackendAsUser } from "./backend";

export interface ProviderResult {
  source: string;
  status: "available" | "blocked" | "unavailable";
  data?: Record<string, unknown>;
  provenance?: string;
  error?: string;
  audited: boolean;
}

export interface RegistryProvider {
  name: string;
  configured: boolean;
  check(vehicleId: string, identifier: string, token?: string | null): Promise<ProviderResult>;
}

/** Environment per source, mirroring the backend's ProviderConfig. */
function sourceConfig(source: string): { url: string | null; token: string | null } {
  const upper = source.toUpperCase();
  const url =
    process.env[`TD_${upper}_BASE_URL`] ??
    process.env[`TD_${upper}_URL`] ??
    process.env.TD_PROVIDER_URL ??
    null;
  const token =
    process.env[`TD_${upper}_TOKEN`] ?? process.env.TD_PROVIDER_TOKEN ?? null;
  return { url, token };
}

/** One adapter per external source. */
class ConfiguredSourceProvider implements RegistryProvider {
  name: string;
  configured: boolean;

  constructor(name: string) {
    this.name = name;
    const { url, token } = sourceConfig(name);
    this.configured = Boolean(url && token);
  }

  async check(vehicleId: string, identifier: string, token?: string | null): Promise<ProviderResult> {
    if (!this.configured) {
      return { source: this.name, status: "unavailable", audited: false };
    }
    if (!token) {
      // A registry lookup is performed on behalf of a signed-in user and needs
      // that user's consent. Without a session we must not call anything.
      return {
        source: this.name,
        status: "unavailable",
        error: "A user session is required before an external registry can be queried.",
        audited: false,
      };
    }
    const res = await callBackendAsUser<{
      outcome: string;
      record: Record<string, unknown> | null;
      reason?: string | null;
      provenance?: string;
      audited?: boolean;
      verified?: boolean;
    }>(
      "/api/v1/registry/lookup",
      token,
      { source: this.name, reg_no: identifier, vehicle_id: vehicleId },
      { method: "POST" }
    );

    if (!res.ok || !res.data) {
      return {
        source: this.name,
        status: "unavailable",
        error: res.error ?? "The registry service did not answer.",
        audited: false,
      };
    }
    const body = res.data;
    const audited = body.audited !== false;
    if (body.outcome === "ok") {
      return {
        source: this.name,
        status: "available",
        data: body.record ?? undefined,
        provenance: body.provenance ?? `${this.name}-provider`,
        audited,
      };
    }
    // Every non-`ok` outcome (blocked, consent_required, rate_limited,
    // provider_error, timeout, not_found) is a failure to verify. It is
    // reported as such — never as an available or verified source.
    return {
      source: this.name,
      status: "blocked",
      error: body.reason ?? `Lookup outcome: ${body.outcome}`,
      audited,
    };
  }
}

export class VahanProvider extends ConfiguredSourceProvider {
  constructor() {
    super("vahan");
  }
}

export class InsurerProvider extends ConfiguredSourceProvider {
  constructor() {
    super("insurer");
  }
}

export class TheftProvider extends ConfiguredSourceProvider {
  constructor() {
    super("theft");
  }
}

let _providers: RegistryProvider[] | null = null;

export function getRegistryProviders(): RegistryProvider[] {
  if (_providers) return _providers;
  _providers = [new VahanProvider(), new InsurerProvider(), new TheftProvider()];
  return _providers;
}

export function getRegistryStatus() {
  const vahan = new VahanProvider();
  const insurer = new InsurerProvider();
  const theft = new TheftProvider();
  const status = (p: RegistryProvider) => ({
    status: p.configured ? ("available" as const) : ("unavailable" as const),
    configured: p.configured,
  });
  return {
    vahan: status(vahan),
    insurer: status(insurer),
    theft: status(theft),
    note: "Provider availability reflects configuration only. A configured source still reports `blocked` for every lookup that does not succeed.",
  };
}

export async function checkAllProviders(
  vehicleId: string,
  identifier: string,
  token?: string | null
): Promise<ProviderResult[]> {
  const results: ProviderResult[] = [];
  for (const p of getRegistryProviders()) {
    results.push(await p.check(vehicleId, identifier, token));
  }
  return results;
}
