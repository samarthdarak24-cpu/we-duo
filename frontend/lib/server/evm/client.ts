// ---------------------------------------------------------------------------
// Minimal JSON-RPC 2.0 client for EVM chains (Phase 10 — optional on-chain
// document anchoring).
//
// Scope: one HTTP endpoint, one request at a time, hard timeout, typed errors.
// No batching, no websocket, no wallet logic. Plain `fetch` keeps the adapter
// usable inside the Next.js server runtime without a node-only transport.
//
// HONESTY: this client talks to whatever RPC URL the operator configures. It
// cannot tell a public testnet from a local stub — that distinction belongs to
// the caller. Nothing in this file claims an anchor exists; it only reports
// what the endpoint answered.
// ---------------------------------------------------------------------------

export const DEFAULT_TIMEOUT_MS = 15_000;

/** A JSON-RPC error object returned by the node (the call itself succeeded). */
export class EvmRpcError extends Error {
  readonly code: number;
  readonly method: string;
  readonly data: unknown;

  constructor(message: string, opts: { code: number; method: string; data?: unknown }) {
    super(message);
    this.name = "EvmRpcError";
    this.code = opts.code;
    this.method = opts.method;
    this.data = opts.data;
  }
}

/** The endpoint could not be reached (DNS, refused connection, reset, 5xx). */
export class EvmNetworkError extends Error {
  readonly method: string;
  readonly cause?: unknown;

  constructor(message: string, opts: { method: string; cause?: unknown }) {
    super(message);
    this.name = "EvmNetworkError";
    this.method = opts.method;
    this.cause = opts.cause;
  }
}

/** The endpoint did not answer within the configured timeout. */
export class EvmTimeoutError extends Error {
  readonly method: string;
  readonly timeoutMs: number;

  constructor(message: string, opts: { method: string; timeoutMs: number }) {
    super(message);
    this.name = "EvmTimeoutError";
    this.method = opts.method;
    this.timeoutMs = opts.timeoutMs;
  }
}

export interface EvmLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber?: string | null;
  transactionHash?: string | null;
  transactionIndex?: string | null;
  logIndex?: string | null;
  removed?: boolean;
}

export interface EvmReceipt {
  transactionHash: string;
  /** "0x1" = success, "0x0" = reverted, null = unknown (pre-Byzantium nodes). */
  status: string | null;
  blockNumber: string | null;
  blockHash: string | null;
  from?: string;
  to?: string;
  gasUsed?: string | null;
  cumulativeGasUsed?: string | null;
  logs?: EvmLog[];
}

export interface EvmCallRequest {
  from?: string;
  to: string;
  data?: string;
  value?: string;
}

export interface EvmRpcClientOptions {
  /** Full JSON-RPC endpoint, e.g. https://sepolia.infura.io/v3/<key>. */
  url: string;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
  /** Injection point for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
}

/** `0x`-prefixed hex → bigint. Returns null for anything unparsable. */
export function hexToBigInt(value: string | null | undefined): bigint | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("0x") || trimmed.length < 3) return null;
  try {
    return BigInt(trimmed);
  } catch {
    return null;
  }
}

/** bigint → minimal `0x`-prefixed hex (no leading zeros). */
export function bigIntToHex(value: bigint): string {
  return `0x${value.toString(16)}`;
}

function describeCause(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as { code?: string }).code;
    return code ? `${err.message} (${code})` : err.message;
  }
  return String(err);
}

/**
 * A tiny JSON-RPC 2.0 client. Every failure mode is a distinct, typed error so
 * the anchoring layer can report *why* an anchor did not happen instead of
 * pretending it did.
 */
export class EvmRpcClient {
  readonly url: string;
  readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private nextId = 1;

  constructor(opts: EvmRpcClientOptions) {
    this.url = opts.url;
    this.timeoutMs = Math.max(1, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    if (typeof this.fetchImpl !== "function") {
      throw new Error("EvmRpcClient requires a fetch implementation.");
    }
  }

  /** Perform one JSON-RPC call. Throws EvmRpcError / EvmNetworkError / EvmTimeoutError. */
  async call<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    const payload = JSON.stringify({ jsonrpc: "2.0", id: this.nextId++, method, params });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new EvmTimeoutError(`JSON-RPC ${method} timed out after ${this.timeoutMs}ms`, {
          method,
          timeoutMs: this.timeoutMs,
        });
      }
      throw new EvmNetworkError(`JSON-RPC ${method} failed: ${describeCause(err)}`, {
        method,
        cause: err,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      throw new EvmNetworkError(
        `JSON-RPC ${method} returned HTTP ${response.status} ${response.statusText}`,
        { method },
      );
    }

    let body: JsonRpcResponse;
    try {
      body = (await response.json()) as JsonRpcResponse;
    } catch (err) {
      throw new EvmNetworkError(`JSON-RPC ${method} returned a non-JSON body`, {
        method,
        cause: err,
      });
    }

    if (body?.error) {
      const code = typeof body.error.code === "number" ? body.error.code : -1;
      const message = body.error.message ?? "Unknown JSON-RPC error";
      throw new EvmRpcError(message, { code, method, data: body.error.data });
    }

    return body?.result as T;
  }

  // ---- Typed wrappers ------------------------------------------------------

  async chainId(): Promise<number> {
    const raw = await this.call<string>("eth_chainId");
    const value = hexToBigInt(raw);
    if (value === null) throw new EvmRpcError("eth_chainId returned a non-hex value", { code: -1, method: "eth_chainId" });
    return Number(value);
  }

  async blockNumber(): Promise<bigint> {
    const raw = await this.call<string>("eth_blockNumber");
    const value = hexToBigInt(raw);
    if (value === null) throw new EvmRpcError("eth_blockNumber returned a non-hex value", { code: -1, method: "eth_blockNumber" });
    return value;
  }

  async getTransactionCount(address: string, block: "latest" | "pending" = "pending"): Promise<bigint> {
    const raw = await this.call<string>("eth_getTransactionCount", [address, block]);
    const value = hexToBigInt(raw);
    if (value === null) {
      throw new EvmRpcError("eth_getTransactionCount returned a non-hex value", {
        code: -1,
        method: "eth_getTransactionCount",
      });
    }
    return value;
  }

  async gasPrice(): Promise<bigint> {
    const raw = await this.call<string>("eth_gasPrice");
    const value = hexToBigInt(raw);
    if (value === null) throw new EvmRpcError("eth_gasPrice returned a non-hex value", { code: -1, method: "eth_gasPrice" });
    return value;
  }

  async maxPriorityFeePerGas(): Promise<bigint> {
    const raw = await this.call<string>("eth_maxPriorityFeePerGas");
    const value = hexToBigInt(raw);
    if (value === null) {
      throw new EvmRpcError("eth_maxPriorityFeePerGas returned a non-hex value", {
        code: -1,
        method: "eth_maxPriorityFeePerGas",
      });
    }
    return value;
  }

  async estimateGas(tx: EvmCallRequest): Promise<bigint> {
    const raw = await this.call<string>("eth_estimateGas", [tx]);
    const value = hexToBigInt(raw);
    if (value === null) {
      throw new EvmRpcError("eth_estimateGas returned a non-hex value", { code: -1, method: "eth_estimateGas" });
    }
    return value;
  }

  async sendRawTransaction(rawTx: string): Promise<string> {
    const hash = await this.call<string>("eth_sendRawTransaction", [rawTx]);
    if (typeof hash !== "string" || !hash.startsWith("0x")) {
      throw new EvmRpcError("eth_sendRawTransaction did not return a transaction hash", {
        code: -1,
        method: "eth_sendRawTransaction",
      });
    }
    return hash;
  }

  async getTransactionReceipt(txHash: string): Promise<EvmReceipt | null> {
    const receipt = await this.call<EvmReceipt | null>("eth_getTransactionReceipt", [txHash]);
    return receipt ?? null;
  }

  async ethCall(tx: EvmCallRequest, block: "latest" | "pending" = "latest"): Promise<string> {
    const raw = await this.call<string>("eth_call", [tx, block]);
    if (typeof raw !== "string") {
      throw new EvmRpcError("eth_call did not return hex data", { code: -1, method: "eth_call" });
    }
    return raw;
  }
}
