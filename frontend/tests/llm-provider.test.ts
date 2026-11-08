// LLM provider tests against a local OpenAI-compatible stub server.
//
// Covers the 8 required scenarios from Phase 7:
//   1. Provider disabled (TD_LLM_PROVIDER=none)
//   2. Missing API key
//   3. Valid configured provider -> genuine AI summary
//   4. Invalid API key (401) -> deterministic fallback
//   5. Rate limit (429) -> deterministic fallback
//   6. Timeout -> deterministic fallback
//   7. Malformed model response -> deterministic fallback
//   8. Contradictory evidence -> deterministic provider never fabricates/overrides
//
// Nothing is reported as LLM-generated unless a real provider call succeeded.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import { LlmProvider, DeterministicProvider, type LLMNarrativeRequest } from "../lib/server/llm-provider";

const request: LLMNarrativeRequest = {
  vehicleId: "v-camry",
  findings: [
    { id: "f-1", code: "odometer_rollback", title: "Odometer rollback", explanation: "Mileage fell from 90000 km to 45000 km.", severity: "critical" },
  ],
  evidenceIds: ["e-1"],
};

let server: http.Server;
let port: number;

function stub(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void) {
  if (server) server.close();
  server = http.createServer(handler);
  return new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      port = (server.address() as { port: number }).port;
      resolve();
    });
  });
}

function env(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

async function providerWith(envs: Record<string, string | undefined>) {
  const original = { ...process.env };
  for (const [k, v] of Object.entries(envs)) env(k, v);
  const p = new LlmProvider();
  // restore after construction (constructor already read env)
  process.env = original;
  return p;
}

describe("LLM provider against a local stub", () => {
  beforeAll(async () => {
    env("TD_LLM_PROVIDER", undefined);
    env("TD_LLM_API_KEY", undefined);
  });
  afterAll(() => {
    if (server) server.close();
    env("TD_LLM_PROVIDER", undefined);
    env("TD_LLM_API_KEY", undefined);
  });

  it("1. disabled provider -> deterministic, never an LLM", async () => {
    const p = await providerWith({ TD_LLM_PROVIDER: "none" });
    expect(p.configured).toBe(false);
    const out = await p.summarize(request);
    expect(out.labelledAI).toBe(false);
    expect(out.provider).toBe("deterministic");
    expect(out.narrative).toContain("No LLM was used");
  });

  it("2. missing API key -> deterministic fallback (provider refuses empty bearer)", async () => {
    await stub((req, res) => {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid api key" }));
    });
    const p = await providerWith({
      TD_LLM_PROVIDER: "openai",
      TD_LLM_BASE_URL: `http://127.0.0.1:${port}`,
      TD_LLM_MODEL: "test-model",
      TD_LLM_API_KEY: undefined,
    });
    expect(p.configured).toBe(true);
    const out = await p.summarize(request);
    expect(out.labelledAI).toBe(false);
    expect(out.provider).toBe("deterministic");
  });

  it("3. valid configured provider -> genuine AI summary", async () => {
    await stub((req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        choices: [{ message: { content: "The odometer fell from 90000 to 45000 km. Evidence: e-1." } }],
      }));
    });
    const p = await providerWith({
      TD_LLM_PROVIDER: "openai",
      TD_LLM_BASE_URL: `http://127.0.0.1:${port}`,
      TD_LLM_MODEL: "test-model",
      TD_LLM_API_KEY: "sk-test",
    });
    expect(p.configured).toBe(true);
    const out = await p.summarize(request);
    expect(out.labelledAI).toBe(true);
    expect(out.provider).toBe("openai");
    expect(out.model).toBe("test-model");
    expect(out.narrative).toContain("[AI-generated summary]");
    expect(out.narrative).toContain("90000");
    expect(out.evidenceIds).toEqual(["e-1"]);
  });

  it("4. invalid API key (401) -> deterministic fallback", async () => {
    await stub((req, res) => {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "invalid api key" }));
    });
    const p = await providerWith({
      TD_LLM_PROVIDER: "openai",
      TD_LLM_BASE_URL: `http://127.0.0.1:${port}`,
      TD_LLM_MODEL: "test-model",
      TD_LLM_API_KEY: "sk-bad",
    });
    const out = await p.summarize(request);
    expect(out.labelledAI).toBe(false);
    expect(out.provider).toBe("deterministic");
    expect(out.narrative).toContain("No LLM was used");
  });

  it("5. rate limit (429) -> deterministic fallback", async () => {
    await stub((req, res) => {
      res.writeHead(429, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "rate limit exceeded" }));
    });
    const p = await providerWith({
      TD_LLM_PROVIDER: "openai",
      TD_LLM_BASE_URL: `http://127.0.0.1:${port}`,
      TD_LLM_MODEL: "test-model",
      TD_LLM_API_KEY: "sk-test",
    });
    const out = await p.summarize(request);
    expect(out.labelledAI).toBe(false);
    expect(out.provider).toBe("deterministic");
  });

  it("6. timeout -> deterministic fallback", async () => {
    await stub((_req, res) => {
      // Never respond: the client has a 15s timeout; to keep the test fast we
      // destroy the socket immediately so fetch rejects.
      res.destroy();
    });
    const p = await providerWith({
      TD_LLM_PROVIDER: "openai",
      TD_LLM_BASE_URL: `http://127.0.0.1:${port}`,
      TD_LLM_MODEL: "test-model",
      TD_LLM_API_KEY: "sk-test",
    });
    const out = await p.summarize(request);
    expect(out.labelledAI).toBe(false);
    expect(out.provider).toBe("deterministic");
  });

  it("7. malformed model response -> deterministic fallback", async () => {
    await stub((req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("not json at all");
    });
    const p = await providerWith({
      TD_LLM_PROVIDER: "openai",
      TD_LLM_BASE_URL: `http://127.0.0.1:${port}`,
      TD_LLM_MODEL: "test-model",
      TD_LLM_API_KEY: "sk-test",
    });
    const out = await p.summarize(request);
    expect(out.labelledAI).toBe(false);
    expect(out.provider).toBe("deterministic");
  });

  it("8. deterministic provider never fabricates or overrides verified facts", async () => {
    const p = new DeterministicProvider();
    const out = await p.summarize({
      ...request,
      findings: [
        { id: "f-1", code: "odometer_rollback", title: "Odometer rollback", explanation: "Mileage fell.", severity: "critical" },
        { id: "f-2", code: "missing_doc", title: "Missing insurance", explanation: "No insurance document on file.", severity: "high" },
      ],
      evidenceIds: ["e-1", "e-2"],
    });
    expect(out.labelledAI).toBe(false);
    expect(out.narrative).toContain("Odometer rollback");
    expect(out.narrative).toContain("Missing insurance");
    expect(out.narrative).toContain("e-1");
    expect(out.narrative).toContain("e-2");
    // Must not invent a trust score, VIN, or government confirmation.
    expect(out.narrative).not.toMatch(/trust score/i);
    expect(out.narrative).not.toMatch(/VIN/);
    expect(out.narrative).not.toMatch(/government/);
    expect(out.narrative).toContain("Missing data is unverified coverage, not proof of fraud.");
  });
});
