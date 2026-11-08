// clamd protocol integration test against qa/clamd-sink.py.
// Gated by TD_CLAMAV_TEST_HOST so the normal unit suite never depends on it.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const host = process.env.TD_CLAMAV_TEST_HOST;
const port = process.env.TD_CLAMAV_TEST_PORT || "3310";
const suite = host ? describe : describe.skip;

// Assembled at runtime so the source file is not itself flagged.
const EICAR = [
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR",
  "-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
].join("");

const PDF = Buffer.from("%PDF-1.7\nclean test document\n%%EOF\n");

suite("ClamAV clamd protocol", () => {
  let scan: typeof import("../lib/server/scan");
  let guard: typeof import("../lib/server/upload-guard");
  let files: typeof import("../lib/server/files");
  let db: typeof import("../lib/server/db");
  let actorId = "test-user";
  const quarantineDir = fs.mkdtempSync(path.join(os.tmpdir(), "trustdrive-quarantine-"));
  const original = { ...process.env };

  beforeAll(async () => {
    process.env.TD_CLAMAV_HOST = host;
    process.env.TD_CLAMAV_PORT = port;
    process.env.TD_CLAMAV_TIMEOUT_MS = "5000";
    process.env.TD_QUARANTINE_DIR = quarantineDir;
    scan = await import("../lib/server/scan");
    guard = await import("../lib/server/upload-guard");
    files = await import("../lib/server/files");
    db = await import("../lib/server/db");
    actorId = db.getUserByEmail("samarth@trustdrive.dev")?.id ?? actorId;
  });

  afterAll(() => {
    process.env = original;
    fs.rmSync(quarantineDir, { recursive: true, force: true });
  });

  it("reports the live daemon version", async () => {
    const status = await scan.getScannerStatus();
    expect(status.scanner).toBe("clamd");
    expect(status.configured).toBe(true);
    expect(status.available).toBe(true);
    expect(String(status.signatureVersion)).toContain("ClamAV");
  });

  it("scans a clean PDF through INSTREAM framing", async () => {
    const result = await scan.scanBuffer(PDF, { fileName: "clean.pdf", mime: "application/pdf" });
    expect(result.status).toBe("clean");
    expect(result.scanner).toBe("clamd");
    expect(result.engine).toBe("clamav-clamd");
    expect(result.signatureVersion).toContain("ClamAV");
    expect(result.sha256).toHaveLength(64);
  });

  it("detects EICAR and reports the signature", async () => {
    const result = await scan.scanBuffer(Buffer.from(EICAR), {
      fileName: "eicar.com",
      mime: "application/octet-stream",
    });
    expect(result.status).toBe("infected");
    expect(result.detail).toContain("EICAR");
  });

  it("stores a clean file and links its real scan verdict", async () => {
    const stored = await guard.guardedSaveUpload({
      bytes: PDF,
      fileName: "clean.pdf",
      mime: "application/pdf",
      folder: "documents/test",
      maxBytes: files.MAX_DOC_BYTES,
      actorId,
    });
    expect(stored.ok).toBe(true);
    if (!stored.ok) return;
    expect(await files.uploadExists(stored.stored.key)).toBe(true);
    const row = db.getLatestFileScan(stored.stored.key);
    expect(row?.status).toBe("clean");
    expect(row?.scanner).toBe("clamd");
    expect(row?.sha256).toBe(stored.stored.sha256);
    await files.deleteUpload(stored.stored.key);
  }, 30_000);

  it("quarantines infected bytes and never stores them", async () => {
    const before = fs.readdirSync(quarantineDir).length;
    const unreadBefore = db.getUnreadCount(actorId);
    const result = await guard.guardedSaveUpload({
      bytes: Buffer.from(EICAR),
      fileName: "invoice.pdf",
      mime: "application/pdf",
      folder: "documents/test",
      maxBytes: files.MAX_DOC_BYTES,
      actorId,
      vehicleId: "veh-test",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(422);
    expect(result.code).toBe("MALWARE_DETECTED");
    expect(fs.readdirSync(quarantineDir).length).toBe(before + 1);
    expect(db.getUnreadCount(actorId)).toBe(unreadBefore + 1);
  });

  it("fails closed (503) when the configured daemon is unreachable", async () => {
    process.env.TD_CLAMAV_PORT = "3311"; // closed
    try {
      const result = await guard.guardedSaveUpload({
        bytes: PDF,
        fileName: "clean.pdf",
        mime: "application/pdf",
        folder: "documents/test",
        maxBytes: files.MAX_DOC_BYTES,
        actorId,
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(503);
      expect(result.code).toBe("SCAN_UNAVAILABLE");
      expect(result.scan.detail).toContain("not scanned");
    } finally {
      process.env.TD_CLAMAV_PORT = port;
    }
  }, 30_000);
});
