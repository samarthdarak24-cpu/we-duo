// ---------------------------------------------------------------------------
// Upload malware scanning.
//
// Order of precedence:
//   1. TD_CLAMAV_HOST — a real ClamAV daemon over the clamd INSTREAM protocol.
//      If the daemon is unreachable or times out the result is `error`; callers
//      MUST fail closed and never store/mark the upload clean.
//   2. TD_MALWARE_SCAN_URL — an HTTP scanning service.
//   3. Local signature + heuristic scan (EICAR, PDF JavaScript/Launch, Office
//      auto-open macros, download-and-run patterns, MZ headers). It is a real
//      scan, but not a full antivirus engine, and the engine name says so.
//
// A scan verdict is evidence about malware presence, never proof that a
// document is authentic.
// ---------------------------------------------------------------------------
import net from "node:net";
import { createHash } from "node:crypto";

export interface ScanResult {
  status: "clean" | "infected" | "not_configured" | "error";
  engine: string;
  detail: string;
  /** Which scanner produced the verdict. */
  scanner?: "clamd" | "http" | "local" | "none";
  /** clamd signature database version, when reported by the daemon. */
  signatureVersion?: string | null;
  durationMs?: number;
  sha256?: string;
}

// Assembled at runtime so the source file itself is not flagged by local AV.
const EICAR = [
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR",
  "-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
].join("");

const HEURISTICS: { name: string; test: (text: string) => boolean }[] = [
  { name: "pdf-javascript", test: (t) => t.includes("/JavaScript") || t.includes("/JS") },
  { name: "pdf-launch-action", test: (t) => t.includes("/Launch") },
  { name: "office-auto-open-macro", test: (t) => /AutoOpen|Auto_Open|Document_Open/i.test(t) },
  {
    name: "download-and-run",
    test: (t) => /powershell(\.exe)?\s+-|bitsadmin|certutil\s+-urlcache|curl\s+https?:\/\/|wget\s+https?:\/\//i.test(t),
  },
];

/** Local signature/heuristic scan. Exported so it can be unit-tested. */
export function localSignatureScan(
  data: Buffer,
  meta: { fileName: string; mime: string }
): ScanResult {
  const text = data.toString("latin1");
  if (text.includes(EICAR)) {
    return {
      status: "infected",
      engine: "local-signature-v1",
      scanner: "local",
      detail: "EICAR antivirus test signature detected.",
    };
  }
  for (const rule of HEURISTICS) {
    if (rule.test(text)) {
      return {
        status: "infected",
        engine: "local-signature-v1",
        scanner: "local",
        detail: `Heuristic match: ${rule.name}. Manual review required before this file is used.`,
      };
    }
  }
  const isMz = data.length > 1 && data[0] === 0x4d && data[1] === 0x5a;
  if (isMz && !/\.(exe|dll)$/i.test(meta.fileName)) {
    return {
      status: "infected",
      engine: "local-signature-v1",
      scanner: "local",
      detail: "Windows executable header found in a document upload.",
    };
  }
  return {
    status: "clean",
    engine: "local-signature-v1",
    scanner: "local",
    detail:
      "Signature + heuristic scan passed (EICAR, PDF JavaScript/Launch, Office macros, " +
      "download-and-run patterns, MZ headers). This is not a full antivirus engine.",
  };
}

// ---------------------------------------------------------------------------
// clamd INSTREAM client (zero-dependency).
// Protocol: send "zINSTREAM\0", then chunks of [uint32 BE length][bytes],
// terminated by a zero-length chunk. The daemon replies with a NUL-terminated
// "stream: OK" or "stream: <Signature> FOUND".
// ---------------------------------------------------------------------------
interface ClamdConfig {
  host: string;
  port: number;
  timeoutMs: number;
  maxBytes: number;
}

function clamdConfig(): ClamdConfig | null {
  const host = process.env.TD_CLAMAV_HOST?.trim();
  if (!host) return null;
  const port = Number(process.env.TD_CLAMAV_PORT || 3310);
  return {
    host,
    port: Number.isFinite(port) ? port : 3310,
    timeoutMs: Number(process.env.TD_CLAMAV_TIMEOUT_MS || 15000) || 15000,
    maxBytes: Number(process.env.TD_CLAMAV_MAX_BYTES || 25 * 1024 * 1024) || 25 * 1024 * 1024,
  };
}

function clamdCommand(cfg: ClamdConfig, payload: Buffer, timeoutMs = cfg.timeoutMs): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: cfg.host, port: cfg.port });
    let response = "";
    let settled = false;
    const finish = (error: Error | null, value?: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else resolve(value ?? "");
    };
    const timer = setTimeout(() => finish(new Error(`clamd timed out after ${timeoutMs} ms`)), timeoutMs);
    timer.unref?.();
    socket.on("connect", () => socket.write(payload));
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
      if (response.includes("\0") || response.includes("\n")) {
        clearTimeout(timer);
        finish(null, response.replace(/\0/g, "").trim());
      }
    });
    socket.on("error", (err) => {
      clearTimeout(timer);
      finish(err instanceof Error ? err : new Error(String(err)));
    });
    socket.on("close", () => {
      clearTimeout(timer);
      if (!settled) finish(null, response.replace(/\0/g, "").trim());
    });
  });
}

/** Ask the daemon for its version/signature timestamp. */
export async function clamdVersion(): Promise<{ available: boolean; version?: string; reason?: string }> {
  const cfg = clamdConfig();
  if (!cfg) return { available: false, reason: "TD_CLAMAV_HOST is not set." };
  try {
    const reply = await clamdCommand(cfg, Buffer.from("zVERSION\0", "utf8"), Math.min(cfg.timeoutMs, 5000));
    // Typical reply: "ClamAV 1.4.1/27480/Wed Nov  5 08:12:33 2025"
    return { available: true, version: reply || "unknown" };
  } catch (error) {
    return { available: false, reason: (error as Error).message };
  }
}

async function clamdScan(data: Buffer, cfg: ClamdConfig): Promise<ScanResult> {
  const started = Date.now();
  if (data.length > cfg.maxBytes) {
    return {
      status: "error",
      engine: "clamav-clamd",
      scanner: "clamd",
      detail: `File exceeds the configured clamd scan limit (${cfg.maxBytes} bytes); it was not scanned.`,
      durationMs: Date.now() - started,
    };
  }
  const header = Buffer.from("zINSTREAM\0", "utf8");
  const chunks: Buffer[] = [header];
  const step = 64 * 1024;
  for (let offset = 0; offset < data.length; offset += step) {
    const slice = data.subarray(offset, offset + step);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(slice.length, 0);
    chunks.push(length, slice);
  }
  chunks.push(Buffer.from([0, 0, 0, 0]));
  try {
    const reply = await clamdCommand(cfg, Buffer.concat(chunks));
    const version = await clamdVersion().catch(() => ({ version: null }));
    const signatureVersion = version.version ?? null;
    if (/FOUND/i.test(reply)) {
      const signature = reply.replace(/^stream:\s*/i, "").replace(/\s*FOUND\s*$/i, "");
      return {
        status: "infected",
        engine: "clamav-clamd",
        scanner: "clamd",
        detail: `ClamAV detected ${signature || "malware"}.`,
        signatureVersion,
        durationMs: Date.now() - started,
      };
    }
    if (/^stream:\s*OK/i.test(reply)) {
      return {
        status: "clean",
        engine: "clamav-clamd",
        scanner: "clamd",
        detail: "ClamAV reported the stream as clean.",
        signatureVersion,
        durationMs: Date.now() - started,
      };
    }
    return {
      status: "error",
      engine: "clamav-clamd",
      scanner: "clamd",
      detail: `clamd returned an unrecognised response: ${reply.slice(0, 200) || "(empty)"}`,
      signatureVersion,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    // Fail closed: a configured scanner that cannot be reached means the file
    // was NOT scanned.
    return {
      status: "error",
      engine: "clamav-clamd",
      scanner: "clamd",
      detail: `ClamAV unavailable: ${(error as Error).message}. The file was not scanned and was not stored.`,
      durationMs: Date.now() - started,
    };
  }
}

async function httpScan(
  data: Buffer,
  meta: { fileName: string; mime: string; sha256?: string }
): Promise<ScanResult> {
  const url = process.env.TD_MALWARE_SCAN_URL!.trim();
  const started = Date.now();
  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(data)], { type: meta.mime }), meta.fileName);
    form.append("sha256", meta.sha256 ?? "");
    const res = await fetch(url, {
      method: "POST",
      body: form,
      headers: process.env.TD_MALWARE_SCAN_TOKEN
        ? { Authorization: `Bearer ${process.env.TD_MALWARE_SCAN_TOKEN}` }
        : undefined,
      signal: AbortSignal.timeout(Number(process.env.TD_MALWARE_SCAN_TIMEOUT_MS || 8000)),
    });
    const json = (await res.json().catch(() => ({}))) as { status?: string; engine?: string; detail?: string };
    if (!res.ok) {
      return {
        status: "error",
        engine: json.engine ?? "remote",
        scanner: "http",
        detail: `Scanner returned ${res.status}. The file was not scanned.`,
        durationMs: Date.now() - started,
      };
    }
    if (json.status === "clean" || json.status === "infected") {
      return {
        status: json.status,
        engine: json.engine ?? "remote",
        scanner: "http",
        detail: json.detail ?? (json.status === "clean" ? "No malware detected." : "Malware detected."),
        durationMs: Date.now() - started,
      };
    }
    return {
      status: "error",
      engine: json.engine ?? "remote",
      scanner: "http",
      detail: "Scanner returned an unknown status. The file was not scanned.",
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      status: "error",
      engine: "remote",
      scanner: "http",
      detail: `Scanner unavailable: ${(error as Error).message}. The file was not scanned and was not stored.`,
      durationMs: Date.now() - started,
    };
  }
}

export async function scanBuffer(
  data: Buffer,
  meta: { fileName: string; mime: string; sha256?: string }
): Promise<ScanResult> {
  const sha256 = meta.sha256 ?? createHash("sha256").update(data).digest("hex");
  const cfg = clamdConfig();
  if (cfg) return { ...(await clamdScan(data, cfg)), sha256 };
  if (process.env.TD_MALWARE_SCAN_URL?.trim()) return { ...(await httpScan(data, meta)), sha256 };
  return { ...localSignatureScan(data, meta), sha256 };
}

/** Report the configured scanner honestly, including daemon availability. */
export async function getScannerStatus() {
  const cfg = clamdConfig();
  if (cfg) {
    const version = await clamdVersion();
    return {
      scanner: "clamd",
      configured: true,
      available: version.available,
      engine: "clamav-clamd",
      endpoint: `${cfg.host}:${cfg.port}`,
      signatureVersion: version.version ?? null,
      reason: version.available ? null : version.reason ?? "clamd unreachable",
    };
  }
  if (process.env.TD_MALWARE_SCAN_URL?.trim()) {
    return {
      scanner: "http",
      configured: true,
      available: null,
      engine: "remote",
      endpoint: process.env.TD_MALWARE_SCAN_URL,
      signatureVersion: null,
      reason: "Availability is verified on each scan.",
    };
  }
  return {
    scanner: "local",
    configured: true,
    available: true,
    engine: "local-signature-v1",
    signatureVersion: "local-rules-v1",
    reason: null,
    disclaimer:
      "Local signature + heuristic scan, not a full antivirus engine. Configure TD_CLAMAV_HOST for ClamAV.",
  };
}
