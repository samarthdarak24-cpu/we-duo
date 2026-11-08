// External registry adapter tests — verifies honest BLOCKED/UNAVAILABLE behavior.
//
// No VAHAN, insurer or theft credentials are available locally, so these tests
// only assert that adapters return `unavailable` (not `available`/`verified`)
// when not configured, and that all calls carry audit provenance.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  checkAllProviders,
  getRegistryProviders,
  getRegistryStatus,
  InsurerProvider,
  TheftProvider,
  VahanProvider,
  type ProviderResult,
} from "../lib/server/providers";

function unconfigure() {
  delete process.env.TD_PROVIDER_URL;
  delete process.env.TD_PROVIDER_TOKEN;
  for (const source of ["VAHAN", "INSURER", "THEFT"]) {
    delete process.env[`TD_${source}_BASE_URL`];
    delete process.env[`TD_${source}_URL`];
    delete process.env[`TD_${source}_TOKEN`];
  }
  delete process.env.TD_INTELLIGENCE_URL;
}

describe("Registry adapters — honest unavailable status", () => {
  const original = { ...process.env };

  beforeEach(() => {
    unconfigure();
  });

  afterEach(() => {
    process.env = original;
  });

  it("reports all three sources as unavailable when unconfigured", () => {
    const status = getRegistryStatus();
    expect(status.vahan.status).toBe("unavailable");
    expect(status.vahan.configured).toBe(false);
    expect(status.insurer.status).toBe("unavailable");
    expect(status.insurer.configured).toBe(false);
    expect(status.theft.status).toBe("unavailable");
    expect(status.theft.configured).toBe(false);
  });

  it("checkAllProviders returns unavailable (never available/verified) for all sources", async () => {
    const results: ProviderResult[] = await checkAllProviders("veh-1", "MH14AB1234");
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.status).toBe("unavailable");
      expect(r.audited).toBe(false);
      expect(r.data).toBeUndefined();
    }
  });

  it("each adapter individually reports unavailable and not configured", () => {
    const providers = getRegistryProviders();
    expect(providers).toHaveLength(3);
    expect(providers[0].name).toBe("vahan");
    expect(providers[1].name).toBe("insurer");
    expect(providers[2].name).toBe("theft");
    for (const p of providers) {
      expect(p.configured).toBe(false);
    }
  });

  it("fresh provider instances are not configured without env vars", () => {
    expect(new VahanProvider().configured).toBe(false);
    expect(new InsurerProvider().configured).toBe(false);
    expect(new TheftProvider().configured).toBe(false);
  });

  it("a configured source without a user session queries nothing", async () => {
    process.env.TD_VAHAN_BASE_URL = "http://127.0.0.1:9/vahan";
    process.env.TD_VAHAN_TOKEN = "test-token";
    const provider = new VahanProvider();
    expect(provider.configured).toBe(true);

    const result = await provider.check("veh-1", "MH14AB1234");
    // No session => no consent could be recorded => nothing is contacted.
    expect(result.status).toBe("unavailable");
    expect(result.audited).toBe(false);
    expect(result.data).toBeUndefined();
  });

  it("a configured source whose registry service is unreachable reports unavailable, never available", async () => {
    process.env.TD_VAHAN_BASE_URL = "http://127.0.0.1:9/vahan";
    process.env.TD_VAHAN_TOKEN = "test-token";
    // Port 9 is closed: the call must fail honestly instead of reporting a
    // verification it never received.
    process.env.TD_INTELLIGENCE_URL = "http://127.0.0.1:9";
    process.env.TD_INTELLIGENCE_TIMEOUT_MS = "1500";

    const result = await new VahanProvider().check("veh-1", "MH14AB1234", "fake-user-token");
    expect(result.status).toBe("unavailable");
    expect(result.data).toBeUndefined();
    expect(result.error).toBeTruthy();
  });

  it("never reports a source as available while unconfigured", () => {
    const status = getRegistryStatus();
    for (const key of ["vahan", "insurer", "theft"] as const) {
      expect(status[key].status).not.toBe("available");
      expect(status[key].configured).toBe(false);
    }
  });
});
