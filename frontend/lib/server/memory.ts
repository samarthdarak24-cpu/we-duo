// ---------------------------------------------------------------------------
// Container memory disclosure + OCR headroom guard.
//
// The combined Render image runs Next.js, FastAPI and (optionally) the DB
// worker in one cgroup. OCR loads ONNX models and needs ~220-260 MB of peak
// headroom; on a 512 MB Free instance that is only safe when the rest of the
// container has room. This module reads the real cgroup limit/usage so the
// upload path can refuse OCR with an honest reason instead of letting the
// kernel OOM-kill the whole service.
//
// It is telemetry + a guard only. Nothing here estimates or fabricates a
// result: when headroom is insufficient the document stays pending and the
// caller reports exactly why.
// ---------------------------------------------------------------------------
import { readFileSync } from "node:fs";
import { freemem, totalmem } from "node:os";

const MB = 1024 * 1024;

export interface MemorySnapshot {
  source: "cgroup-v2" | "cgroup-v1" | "host" | "unknown";
  limitBytes: number | null;
  /** Memory that cannot be reclaimed cheaply (anon + kernel + shmem). */
  usedBytes: number | null;
  availableBytes: number | null;
  totalBytes: number | null;
  rawCurrentBytes: number | null;
}

export interface OcrHeadroom {
  ok: boolean;
  reason: string;
  requiredBytes: number;
  memory: MemorySnapshot;
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return null;
  }
}

function toNumber(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseStat(stat: string | null): Map<string, number> {
  const out = new Map<string, number>();
  if (!stat) return out;
  for (const line of stat.split("\n")) {
    const [key, raw] = line.trim().split(/\s+/);
    const value = Number(raw);
    if (key && Number.isFinite(value)) out.set(key, value);
  }
  return out;
}

/**
 * Read the effective memory limit/usage of the current container.
 *
 * cgroup v2 `memory.current` includes page cache, which the kernel reclaims
 * under pressure. To avoid refusing OCR because of harmless file cache we
 * prefer `memory.stat` anon + kernel + shmem. If that is unavailable we fall
 * back to the raw current value. cgroup v1 subtracts total_cache similarly.
 */
export function memorySnapshot(): MemorySnapshot {
  const v2Max = readText("/sys/fs/cgroup/memory.max");
  const v2Current = readText("/sys/fs/cgroup/memory.current");
  if (v2Current !== null && v2Max !== null) {
    const rawCurrent = toNumber(v2Current);
    const limit = v2Max === "max" ? null : toNumber(v2Max);
    const stat = parseStat(readText("/sys/fs/cgroup/memory.stat"));
    const anon = stat.get("anon");
    const kernel = stat.get("kernel");
    const slab = stat.get("slab");
    const sock = stat.get("sock");
    const shmem = stat.get("shmem");
    const kernelish = kernel ?? (slab ?? 0) + (sock ?? 0);
    const used =
      anon !== undefined
        ? anon + kernelish + (shmem ?? 0)
        : rawCurrent;
    const available = limit !== null && used !== null ? Math.max(0, limit - used) : null;
    return {
      source: "cgroup-v2",
      limitBytes: limit,
      usedBytes: used,
      availableBytes: available,
      totalBytes: limit,
      rawCurrentBytes: rawCurrent,
    };
  }

  // cgroup v1 (older Docker/Render runtimes).
  const v1LimitRaw = readText("/sys/fs/cgroup/memory/memory.limit_in_bytes");
  const v1UsageRaw = readText("/sys/fs/cgroup/memory/memory.usage_in_bytes");
  if (v1LimitRaw !== null && v1UsageRaw !== null) {
    const rawLimit = toNumber(v1LimitRaw);
    // v1 uses a huge sentinel (PAGE_COUNTER_MAX) when no limit is set.
    const limit = rawLimit !== null && rawLimit < 1e15 ? rawLimit : null;
    const usage = toNumber(v1UsageRaw);
    const stat = parseStat(readText("/sys/fs/cgroup/memory/memory.stat"));
    const cache = stat.get("total_cache") ?? 0;
    const used = usage !== null ? Math.max(0, usage - cache) : null;
    const available = limit !== null && used !== null ? Math.max(0, limit - used) : null;
    return {
      source: "cgroup-v1",
      limitBytes: limit,
      usedBytes: used,
      availableBytes: available,
      totalBytes: limit,
      rawCurrentBytes: usage,
    };
  }

  const total = totalmem();
  const free = freemem();
  if (Number.isFinite(total) && total > 0) {
    return {
      source: "host",
      limitBytes: null,
      usedBytes: Math.max(0, total - free),
      availableBytes: free,
      totalBytes: total,
      rawCurrentBytes: null,
    };
  }

  return {
    source: "unknown",
    limitBytes: null,
    usedBytes: null,
    availableBytes: null,
    totalBytes: null,
    rawCurrentBytes: null,
  };
}

function configuredRequiredBytes(): number {
  const raw = Number(process.env.TD_OCR_MIN_FREE_MB);
  const provider = (process.env.TD_OCR_PROVIDER || "auto").trim().toLowerCase();
  // Tesseract's CLI peak is ~30-60 MB; RapidOCR's ONNX sessions need 250-330 MB.
  const fallback = provider === "tesseract" || provider === "tess" ? 160 : 280;
  const mb = Number.isFinite(raw) && raw > 0 ? raw : fallback;
  return Math.round(mb * MB);
}

/**
 * Decide whether a synchronous OCR run is safe on this instance.
 *
 * The default is provider-aware: 280 MB for the ONNX engines (RapidOCR) and
 * 160 MB for the Tesseract CLI, whose peak is only ~30-60 MB. Both assume the
 * image is capped at 1024 px on its longest side. Operators can override the
 * value with TD_OCR_MIN_FREE_MB, but lowering it too far risks a container OOM.
 */
export function checkOcrHeadroom(requiredBytes = configuredRequiredBytes()): OcrHeadroom {
  const memory = memorySnapshot();
  if (memory.availableBytes !== null && memory.availableBytes < requiredBytes) {
    const availableMb = Math.max(0, Math.round(memory.availableBytes / MB));
    const requiredMb = Math.round(requiredBytes / MB);
    const limit = memory.limitBytes !== null ? ` of a ${Math.round(memory.limitBytes / MB)} MB limit` : "";
    return {
      ok: false,
      requiredBytes,
      memory,
      reason:
        `OCR needs about ${requiredMb} MB of free memory, but only about ${availableMb} MB${limit} ` +
        "is available on this instance. The document was stored and stays pending — no extraction " +
        "was attempted. Retry when the service is idle, or run it on an instance with more memory.",
    };
  }
  return { ok: true, requiredBytes, memory, reason: "" };
}
