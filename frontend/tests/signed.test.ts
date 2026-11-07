import { describe, expect, it, vi } from "vitest";
import {
  downloadSigningConfigured,
  signDownloadToken,
  signedDownloadPath,
  verifyDownloadToken,
} from "../lib/server/signed";

describe("signed downloads", () => {
  it("round-trips a scoped token", () => {
    expect(downloadSigningConfigured()).toBe(true);
    const token = signDownloadToken("report", "rep-1", 120);
    expect(token).toBeTruthy();
    const payload = verifyDownloadToken(token!);
    expect(payload).toMatchObject({ scope: "report", id: "rep-1", v: 1 });
  });

  it("rejects a tampered or malformed token", () => {
    const token = signDownloadToken("file", "doc-1", 120)!;
    const [body, signature] = token.split(".");
    expect(verifyDownloadToken(`${body}.${signature.slice(0, -1)}x`)).toBeNull();
    expect(verifyDownloadToken("not-a-token")).toBeNull();
    expect(verifyDownloadToken("")).toBeNull();
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    try {
      const token = signDownloadToken("report", "rep-2", 30)!;
      expect(verifyDownloadToken(token)).not.toBeNull();
      vi.setSystemTime(Date.now() + 31_000);
      expect(verifyDownloadToken(token)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("builds a path with an encoded token and preserves an existing query", () => {
    const path = signedDownloadPath("/api/v1/files/private/doc%201.pdf", "file", "doc 1.pdf");
    expect(path).toMatch(/^\/api\/v1\/files\/private\/doc%201\.pdf\?token=/);
    const withQuery = signedDownloadPath("/api/v1/reports/rep-1/download?format=json", "report", "rep-1");
    expect(withQuery).toContain("?format=json&token=");
  });
});
