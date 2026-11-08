import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Deep integration proof — unlike the 21-step smoke spec, every step here
 * performs the real user action and asserts the persisted backend result.
 *
 * Fixtures are generated at run time with the same registration/VIN that the
 * wizard submits, so the OCR comparison is a genuine match rather than a
 * pre-baked document that only looks right.
 */
const SELLER = { email: "samarth@trustdrive.dev", password: "demo1234" };
const BUYER = { email: "rohan@trustdrive.dev", password: "demo1234" };
const STAMP = String(Date.now()).slice(-4);
const REG = `MH14TD${STAMP}`;
const VIN = `WBA5R1C50KAK9${STAMP}`;
const RC_PDF = path.resolve("..", "project", "qa", "fixtures", "generated-rc.pdf");
const RC_PNG = path.resolve("..", "project", "qa", "fixtures", "generated-rc.png");
const SCREENS = path.resolve("..", "project", "docs", "screenshots", "live");

/**
 * Resolve a Python interpreter that actually has PyMuPDF. `python` on PATH is
 * not necessarily the one holding the backend dependencies, so prefer the
 * project venv (only if it runs) and fall back to PATH.
 */
function resolvePython(): string {
  const candidates = [
    process.env.TD_PYTHON,
    path.resolve(__dirname, "../../backend/.venv/Scripts/python.exe"),
    path.resolve(__dirname, "../../backend/.venv/bin/python"),
    "python3",
    "python",
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["-c", "import pymupdf"], { stdio: "ignore" });
      return candidate;
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error(
    "No Python interpreter with PyMuPDF found for the RC fixture generator. " +
      "Install it in backend/.venv (pip install PyMuPDF) or set TD_PYTHON."
  );
}

let vehicleId = "";
let listingId = "";
const stampText = `Integration ${STAMP}`;

function makeFixture() {
  const script = `
import sys, pymupdf
reg, vin, out_pdf, out_png = sys.argv[1:5]
doc = pymupdf.open()
p = doc.new_page(width=1000, height=700)
p.insert_text((60, 90), "GOVERNMENT OF MAHARASHTRA", fontsize=24, fontname="helv")
p.insert_text((60, 130), "REGISTRATION CERTIFICATE", fontsize=20, fontname="helv")
lines = [
  "Registration Number: " + reg,
  "VIN: " + vin,
  "Owner: Samarth Deshmukh",
  "Make: BMW   Model: 3 Series   Year: 2015",
  "Fuel: Diesel   Colour: Grey",
  "Registration Date: 12-04-2016",
  "Valid Till: 11-04-2031",
]
y = 200
for line in lines:
  p.insert_text((60, y), line, fontsize=18, fontname="helv")
  y += 48
p.insert_text((60, 560), "Demo document generated for TrustDrive integration testing.", fontsize=11, fontname="helv")
doc.save(out_pdf)
p.get_pixmap(dpi=170).save(out_png)
print("fixture-ok", reg, vin)
`;
  execFileSync(resolvePython(), ["-c", script, REG, VIN, RC_PDF, RC_PNG], { stdio: "pipe" });
}

async function login(page: Page, role: "seller" | "buyer") {
  const account = role === "seller" ? SELLER : BUYER;
  await page.goto("/login");
  const email = page.getByLabel(/email/i);
  await expect(email).toBeVisible();
  for (let attempt = 0; attempt < 4; attempt++) {
    await email.fill(account.email);
    await page.waitForTimeout(250);
    if ((await email.inputValue()) === account.email) break;
  }
  await expect(email).toHaveValue(account.email);
  await page.getByLabel(/password/i).fill(account.password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`/${role}`), { timeout: 30_000 });
}

async function uploadDocument(page: Page, type: string, file: string) {
  await page.getByLabel("Document type").selectOption(type);
  await page.getByLabel(/File \(PDF or image/).setInputFiles(file);
  const responsePromise = page.waitForResponse(
    (r) => r.url().includes("/documents") && r.request().method() === "POST",
    { timeout: 180_000 }
  );
  await page.getByRole("button", { name: "Upload document" }).click();
  const response = await responsePromise;
  expect(response.status(), `upload ${type} status`).toBe(201);
  const payload = (await response.json()) as {
    data?: { id?: string; ocr?: { status?: string; engine?: string; method?: string } };
  };
  await expect(page.getByText(/Document uploaded/)).toBeVisible({ timeout: 30_000 });
  return { id: payload.data?.id ?? "", ocr: payload.data?.ocr };
}

test.describe.configure({ mode: "serial" });

test.describe("TrustDrive deep integration", () => {
  test.beforeAll(() => {
    makeFixture();
  });

  test("seller creates a vehicle, uploads evidence, runs checks and publishes", async ({ page }) => {
    test.setTimeout(420_000);
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(e.message));

    await login(page, "seller");
    await page.goto("/seller/add-vehicle");
    await expect(page.getByRole("heading", { name: "Add Vehicle", exact: true })).toBeVisible();

    // The category drives the rest of the form (fields, validation, documents),
    // so it is selected before any identity value is entered.
    await page.getByLabel("Vehicle category").selectOption("passenger_car");
    await page.getByLabel("Registration number").fill(REG);
    await page.getByLabel(/VIN \(17 characters\)/).fill(VIN);
    await page.getByLabel("Manufacturer").fill("BMW");
    await page.getByLabel(/^Model\b/).fill("3 Series");
    await page.getByLabel("Variant").fill("330i");
    await page.getByLabel("Manufacturing year").fill("2015");
    await page.getByLabel("Transmission").selectOption("Automatic");
    await page.getByLabel("Colour").fill("Grey");
    await page.getByLabel("Number of owners").fill("1");
    await page.getByLabel("Location").fill("Mumbai");
    await page.getByLabel(/Odometer reading \(km\)/).fill("45210");
    await page.getByLabel("Asking price (INR)").fill("1850000");
    await page.getByLabel("Exterior condition").selectOption("Good");
    await page.getByLabel("Description").fill(`${stampText} — verified demo vehicle for integration testing.`);

    await page.getByRole("button", { name: /Save draft & continue/ }).click();
    await expect(page.getByText(/Draft saved/)).toBeVisible({ timeout: 20_000 });

    const listRes = await page.request.get(`/api/v1/seller/vehicles?q=${REG}`);
    expect(listRes.status()).toBe(200);
    const listJson = (await listRes.json()) as {
      data?: { items?: { vehicle: { id: string }; listing?: { id: string } | null }[] };
    };
    const row = listJson.data?.items?.find((i) => i.vehicle.id);
    expect(row, "created vehicle is returned by the seller list API").toBeTruthy();
    vehicleId = row!.vehicle.id;
    listingId = row!.listing?.id ?? `l-${vehicleId}`;

    // Step 2 — real photo uploads (publish gate requires 3).
    await page.getByRole("button", { name: "Continue" }).click();
    await page
      .locator('input[aria-label="Vehicle photos"]')
      .setInputFiles([
        path.resolve("..", "frontend", "public", "frames", "ezgif-frame-001.jpg"),
        path.resolve("..", "frontend", "public", "frames", "ezgif-frame-002.jpg"),
        path.resolve("..", "frontend", "public", "frames", "ezgif-frame-003.jpg"),
      ]);
    await page.getByRole("button", { name: "Upload photos" }).click();
    await expect(page.getByText(/3 photo\(s\) added/)).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: path.join(SCREENS, "01-vehicle-photos.png") });

    // Step 3 — evidence uploads, each waiting for the real extraction result.
    await page.getByRole("button", { name: "Continue" }).click();
    const rc = await uploadDocument(page, "rc", RC_PDF);
    expect(rc.ocr?.status, "RC extraction ran").toBe("processed");
    const insurance = await uploadDocument(page, "insurance", RC_PDF);
    expect(insurance.ocr?.status, "insurance extraction ran").toBe("processed");
    const puc = await uploadDocument(page, "puc", RC_PDF);
    expect(puc.ocr?.status, "PUC extraction ran").toBe("processed");
    await page.screenshot({ path: path.join(SCREENS, "02-documents-uploaded.png") });

    // Image upload runs real OCR, not a PDF text layer.
    await page.goto(`/seller/documents?vehicle=${vehicleId}`);
    await page.getByLabel("Document type").selectOption("inspection");
    await page.getByLabel(/File \(PDF or image/).setInputFiles(RC_PNG);
    const ocrResponsePromise = page.waitForResponse(
      (r) => r.url().includes("/documents") && r.request().method() === "POST",
      { timeout: 240_000 }
    );
    await page.getByRole("button", { name: "Upload document" }).click();
    const ocrResponse = await ocrResponsePromise;
    expect(ocrResponse.status()).toBe(201);
    const ocrJson = (await ocrResponse.json()) as {
      data?: { ocr?: { status?: string; engine?: string; isOcr?: boolean; confidence?: number } };
    };
    expect(ocrJson.data?.ocr?.status).toBe("processed");
    expect(ocrJson.data?.ocr?.isOcr, "image was read by OCR").toBe(true);
    expect(ocrJson.data?.ocr?.engine ?? "").toMatch(/rapidocr|paddle/i);
    await expect(page.getByText(/OCR complete via/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Parsed fields/).first()).toBeVisible();
    await expect(page.getByText(new RegExp(REG)).first()).toBeVisible();
    await page.screenshot({ path: path.join(SCREENS, "03-ocr-fields.png") });

    // Verification center — real deterministic run.
    await page.goto(`/seller/verification?vehicle=${vehicleId}`);
    await page.getByRole("button", { name: "Re-run verification" }).click();
    await expect(page.getByText(/Run complete/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Last run/i)).toBeVisible();
    await page.screenshot({ path: path.join(SCREENS, "04-verification.png") });

    // AI investigation — real persisted run.
    await page.goto(`/seller/fraud?vehicle=${vehicleId}`);
    await page.getByRole("button", { name: "Run investigation" }).click();
    await expect(page.getByText(/investigation:/i)).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText(/Previous runs/i)).toBeVisible();
    await page.screenshot({ path: path.join(SCREENS, "05-ai-investigation.png") });

    // Damage record through the real editor.
    await page.goto(`/seller/vehicles/${vehicleId}`);
    await page.getByRole("button", { name: "Add damage" }).click();
    await page.getByLabel("Zone").selectOption({ index: 1 });
    await page.getByLabel("Severity").selectOption("Major");
    await page.getByLabel("Repair status").selectOption({ index: 1 });
    await page.getByLabel("Description").fill(`${stampText} — rear quarter panel repainted.`);
    await page.getByRole("button", { name: "Save damage" }).click();
    await expect(page.getByText(/Damage recorded/)).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: path.join(SCREENS, "06-damage-recorded.png") });

    // Publish through the listing workspace.
    await page.goto(`/seller/listings/${listingId}`);
    await expect(page.getByRole("button", { name: "Publish" })).toBeVisible();
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText(/Published/).first()).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: path.join(SCREENS, "07-listing-published.png") });

    const market = await page.request.get(`/api/v1/marketplace/listings?q=${REG}`);
    expect(market.status()).toBe(200);
    const marketJson = (await market.json()) as { data?: { items?: unknown[] } };
    expect(marketJson.data?.items?.length, "published vehicle is visible in the marketplace API").toBeGreaterThan(0);

    const fatal = consoleErrors.filter((e) => !/WebGL|Context Lost|THREE/i.test(e));
    expect(fatal, `console errors: ${fatal.join(" | ")}`).toEqual([]);
  });

  test("buyer finds, saves, inspects and contacts about the vehicle", async ({ page }) => {
    test.setTimeout(300_000);
    await login(page, "buyer");

    await page.goto(`/vehicle/${vehicleId}`);
    await expect(page.getByText(new RegExp(REG)).first()).toBeVisible();
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: path.join(SCREENS, "08-buyer-3d.png") });

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: /Contact seller/ }).click();
    await page.getByRole("button", { name: /Request inspection/ }).click();
    await page.locator("#vehicle-inquiry").fill(`${stampText} — can I inspect this car this weekend?`);
    await page.getByRole("button", { name: /Send inquiry/ }).click();
    await expect(page.getByText(/Inquiry sent/)).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: path.join(SCREENS, "09-buyer-inquiry.png") });

    await page.goto("/buyer/saved");
    await expect(page.getByText(new RegExp(REG)).first()).toBeVisible();

    // Compare is backed by the real comparison endpoint.
    const compare = await page.request.post("/api/v1/compare", {
      data: { vehicleIds: [vehicleId, "v-bmw"] },
    });
    expect([200, 201]).toContain(compare.status());

    await page.goto("/buyer/reports");
    await expect(page.getByText(/Reports/i).first()).toBeVisible();
  });

  test("seller replies and the buyer receives the message", async ({ page }) => {
    test.setTimeout(240_000);
    const reply = `${stampText} — inspection confirmed for Saturday 11:00.`;
    await login(page, "seller");
    await page.goto(`/seller/inquiries?listing=${listingId}`);
    await page.getByText(new RegExp(stampText)).first().click();
    await page.getByLabel("Message", { exact: true }).fill(reply);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText(reply)).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: path.join(SCREENS, "10-seller-reply.png") });

    await login(page, "buyer");
    await page.goto("/buyer/inquiries");
    await expect(page.getByText(new RegExp(reply)).first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: path.join(SCREENS, "11-buyer-receives-reply.png") });
  });

  test("report PDF downloads and forged access is rejected", async ({ page }) => {
    test.setTimeout(240_000);
    await login(page, "seller");

    const created = await page.request.post(`/api/v1/reports/vehicle/${vehicleId}`, {
      data: { type: "full" },
    });
    expect([200, 201]).toContain(created.status());
    const createdJson = (await created.json()) as { data?: { id?: string } };
    const reportId = createdJson.data?.id;
    expect(reportId).toBeTruthy();

    const download = await page.request.get(`/api/v1/reports/${reportId}/download`);
    expect(download.status()).toBe(200);
    expect(download.headers()["content-type"]).toContain("application/pdf");
    const bytes = await download.body();
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");

    const anon = await page.request.get(`/api/v1/reports/${reportId}/download?token=forged`, {
      headers: { cookie: "" },
    });
    expect([401, 403]).toContain(anon.status());
  });

  test("validation and RBAC are enforced server-side", async ({ page }) => {
    await login(page, "seller");
    const duplicate = await page.request.post("/api/v1/seller/vehicles", {
      data: { regNo: REG, vin: VIN, make: "BMW", model: "3 Series", year: 2015 },
    });
    expect(duplicate.status()).toBe(409);
    const duplicateJson = (await duplicate.json()) as { error?: { code?: string } };
    expect(duplicateJson.error?.code).toBe("DUPLICATE_REG");

    const invalid = await page.request.post("/api/v1/seller/vehicles", {
      data: { regNo: "NOT-A-REG", make: "BMW", model: "3 Series", year: 2015 },
    });
    expect(invalid.status()).toBe(400);

    await login(page, "buyer");
    const forbidden = await page.request.get("/api/v1/seller/overview");
    expect([401, 403]).toContain(forbidden.status());
  });
});
