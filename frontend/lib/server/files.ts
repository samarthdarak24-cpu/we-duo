// ---------------------------------------------------------------------------
// Local file storage for document/photo/avatar uploads. Files live under
// `.data/uploads` with randomised keys; every write is magic-byte sniffed so a
// renamed executable cannot masquerade as a PDF or image.
// ---------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

export const MAX_DOC_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const ROOT = process.env.TD_UPLOAD_DIR
  ? path.resolve(process.env.TD_UPLOAD_DIR)
  : path.join(process.cwd(), ".data", "uploads");

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
}

function assertInsideRoot(key: string) {
  const full = path.resolve(ROOT, key);
  const root = path.resolve(ROOT);
  if (!full.startsWith(root + path.sep)) throw new Error("INVALID_FILE_KEY");
  return full;
}

/** Validate magic bytes and persist a buffer under `folder`. */
export function saveUpload(folder: string, data: Buffer, maxBytes: number): StoredFile {
  if (!data.length) throw new Error("EMPTY_FILE");
  if (data.length > maxBytes) throw new Error("FILE_TOO_LARGE");
  const sig = SIGNATURES.find((s) => s.test(data));
  if (!sig) throw new Error("UNSUPPORTED_FILE_TYPE");
  const key = `${folder}/${randomUUID()}.${sig.ext}`;
  const full = assertInsideRoot(key);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, data, { mode: 0o600 });
  return {
    key,
    mime: sig.mime,
    size: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
  };
}

/** Identify a buffer from its magic bytes. */
export function sniffUpload(data: Buffer): { mime: string; ext: string } | null {
  const sig = SIGNATURES.find((s) => s.test(data));
  return sig ? { mime: sig.mime, ext: sig.ext } : null;
}

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

export function readUpload(key: string): Buffer | null {
  try {
    const full = assertInsideRoot(key);
    if (!fs.existsSync(full)) return null;
    return fs.readFileSync(full);
  } catch {
    return null;
  }
}

export function deleteUpload(key: string | null | undefined) {
  if (!key) return;
  try {
    const full = assertInsideRoot(key);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  } catch {
    /* ignore invalid keys */
  }
}

export function uploadExists(key: string | null | undefined): boolean {
  if (!key) return false;
  try {
    return fs.existsSync(assertInsideRoot(key));
  } catch {
    return false;
  }
}
