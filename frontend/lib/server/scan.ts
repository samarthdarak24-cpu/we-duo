// ---------------------------------------------------------------------------
// Upload malware scanning.
//
// 1. If TD_MALWARE_SCAN_URL is configured, the file is submitted to that
//    service and its verdict is authoritative.
// 2. Otherwise a LOCAL signature + heuristic scan runs (EICAR test signature,
//    PDF JavaScript/Launch actions, Office auto-open macros, download-and-run
//    command patterns, MZ headers in non-executable uploads). It is a real
//    scan, but not a full antivirus engine, and the engine name says so.
// ---------------------------------------------------------------------------

export interface ScanResult {
  status: "clean" | "infected" | "not_configured" | "error";
  engine: string;
  detail: string;
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
      detail: "EICAR antivirus test signature detected.",
    };
  }
  for (const rule of HEURISTICS) {
    if (rule.test(text)) {
      return {
        status: "infected",
        engine: "local-signature-v1",
        detail: `Heuristic match: ${rule.name}. Manual review required before this file is used.`,
      };
    }
  }
  const isMz = data.length > 1 && data[0] === 0x4d && data[1] === 0x5a;
  if (isMz && !/\.(exe|dll)$/i.test(meta.fileName)) {
    return {
      status: "infected",
      engine: "local-signature-v1",
      detail: "Windows executable header found in a document upload.",
    };
  }
  return {
    status: "clean",
    engine: "local-signature-v1",
    detail:
      "Signature + heuristic scan passed (EICAR, PDF JavaScript/Launch, Office macros, " +
      "download-and-run patterns, MZ headers). This is not a full antivirus engine.",
  };
}

export async function scanBuffer(
  data: Buffer,
  meta: { fileName: string; mime: string; sha256?: string }
): Promise<ScanResult> {
  const url = process.env.TD_MALWARE_SCAN_URL?.trim();
  if (!url) return localSignatureScan(data, meta);

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
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json().catch(() => ({}))) as { status?: string; engine?: string; detail?: string };
    if (!res.ok) {
      return { status: "error", engine: json.engine ?? "remote", detail: `Scanner returned ${res.status}.` };
    }
    if (json.status === "clean" || json.status === "infected") {
      return {
        status: json.status,
        engine: json.engine ?? "remote",
        detail: json.detail ?? (json.status === "clean" ? "No malware detected." : "Malware detected."),
      };
    }
    return { status: "error", engine: json.engine ?? "remote", detail: "Scanner returned an unknown status." };
  } catch (error) {
    return {
      status: "error",
      engine: "remote",
      detail: `Scanner unavailable: ${(error as Error).message}. The file was not scanned.`,
    };
  }
}
