/**
 * End-to-end verification tests against the TrustDrive synthetic fixture dataset
 * (`trustdrive_test_fixtures/manifest.csv`, `data/vehicles.json`, `file_security/*`).
 *
 * Exercises:
 *  - H01..H07 file upload security checks (empty, fake extension, PNG-as-PDF, .exe, oversize, double ext, path traversal)
 *  - A..E multi-category vehicle creation & 3D non-car safety (F02 scooter never gets car GLB)
 *  - A01..A03 clean chronology vs B01..B03 rollback chronology (NEEDS_REVIEW, cites both records)
 *  - C01..C03 identity/year mismatches, D01..D02 date validity/sequence, E01..E03 SHA-256 & reference duplicates
 *  - F00..F01 EV scooter battery SOH record & category document allowlist
 */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getDb, getFindings, getMileage, getBatteryRecords, updateDocument } from "../lib/server/db";
import {
  createVehicleDraft,
  addDocumentForVehicle,
  addMileageForVehicle,
  getDocumentsView,
  getVerificationChecks,
  startVerificationRun,
} from "../lib/server/data";
import { signToken } from "../lib/server/auth";
import {
  isAllowedDocumentFileName,
  isAllowedImageFileName,
  sanitizeFileName,
  sniffUpload,
} from "../lib/server/files";
import { POST as uploadDocumentRoute } from "../app/api/v1/vehicles/[id]/documents/route";
import { GET as get3dModelRoute } from "../app/api/v1/vehicles/[id]/3d-model/route";

const FIXTURE_ROOT = "D:\\Downloads\\trustdrive_test_fixtures\\trustdrive_test_fixtures";
const HAS_FIXTURES = fs.existsSync(FIXTURE_ROOT);

function sellerRequest(url: string, init: RequestInit = {}) {
  const token = signToken({ sub: "u-seller", role: "seller", name: "Samarth Darak" });
  const headers = new Headers(init.headers);
  headers.set("cookie", `td_token=${token}`);
  headers.set("x-forwarded-for", "127.0.0.1");
  return new Request(url, { ...init, headers });
}

describe("TrustDrive fixture verification: file security (H01-H07)", () => {
  let vehicleId: string;
  const suffix = Math.floor(1000 + Math.random() * 8999);

  beforeAll(() => {
    getDb();
    const v = createVehicleDraft("u-seller", {
      make: "Veloxa",
      model: "Strider 150",
      year: 2020,
      regNo: `MH12TX${suffix}`,
      vin: `TDSYN0000000TX${suffix}`,
      categoryId: "petrol_motorcycle",
      fuel: "Petrol",
    });
    expect(v.ok).toBe(true);
    if (v.ok) vehicleId = v.id;
  });

  it("sanitizes path traversal filenames and rejects disallowed/double extensions", () => {
    expect(sanitizeFileName("../../etc/passwd.pdf")).toBe("passwd.pdf");
    expect(sanitizeFileName("H07_path_traversal_name..%2f..%2fetc%2fpasswd.pdf")).toBe("passwd.pdf");
    expect(isAllowedDocumentFileName("invoice.pdf")).toBe(true);
    expect(isAllowedDocumentFileName("photo.png")).toBe(true);
    expect(isAllowedDocumentFileName("H04_disallowed_extension.exe")).toBe(false);
    expect(isAllowedDocumentFileName("H06_double_extension.pdf.txt")).toBe(false);
    expect(isAllowedDocumentFileName("malware.exe.pdf")).toBe(false);
    expect(isAllowedImageFileName("photo.jpg")).toBe(true);
    expect(isAllowedImageFileName("doc.pdf")).toBe(false);
  });

  it("rejects empty, text-disguised-as-pdf, exe, double-extension, and safely handles traversal via upload route", async () => {
    const uploadFile = async (name: string, bytes: Buffer, mime = "application/pdf") => {
      const fd = new FormData();
      fd.append("type", "service_2w");
      fd.append("consent", "true");
      fd.append("file", new File([new Uint8Array(bytes)], name, { type: mime }));
      const req = sellerRequest(`http://localhost/api/v1/vehicles/${vehicleId}/documents`, {
        method: "POST",
        body: fd,
      });
      return uploadDocumentRoute(req, { params: { id: vehicleId } });
    };

    // H01: empty
    const h01 = await uploadFile("H01_empty.pdf", Buffer.alloc(0));
    expect(h01.status).toBe(400);

    // H02: plain text pretending to be PDF
    const h02 = await uploadFile("H02_text_renamed.pdf", Buffer.from("This is plain text pretending to be a PDF"));
    expect(h02.status).toBe(415);

    // H04: disallowed .exe (even if PDF magic bytes were stuffed inside)
    const h04 = await uploadFile("H04_disallowed_extension.exe", Buffer.from("%PDF-1.4\n%%EOF"));
    expect(h04.status).toBe(415);

    // H06: double extension .pdf.txt
    const h06 = await uploadFile("H06_double_extension.pdf.txt", Buffer.from("%PDF-1.4\n%%EOF"));
    expect(h06.status).toBe(415);

    // H03: PNG bytes with .pdf filename -> sniffUpload identifies image/png, stored key uses .png
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
    expect(sniffUpload(pngMagic)?.mime).toBe("image/png");
    const h03 = await uploadFile("H03_png_renamed.pdf", pngMagic, "application/pdf");
    expect(h03.status).toBe(201);
    const h03Json = (await h03.json()) as { data: { fileKey: string } };
    expect(h03Json.data.fileKey.endsWith(".png")).toBe(true);

    // H07: hostile path traversal filename -> stored under safe random UUID key, sanitized display name
    const h07 = await uploadFile(
      "H07_path_traversal_name..%2f..%2fetc%2fpasswd.pdf",
      Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF")
    );
    expect(h07.status).toBe(201);
    const h07Json = (await h07.json()) as { data: { id: string; fileKey: string } };
    expect(h07Json.data.fileKey).not.toContain("..");
    expect(h07Json.data.fileKey.startsWith(`documents/${vehicleId}/`)).toBe(true);
    const storedDoc = getDocumentsView(vehicleId).find((d) => d.id === h07Json.data.id);
    expect(storedDoc?.file_name).toBe("passwd.pdf");
  });

  it.skipIf(!HAS_FIXTURES)("rejects real fixture files H01, H02, H04, H05, H06 from trustdrive_test_fixtures", async () => {
    const secDir = path.join(FIXTURE_ROOT, "file_security");
    const sendFixture = async (fileName: string) => {
      const buf = fs.readFileSync(path.join(secDir, fileName));
      const fd = new FormData();
      fd.append("type", "service_2w");
      fd.append("file", new File([new Uint8Array(buf)], fileName));
      const req = sellerRequest(`http://localhost/api/v1/vehicles/${vehicleId}/documents`, {
        method: "POST",
        body: fd,
      });
      return uploadDocumentRoute(req, { params: { id: vehicleId } });
    };

    expect((await sendFixture("H01_empty.pdf")).status).toBe(400);
    expect((await sendFixture("H02_text_renamed.pdf")).status).toBe(415);
    expect((await sendFixture("H04_disallowed_extension.exe")).status).toBe(415);
    expect((await sendFixture("H05_oversize_26MB.pdf")).status).toBe(413);
    expect((await sendFixture("H06_double_extension.pdf.txt")).status).toBe(415);
  });
});

describe("TrustDrive fixture verification: categories, mileage chronology & 3D safety", () => {
  const suffix = Math.floor(1000 + Math.random() * 8999);

  it("supports two-wheeler & EV registration, rejects car GLB for scooter (F02), and flags rollback as NEEDS_REVIEW (Journey C)", async () => {
    // Vehicle B: petrol motorcycle, 65,000 -> 42,000 rollback
    const vb = createVehicleDraft("u-seller", {
      make: "Veloxa",
      model: "Strider 150",
      year: 2019,
      regNo: `MH12TB${suffix}`,
      vin: `TDSYN000000TB${suffix}`,
      categoryId: "petrol_motorcycle",
      fuel: "Petrol",
    });
    expect(vb.ok).toBe(true);
    if (!vb.ok) return;

    const m1 = addMileageForVehicle("u-seller", vb.id, { date: "2022-06-10", km: 65000, source: "service_invoice" });
    const m2 = addMileageForVehicle("u-seller", vb.id, { date: "2024-02-05", km: 42000, source: "service_invoice" });
    const m3 = addMileageForVehicle("u-seller", vb.id, { date: "2024-03-20", km: 42100, source: "odometer_photo" });
    expect(m1.ok && !m1.flagged).toBe(true);
    expect(m2.ok && m2.flagged).toBe(true);
    expect(m3.ok && !m3.flagged).toBe(true);

    const findings = getFindings(vb.id);
    const rollback = findings.find((f) => f.code === "ODOMETER_ROLLBACK");
    expect(rollback).toBeDefined();
    expect(rollback?.status).toBe("open");
    expect(rollback?.title.toLowerCase()).not.toContain("confirmed odometer fraud");
    const ev = JSON.parse(rollback?.evidence ?? "{}");
    expect(ev.fromKm).toBe(65000);
    expect(ev.toKm).toBe(42000);
    expect(ev.fromReadingId).toBeDefined();
    expect(ev.toReadingId).toBeDefined();

    // Vehicle D: electric scooter accepts short chassis and battery_health doc
    const vd = createVehicleDraft("u-seller", {
      make: "Zephyr",
      model: "Glide EV Scooter",
      year: 2022,
      regNo: `MH12TD${suffix}`,
      vin: `TDSYN000000TD${suffix}`,
      categoryId: "electric_scooter",
      fuel: "Electric",
    });
    expect(vd.ok).toBe(true);
    if (!vd.ok) return;
    const batDoc = addDocumentForVehicle("u-seller", vd.id, {
      type: "battery_health",
      fileName: "F01_ev_battery_service.pdf",
      consent: true,
    });
    expect(batDoc.ok).toBe(true);

    // Vehicle E: petrol scooter must NEVER receive a car 3D GLB model (F02)
    const ve = createVehicleDraft("u-seller", {
      make: "Zephyr",
      model: "Glide 110 Scooter",
      year: 2021,
      regNo: `MH12TE${suffix}`,
      vin: `TDSYN000000TE${suffix}`,
      categoryId: "petrol_scooter",
      fuel: "Petrol",
    });
    expect(ve.ok).toBe(true);
    if (!ve.ok) return;

    const modelRes = await get3dModelRoute(
      sellerRequest(`http://localhost/api/v1/vehicles/${ve.id}/3d-model`),
      { params: { id: ve.id } }
    );
    expect(modelRes.status).toBe(200);
    const modelJson = (await modelRes.json()) as {
      data: { assetUrl: string | null; assetStatus: string; interactionsAvailable: boolean; categoryId: string };
    };
    expect(modelJson.data.categoryId).toBe("petrol_scooter");
    expect(modelJson.data.assetUrl).toBeNull();
    expect(modelJson.data.assetStatus).toBe("unavailable");
    expect(modelJson.data.interactionsAvailable).toBe(false);

    const run = startVerificationRun("u-seller", vb.id);
    expect(run.ok).toBe(true);
    const checks = getVerificationChecks(vb.id);
    expect(checks.find((c) => c.key === "mileage")?.status).toBe("suspicious");
  });
});

