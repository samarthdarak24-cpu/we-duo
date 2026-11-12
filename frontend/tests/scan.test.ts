import { describe, expect, it } from "vitest";
import { localSignatureScan } from "@/lib/server/scan";

const meta = { fileName: "document.pdf", mime: "application/pdf" };

describe("local malware scan", () => {
  it("detects the EICAR test signature", () => {
    const eicar = [
      "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR",
      "-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*",
    ].join("");
    const r = localSignatureScan(Buffer.from(eicar), meta);
    expect(r.status).toBe("infected");
    expect(r.engine).toBe("local-signature-v1");
    expect(r.detail).toMatch(/EICAR/i);
  });

  it("flags PDF JavaScript and Launch actions", () => {
    expect(localSignatureScan(Buffer.from("%PDF-1.7\n/JavaScript"), meta).status).toBe("infected");
    expect(localSignatureScan(Buffer.from("%PDF-1.7\n/Launch"), meta).status).toBe("infected");
  });

  it("flags Office auto-open macros and download-and-run commands", () => {
    expect(localSignatureScan(Buffer.from("Sub AutoOpen()"), { fileName: "a.doc", mime: "application/msword" }).status).toBe("infected");
    expect(localSignatureScan(Buffer.from("powershell -enc AAAA"), meta).status).toBe("infected");
  });

  it("passes a normal PDF and names the engine honestly", () => {
    const r = localSignatureScan(Buffer.from("%PDF-1.7\n1 0 obj << /Type /Catalog >>"), meta);
    expect(r.status).toBe("clean");
    expect(r.engine).toBe("local-signature-v1");
    expect(r.detail).toMatch(/not a full antivirus/i);
  });

  it("does not trigger PDF heuristics on compressed binary image bytes containing /JS or /Launch", () => {
    const pngBytes = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from("/JS/Launch/JavaScript"),
    ]);
    const r = localSignatureScan(pngBytes, { fileName: "scan.png", mime: "image/png" });
    expect(r.status).toBe("clean");
  });
});
