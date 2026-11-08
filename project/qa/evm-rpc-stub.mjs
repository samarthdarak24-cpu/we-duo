#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Local JSON-RPC 2.0 stub for a single EVM chain.
//
// PURPOSE: a real HTTP endpoint used ONLY by frontend/tests/evm-anchoring.test.ts
// to exercise the encode -> sign -> submit -> receipt -> readback -> compare
// path of the anchoring adapter. It is NOT a blockchain: no consensus, no
// blocks are mined, no funds exist, nothing is persisted.
//
// It DOES decode the raw signed transaction it receives (via viem's
// `parseTransaction`), decode the registry calldata and record the digest, so
// a test can assert that the bytes32 actually placed on the wire are the
// document's SHA-256 digest.
//
// It also decodes `eth_call` requests and answers from the recorded digests,
// so the readback path is genuinely exercised.
//
// NOT PROVEN: this stub proves the adapter's plumbing only. It does not prove
// that anchoring works against a public testnet, and no on-chain anchor has
// ever been produced by this repository.
//
// USAGE
//   node project/qa/evm-rpc-stub.mjs --port 8545 [--chain-id 31337]
//
// MODES (query string on the RPC URL)
//   ?fail=revert   -> mined receipt with status 0x0 (reverted)
//   ?fail=nonce    -> JSON-RPC error "nonce too low: replacement transaction underpriced"
//   ?fail=funds    -> JSON-RPC error "insufficient funds for gas * price + value"
//   ?down=1        -> accepts the connection but never answers (client timeout)
// ---------------------------------------------------------------------------
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// viem lives in frontend/node_modules (the workspace root has no node_modules),
// so resolve it explicitly against frontend/package.json.
const requireFrontend = createRequire(path.join(here, "..", "..", "frontend", "package.json"));
const {
  decodeAbiParameters,
  decodeFunctionData,
  encodeAbiParameters,
  encodeFunctionResult,
  keccak256,
  parseAbi,
  parseAbiParameters,
  parseTransaction,
  toBytes,
} = requireFrontend("viem");

const REGISTRY_ABI = parseAbi([
  "function anchor(bytes32 docHash, string metadata)",
  "function getHash(uint256 index) view returns (bytes32)",
  "function getDocHash(bytes32 docHash) view returns (bytes32, string, uint64)",
  "function count() view returns (uint256)",
  "function indexOf(bytes32 docHash) view returns (uint256)",
  "event Anchored(bytes32 indexed docHash, uint256 indexed index, string metadata, uint64 timestamp)",
]);

const ANCHORED_EVENT_TOPIC = keccak256(toBytes("Anchored(bytes32,uint256,string,uint64)"));

/** Normalise an address to a 0x-prefixed 20-byte hex string. */
function addr(value) {
  if (!value) return "0x";
  const raw = String(value).toLowerCase();
  const hexPart = raw.startsWith("0x") ? raw.slice(2) : raw;
  return `0x${hexPart.slice(-40)}`;
}

// ---- CLI args ---------------------------------------------------------------
const args = process.argv.slice(2);
function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  if (index >= 0 && args[index + 1] !== undefined) return args[index + 1];
  const inline = args.find((a) => a.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  return fallback;
}
const PORT = Number(argValue("--port", "8545"));
const HOST = argValue("--host", "127.0.0.1");
const CHAIN_ID = Number(argValue("--chain-id", "31337"));

// ---- Chain state ------------------------------------------------------------
const state = {
  chainId: CHAIN_ID,
  blockNumber: 0n,
  nonces: new Map(),
  /** digest records, 1-based index like the contract */
  records: [],
  transactions: new Map(),
};

function hex(value) {
  return `0x${value.toString(16)}`;
}

function ok(value) {
  return { value };
}
function fail(code, message, data) {
  return { error: { code, message, data } };
}

/** Read the mode flags from the request URL (path + query). */
function modeFrom(url) {
  const raw = String(url || "");
  const query = raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : "";
  const params = new URLSearchParams(query);
  if (params.get("down") === "1") return "down";
  const failMode = params.get("fail");
  if (failMode) return failMode;
  return "default";
}

function anchorIndexOf(digest) {
  for (const record of state.records) {
    if (record.hash.toLowerCase() === String(digest).toLowerCase()) return record.index;
  }
  return 0;
}

function handleCall(data) {
  const decoded = decodeFunctionData({ abi: REGISTRY_ABI, data });
  switch (decoded.functionName) {
    case "getDocHash": {
      const [digest] = decoded.args;
      const index = anchorIndexOf(digest);
      if (!index) {
        return fail(3, "execution reverted: unknown hash");
      }
      const record = state.records.find((r) => r.index === index);
      const encoded = encodeFunctionResult({
        abi: REGISTRY_ABI,
        functionName: "getDocHash",
        result: [record.hash, record.metadata, BigInt(record.timestamp)],
      });
      return ok(encoded);
    }
    case "getHash": {
      const [index] = decoded.args;
      const record = state.records.find((r) => r.index === Number(index));
      if (!record) return fail(3, "execution reverted: index out of range");
      const encoded = encodeFunctionResult({
        abi: REGISTRY_ABI,
        functionName: "getHash",
        // Single-output function: viem expects the value itself, not an array.
        result: record.hash,
      });
      return ok(encoded);
    }
    case "count": {
      const encoded = encodeFunctionResult({
        abi: REGISTRY_ABI,
        functionName: "count",
        result: BigInt(state.records.length),
      });
      return ok(encoded);
    }
    case "indexOf": {
      const [digest] = decoded.args;
      const encoded = encodeFunctionResult({
        abi: REGISTRY_ABI,
        functionName: "indexOf",
        result: BigInt(anchorIndexOf(digest)),
      });
      return ok(encoded);
    }
    default:
      return fail(-32601, `Method not found: ${decoded.functionName}`);
  }
}

function handle(method, params, mode) {
  switch (method) {
    case "eth_chainId":
      return ok(hex(BigInt(state.chainId)));
    case "net_version":
      return ok(String(state.chainId));
    case "eth_blockNumber":
      return ok(hex(state.blockNumber));
    case "eth_gasPrice":
      return ok("0x3b9aca00"); // 1 gwei
    case "eth_maxPriorityFeePerGas":
      return ok("0x3b9aca00"); // 1 gwei
    case "eth_estimateGas":
      return ok("0x186a0"); // 100000
    case "eth_getTransactionCount": {
      const address = String(params?.[0] ?? "").toLowerCase();
      return ok(hex(state.nonces.get(address) ?? 0n));
    }
    case "eth_sendRawTransaction":
      return handleSendRawTransaction(String(params?.[0] ?? ""), mode);
    case "eth_getTransactionReceipt": {
      const hash = String(params?.[0] ?? "");
      const tx = state.transactions.get(hash.toLowerCase());
      if (!tx) return ok(null);
      return ok(tx.receipt);
    }
    case "eth_call": {
      const request = params?.[0] ?? {};
      const data = String(request.data ?? "0x");
      try {
        return handleCall(data);
      } catch (err) {
        return fail(3, `execution reverted: ${err?.message ?? "call failed"}`);
      }
    }
    case "td_stub_state":
      // Non-standard, test-only introspection of what the stub recorded.
      return ok({
        chainId: state.chainId,
        blockNumber: hex(state.blockNumber),
        records: state.records.map((r) => ({
          hash: r.hash,
          metadata: r.metadata,
          index: r.index,
          txHash: r.txHash,
          // BigInt is not JSON-serialisable — always hand out hex.
          blockNumber: hex(r.blockNumber),
          timestamp: hex(r.timestamp),
        })),
        transactions: [...state.transactions.values()].map((t) => ({
          txHash: t.txHash,
          status: t.receipt.status,
          to: t.to,
          data: t.data,
        })),
      });
    default:
      return fail(-32601, `Method not found: ${method}`);
  }
}

function handleSendRawTransaction(raw, mode) {
  if (mode === "nonce") {
    return fail(-32000, "nonce too low: replacement transaction underpriced");
  }
  if (mode === "funds") {
    return fail(-32000, "insufficient funds for gas * price + value");
  }

  let parsed;
  try {
    parsed = parseTransaction(raw);
  } catch (err) {
    return fail(-32602, `invalid raw transaction: ${err?.message ?? "unparsable"}`);
  }

  const data = parsed?.data ?? "0x";
  let decoded;
  try {
    decoded = decodeFunctionData({ abi: REGISTRY_ABI, data });
  } catch {
    return fail(-32000, "transaction data is not a DocumentHashRegistry call");
  }
  if (decoded.functionName !== "anchor") {
    return fail(-32000, `unsupported registry function: ${decoded.functionName}`);
  }

  const [digest, metadata] = decoded.args;
  if (!digest || digest === `0x${"0".repeat(64)}`) {
    return fail(-32000, "anchor called with an empty digest");
  }

  const txHash = keccak256(raw);
  const from = addr(parsed.from);
  const to = addr(parsed.to);
  const address = from.toLowerCase();
  state.nonces.set(address, (state.nonces.get(address) ?? 0n) + 1n);

  state.blockNumber += 1n;
  const status = mode === "revert" ? "0x0" : "0x1";
  const timestamp = 1_700_000_000n + state.blockNumber;

  const logs = [];
  if (status === "0x1") {
    const index = state.records.length + 1;
    state.records.push({
      hash: digest,
      metadata: String(metadata ?? ""),
      index,
      txHash,
      blockNumber: state.blockNumber,
      timestamp,
    });
    logs.push({
      address: to,
      topics: [ANCHORED_EVENT_TOPIC, digest, hex(BigInt(index))],
      data: encodeAbiParameters(parseAbiParameters("string, uint64"), [String(metadata ?? ""), timestamp]),
      blockNumber: hex(state.blockNumber),
      transactionHash: txHash,
      transactionIndex: "0x0",
      logIndex: "0x0",
      removed: false,
    });
  }

  const receipt = {
    transactionHash: txHash,
    transactionIndex: "0x0",
    blockHash: `0x${"ab".repeat(32)}`,
    blockNumber: hex(state.blockNumber),
    from,
    to,
    cumulativeGasUsed: "0x5208",
    gasUsed: "0x5208",
    effectiveGasPrice: "0x3b9aca00",
    contractAddress: null,
    logs,
    logsBloom: `0x${"00".repeat(256)}`,
    status,
    type: "0x2",
  };

  state.transactions.set(txHash.toLowerCase(), { txHash, data, to, from, receipt });
  return ok(txHash);
}

// ---- HTTP server ------------------------------------------------------------
const server = http.createServer((req, res) => {
  const mode = modeFrom(req.url);

  if (mode === "down") {
    // Accept the connection but never answer: the client must time out.
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "POST required" } }));
    return;
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    let payload = null;
    try {
      payload = JSON.parse(body || "{}");
    } catch {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }));
      return;
    }
    const id = payload?.id ?? null;
    let outcome;
    try {
      outcome = handle(String(payload?.method ?? ""), payload?.params ?? [], mode);
    } catch (err) {
      // Never let a stub bug kill the process: answer with a JSON-RPC error.
      outcome = fail(-32000, `stub failure: ${err?.message ?? String(err)}`);
    }
    res.writeHead(200, { "content-type": "application/json" });
    if (outcome.error) {
      res.end(JSON.stringify({ jsonrpc: "2.0", id, error: outcome.error }));
    } else {
      res.end(JSON.stringify({ jsonrpc: "2.0", id, result: outcome.value ?? null }));
    }
  });
});

server.listen(PORT, HOST, () => {
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : PORT;
  process.stdout.write(`EVM_RPC_STUB_PORT=${port}\n`);
  process.stdout.write(`evm-rpc-stub listening on http://${HOST}:${port} (chainId ${state.chainId})\n`);
});

process.on("SIGTERM", () => {
  server.closeAllConnections?.();
  server.close(() => process.exit(0));
});
