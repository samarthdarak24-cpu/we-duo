// ---------------------------------------------------------------------------
// File storage abstraction for document/photo/avatar uploads.
//
//   TD_STORAGE_PROVIDER=local  (default)  → TD_UPLOAD_DIR on disk
//   TD_STORAGE_PROVIDER=s3                → S3-compatible object storage
//
// Both providers enforce the same rules:
//   * magic-byte sniffing, so a renamed executable cannot masquerade as a PDF;
//   * size limits and a 0600 mode (local) / private ACL (S3);
//   * content-addressed SHA-256 metadata for the integrity chain;
//   * no public URLs — downloads go through the consent-gated Next.js route,
//     which may redirect to a short-lived presigned S3 URL after authorizing.
//
// S3 credentials are read from the server environment only and are never
// exposed to the browser.
// ---------------------------------------------------------------------------
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { S3Client } from "@aws-sdk/client-s3";

export const MAX_DOC_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export type StorageProvider = "local" | "s3";

interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

function resolveUploadRoot(): string {
  const raw = process.env.TD_UPLOAD_DIR || ".data/uploads";
  let r = path.resolve(raw);
  if (!path.isAbsolute(raw) && !fs.existsSync(r)) {
    const parent = path.resolve("..", raw);
    if (
      fs.existsSync(parent) ||
      (path.basename(process.cwd()) === "frontend" && fs.existsSync(path.resolve("..", "backend")))
    ) {
      r = parent;
    }
  }
  return r;
}
const ROOT = resolveUploadRoot();

const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: "application/pdf", ext: "pdf", test: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  { mime: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/webp", ext: "webp", test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
];

export interface StoredFile {
  key: string;
  mime: string;
  size: number;
  sha256: string;
  provider: StorageProvider;
}

function assertInsideRoot(key: string) {
  const full = path.resolve(ROOT, key);
  const root = path.resolve(ROOT);
  if (!full.startsWith(root + path.sep)) throw new Error("INVALID_FILE_KEY");
  return full;
}

// ---- Storage provider selection -------------------------------------------
export function storageProvider(): StorageProvider {
  const configured = process.env.TD_STORAGE_PROVIDER?.trim().toLowerCase();
  return configured === "s3" ? "s3" : "local";
}

function s3Config(): S3Config | null {
  const bucket = process.env.TD_S3_BUCKET?.trim();
  const accessKeyId = process.env.TD_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.TD_S3_SECRET_ACCESS_KEY?.trim();
  if (!bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    bucket,
    region: process.env.TD_S3_REGION?.trim() || "us-east-1",
    endpoint: process.env.TD_S3_ENDPOINT?.trim() || undefined,
    accessKeyId,
    secretAccessKey,
    forcePathStyle:
      process.env.TD_S3_FORCE_PATH_STYLE === "1" ||
      process.env.TD_S3_FORCE_PATH_STYLE === "true" ||
      Boolean(process.env.TD_S3_ENDPOINT),
  };
}

let _client: S3Client | null = null;

async function s3Client(): Promise<S3Client> {
  const cfg = s3Config();
  if (!cfg) {
    throw new Error(
      "S3 storage is selected but TD_S3_BUCKET / TD_S3_ACCESS_KEY_ID / TD_S3_SECRET_ACCESS_KEY are not all set."
    );
  }
  if (_client) return _client;
  const { S3Client: Client } = await import("@aws-sdk/client-s3");
  _client = new Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: cfg.forcePathStyle,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
  return _client;
}

// ---- Validation ------------------------------------------------------------
/** Identify a buffer from its magic bytes. */
export function sniffUpload(data: Buffer): { mime: string; ext: string } | null {
  const sig = SIGNATURES.find((s) => s.test(data));
  return sig ? { mime: sig.mime, ext: sig.ext } : null;
}

/** Local-only absolute path. Returns null when S3 storage is active. */
export function absoluteUploadPath(key: string): string | null {
  if (storageProvider() !== "local") return null;
  try {
    return assertInsideRoot(key);
  } catch {
    return null;
  }
}

/**
 * Return a local filesystem path for a stored object, downloading it to a
 * transient directory when S3 is active. Callers must invoke `cleanup()`.
 * Permanent uploads are never kept in the temp directory.
 */
export async function materializeUpload(
  key: string
): Promise<{ path: string; cleanup: () => void } | null> {
  if (storageProvider() === "local") {
    const full = absoluteUploadPath(key);
    return full ? { path: full, cleanup: () => {} } : null;
  }
  const data = await readUpload(key);
  if (!data) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trustdrive-ocr-"));
  const file = path.join(dir, path.basename(key) || "upload.bin");
  fs.writeFileSync(file, data, { mode: 0o600 });
  return {
    path: file,
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
    },
  };
}

// ---- Uploads ---------------------------------------------------------------
/** Validate magic bytes and persist a buffer under `folder`. */
export async function saveUpload(folder: string, data: Buffer, maxBytes: number): Promise<StoredFile> {
  if (!data.length) throw new Error("EMPTY_FILE");
  if (data.length > maxBytes) throw new Error("FILE_TOO_LARGE");
  const sig = SIGNATURES.find((s) => s.test(data));
  if (!sig) throw new Error("UNSUPPORTED_FILE_TYPE");
  const key = `${folder}/${randomUUID()}.${sig.ext}`;
  const sha256 = createHash("sha256").update(data).digest("hex");
  const provider = storageProvider();

  if (provider === "s3") {
    const client = await s3Client();
    const cfg = s3Config()!;
    const { PutObjectCommand: Put } = await import("@aws-sdk/client-s3");
    const command = new Put({
      Bucket: cfg.bucket,
      Key: key,
      Body: data,
      ContentType: sig.mime,
      CacheControl: key.startsWith("documents/") || key.startsWith("kyc/")
        ? "private, no-store"
        : "private, max-age=3600",
      Metadata: { sha256, size: String(data.length) },
    });
    await client.send(command);
  } else {
    const full = assertInsideRoot(key);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, data, { mode: 0o600 });
  }

  return { key, mime: sig.mime, size: data.length, sha256, provider };
}

// ---- Reads -----------------------------------------------------------------
export async function readUpload(key: string): Promise<Buffer | null> {
  if (storageProvider() === "s3") {
    try {
      const client = await s3Client();
      const cfg = s3Config()!;
      const { GetObjectCommand: Get } = await import("@aws-sdk/client-s3");
      const result = await client.send(new Get({ Bucket: cfg.bucket, Key: key }));
      if (!result.Body?.transformToByteArray) return null;
      const bytes = await result.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === "NoSuchKey" || name === "NotFound") return null;
      throw error;
    }
  }
  try {
    const full = assertInsideRoot(key);
    if (!fs.existsSync(full)) return null;
    return fs.readFileSync(full);
  } catch {
    return null;
  }
}

export async function uploadExists(key: string | null | undefined): Promise<boolean> {
  if (!key) return false;
  if (storageProvider() === "s3") {
    try {
      const client = await s3Client();
      const cfg = s3Config()!;
      const { HeadObjectCommand: Head } = await import("@aws-sdk/client-s3");
      await client.send(new Head({ Bucket: cfg.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
  try {
    return fs.existsSync(assertInsideRoot(key));
  } catch {
    return false;
  }
}

export async function deleteUpload(key: string | null | undefined): Promise<void> {
  if (!key) return;
  if (storageProvider() === "s3") {
    try {
      const client = await s3Client();
      const cfg = s3Config()!;
      const { DeleteObjectCommand: Delete } = await import("@aws-sdk/client-s3");
      await client.send(new Delete({ Bucket: cfg.bucket, Key: key }));
    } catch {
      /* deletion is best-effort; the object remains private */
    }
    return;
  }
  try {
    const full = assertInsideRoot(key);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch {
    /* ignore invalid keys */
  }
}

// ---- Signed URLs -----------------------------------------------------------
/**
 * Short-lived presigned GET URL. Only call after the normal ownership/consent
 * checks have passed — a presigned URL bypasses the application once issued.
 */
export async function getSignedFileUrl(key: string, expiresInSeconds = 300): Promise<string | null> {
  if (storageProvider() !== "s3") return null;
  const cfg = s3Config();
  if (!cfg) return null;
  const client = await s3Client();
  const { GetObjectCommand: Get } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  return getSignedUrl(client, new Get({ Bucket: cfg.bucket, Key: key }), {
    expiresIn: Math.max(30, Math.min(expiresInSeconds, 3600)),
  });
}

// ---- Health ----------------------------------------------------------------
export async function storageHealth(): Promise<{
  provider: StorageProvider;
  configured: boolean;
  ok: boolean;
  bucket?: string;
  endpoint?: string;
  reason?: string;
  checkedAt: string;
}> {
  const checkedAt = new Date().toISOString();
  const provider = storageProvider();
  if (provider === "s3") {
    const cfg = s3Config();
    if (!cfg) {
      return {
        provider, configured: false, ok: false, checkedAt,
        reason: "TD_S3_BUCKET / TD_S3_ACCESS_KEY_ID / TD_S3_SECRET_ACCESS_KEY are incomplete.",
      };
    }
    try {
      const client = await s3Client();
      const { HeadBucketCommand: Head } = await import("@aws-sdk/client-s3");
      await client.send(new Head({ Bucket: cfg.bucket }));
      return { provider, configured: true, ok: true, bucket: cfg.bucket, endpoint: cfg.endpoint, checkedAt };
    } catch (error) {
      return {
        provider, configured: true, ok: false, bucket: cfg.bucket, endpoint: cfg.endpoint,
        reason: (error as Error).message, checkedAt,
      };
    }
  }
  try {
    fs.mkdirSync(ROOT, { recursive: true });
    const probe = path.join(ROOT, `.health-${randomUUID()}`);
    fs.writeFileSync(probe, "ok", { mode: 0o600 });
    fs.unlinkSync(probe);
    return { provider, configured: true, ok: true, checkedAt };
  } catch (error) {
    return { provider, configured: true, ok: false, reason: (error as Error).message, checkedAt };
  }
}

// ---- Seed helper (local-only) ---------------------------------------------
/** Copy a bundled asset into uploads for seeded rows that reference it. */
export function ensureUploadFromPublic(key: string, publicPath: string): boolean {
  try {
    const full = assertInsideRoot(key);
    if (fs.existsSync(full)) return true;
    const source = path.join(process.cwd(), "public", publicPath);
    if (!fs.existsSync(source)) return false;
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.copyFileSync(source, full);
    return true;
  } catch {
    return false;
  }
}

/**
 * Quarantine bytes outside the servable upload root. Quarantined files are
 * never returned by /api/v1/files; they exist only for security review.
 */
export function quarantineBuffer(label: string, data: Buffer): string | null {
  try {
    const rawQ = process.env.TD_QUARANTINE_DIR || ".data/quarantine";
    let root = path.resolve(rawQ);
    if (!path.isAbsolute(rawQ) && !fs.existsSync(root)) {
      const parent = path.resolve("..", rawQ);
      if (
        fs.existsSync(parent) ||
        (path.basename(process.cwd()) === "frontend" && fs.existsSync(path.resolve("..", "backend")))
      ) {
        root = parent;
      }
    }
    const safeLabel = label.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    const file = path.join(root, `${Date.now()}-${randomUUID().slice(0, 8)}-${safeLabel}`);
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(file, data, { mode: 0o600 });
    return file;
  } catch {
    return null;
  }
}
