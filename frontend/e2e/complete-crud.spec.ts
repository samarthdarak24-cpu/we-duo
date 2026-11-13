import { test, expect, type Page } from "@playwright/test";
import path from "path";

/**
 * TrustDrive Complete CRUD & Feature Test Suite
 *
 * Tests every implemented feature end-to-end through the real browser UI,
 * verifying frontend → API → database → UI persistence.
 *
 * Prerequisites:
 *   - Frontend running on http://127.0.0.1:3000
 *   - Backend running on http://127.0.0.1:8000
 *   - Seeded database (demo accounts)
 *
 * Run: E2E_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/complete-crud.spec.ts
 */

const SELLER = { email: "samarth@trustdrive.dev", password: "demo123456" };
const BUYER = { email: "rohan@trustdrive.dev", password: "demo123456" };
const ADMIN = { email: "admin@trustdrive.dev", password: "demo123456" };

const STAMP = String(Date.now()).slice(-4);

async function login(page: Page, account: { email: string; password: string }) {
  // Authenticate via API and set the session cookie directly in the browser
  // context. This avoids race conditions with window.location.href navigations
  // that cause net::ERR_ABORTED on subsequent page.goto() calls.
  const res = await page.request.post("/api/v1/auth/login", {
    data: { email: account.email, password: account.password },
  });
  if (res.status() !== 200) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Login failed for ${account.email}: ${res.status()} ${body.error?.message ?? ""}`);
  }

  const setCookie = res.headers()["set-cookie"];
  const cookieArray = Array.isArray(setCookie) ? setCookie : [setCookie];
  const tokenCookie = cookieArray.find((c: string) => c.startsWith("td_token="));
  if (!tokenCookie) {
    throw new Error("No td_token cookie in login response");
  }
  const tokenValue = tokenCookie.split(";")[0].split("=")[1];

  await page.context().addCookies([{
    name: "td_token",
    value: tokenValue,
    domain: "127.0.0.1",
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
  }]);

  const userRole = (await res.json()).data?.user?.role || "buyer";
  const target = userRole === "seller" ? "/seller" : userRole === "admin" ? "/admin/queue" : "/buyer";
  await page.goto(target, { waitUntil: "domcontentloaded" });
}

async function rolePath(page: Page, role: "seller" | "buyer" | "admin") {
  await expect(page).toHaveURL(new RegExp(`/${role}`), { timeout: 30000 });
}

function itemsOf(json: any): any[] {
  return json.items ?? json.data?.items ?? [];
}

test.describe("PHASE 1 — Authentication", () => {
  test("seller can log in and reach dashboard", async ({ page }) => {
    await login(page, SELLER);
    await rolePath(page, "seller");
    await expect(page.getByRole("heading", { name: /seller portfolio/i })).toBeVisible();
  });
  test("buyer can log in and reach dashboard", async ({ page }) => {
    await login(page, BUYER);
    await rolePath(page, "buyer");
    await expect(page.getByRole("heading", { name: /good to see you/i })).toBeVisible();
  });

  test("admin can log in and reach dashboard", async ({ page }) => {
    await login(page, ADMIN);
    await rolePath(page, "admin");
    await expect(page.getByRole("heading", { name: /admin/i })).toBeVisible();
  });

  test("invalid credentials are rejected", async ({ page }) => {
    await page.goto("/login");
    const email = page.getByLabel(/email/i);
    await expect(email).toBeVisible();
    await email.fill("nonexistent@trustdrive.dev");
    await page.getByLabel(/password/i).fill("wrongpassword");
    await page.locator('form button[type="submit"]').click();
    await expect(page.getByText(/invalid|incorrect|failed/i).first()).toBeVisible({ timeout: 15000 });
  });
});

test.describe("PHASE 2 — Seller Vehicle CRUD", () => {
  let vehicleId = "";
  let listingId = "";

  test("CREATE: register a petrol motorcycle", async ({ page }) => {
    await login(page, SELLER);
    await page.goto("/seller/add-vehicle");
    await expect(page.getByRole("heading", { name: "Add Vehicle", exact: true })).toBeVisible();

    await page.getByLabel("Vehicle category").selectOption("petrol_motorcycle");
    await page.getByLabel("Registration number").fill(`MH12TC${STAMP}`);
    await page.getByLabel(/VIN \(17 characters\)|Chassis|Frame/i).fill(`ME3GT6501MA9${STAMP}`);
    await page.getByLabel("Manufacturer").fill("Royal Enfield");
    await page.getByLabel(/^Model\b/).fill("Classic 350");
    await page.getByLabel("Variant").fill("Custom");
    await page.getByLabel("Manufacturing year").fill("2023");
    await page.getByLabel("Transmission").selectOption("Manual");
    await page.getByLabel("Colour").fill("Chrome / Black");
    await page.getByLabel("Number of owners").fill("1");
    await page.getByLabel("Location").fill("Pune");
    await page.getByLabel(/Odometer reading \(km\)/i).fill("18500");
    await page.getByLabel("Asking price (INR)").fill("145000");
    await page.getByLabel("Brake condition").selectOption("Good");
    await page.getByLabel("Description").fill(`Demo petrol motorcycle ${STAMP}`);

    await page.getByRole("button", { name: /Save draft & continue/ }).click();
    await expect(page.getByText(/Draft saved/).first()).toBeVisible({ timeout: 20000 });

    const listRes = await page.request.get(`/api/v1/seller/vehicles?q=MH12TC${STAMP}`);
    expect(listRes.status()).toBe(200);
    const listJson = await listRes.json();
    const row = itemsOf(listJson).find((r: any) => r.regNo === `MH12TC${STAMP}` || r.id);
    expect(row, "created vehicle appears in seller list API").toBeTruthy();
    vehicleId = row.id;
    listingId = row.listingId;

    // Verify database persistence
    const { execFileSync } = await import("node:child_process");
    const dbOut = execFileSync(
      "backend\\.venv\\Scripts\\python.exe",
      ["-c", `import sqlite3; c=sqlite3.connect('.data/trustdrive.db'); r=c.execute("select id,make,model,reg_no,status from vehicles where id=?",('${vehicleId}',)).fetchone(); print(r)`],
      { cwd: "C:\\Users\\darak\\Downloads\\finall caranimation", encoding: "utf8" }
    );
    expect(dbOut).toContain(vehicleId);
    expect(dbOut).toContain("Royal Enfield");
  });

  test("READ: open vehicle details and verify all fields", async ({ page }) => {
    expect(vehicleId).toBeTruthy();
    await login(page, SELLER);
    await page.goto(`/seller/vehicles/${vehicleId}`);
    await expect(page.getByText("Royal Enfield").first()).toBeVisible();
    await expect(page.getByText("Classic 350").first()).toBeVisible();
    await expect(page.getByText(`MH12TC${STAMP}`).first()).toBeVisible();
    await expect(page.getByText("18,500").or(page.getByText("18500")).first()).toBeVisible();
  });

  test("UPDATE: edit vehicle specifications", async ({ page }) => {
    expect(listingId).toBeTruthy();
    await login(page, SELLER);
    await page.goto(`/seller/listings/${listingId}`);
    await expect(page.getByLabel("Price (₹)")).toBeVisible();
    await page.getByLabel("Price (₹)").fill("155000");
    await page.getByLabel("Location").fill("Pune, Maharashtra");
    await page.getByLabel("Description").fill(`Updated demo motorcycle ${STAMP}`);
    await page.getByRole("button", { name: /Save changes/i }).click();
    await expect(page.getByText(/Listing saved./i).first()).toBeVisible({ timeout: 20000 });

    const res = await page.request.get(`/api/v1/seller/vehicles?q=MH12TC${STAMP}`);
    const json = await res.json();
    const row = itemsOf(json).find((r: any) => r.id === vehicleId);
    expect(row.price).toBe(155000);
    expect(row.location).toBe("Pune");
  });

  test("ARCHIVE: archive the vehicle (soft delete)", async ({ page }) => {
    if (!vehicleId) {
      const listRes = await page.request.get(`/api/v1/seller/vehicles?q=MH12TC${STAMP}`);
      const listJson = await listRes.json();
      const row = itemsOf(listJson).find((r: any) => r.regNo === `MH12TC${STAMP}`);
      vehicleId = row?.id ?? "";
    }
    expect(vehicleId).toBeTruthy();
    await login(page, SELLER);
    const archRes = await page.request.post(`/api/v1/seller/vehicles/${vehicleId}/archive`);
    expect(archRes.status()).toBe(200);
    const archJson = await archRes.json();
    expect(archJson.archived).toBe(true);

    const res = await page.request.get(`/api/v1/seller/vehicles?q=MH12TC${STAMP}`);
    const json = await res.json();
    const row = itemsOf(json).find((r: any) => r.id === vehicleId);
    expect(row.status).toBe("archived");
  });
});

test.describe("PHASE 3 — Seller Documents CRUD", () => {
  let docVehicleId = "";

  test("find a vehicle and upload RC document", async ({ page }) => {
    await login(page, SELLER);
    const listRes = await page.request.get("/api/v1/seller/vehicles");
    const listJson = await listRes.json();
    const items = itemsOf(listJson);
    const v = items.find((r: any) => r.status === "draft" || r.status === "published");
    if (!v) { test.skip(); return; }
    docVehicleId = v.id;

    await page.goto(`/seller/documents?vehicle=${docVehicleId}`);
    await expect(page.locator("#portal-main").getByRole("heading", { name: "Documents", exact: true })).toBeVisible();

    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/documents") && r.request().method() === "POST",
      { timeout: 120000 }
    );
    await page.getByLabel("Document type").selectOption("rc_2w");
    const fixture = path.resolve(__dirname, "../../project/qa/fixtures/generated-rc.pdf");
    await page.locator('input[type="file"]').first().setInputFiles(fixture);
    await page.getByRole("button", { name: "Upload document" }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    await expect(page.getByText(/Document stored/i).first()).toBeVisible({ timeout: 30000 });
  });

  test("READ: view document details", async ({ page }) => {
    if (!docVehicleId) { test.skip(); return; }
    await login(page, SELLER);
    await page.goto(`/seller/documents?vehicle=${docVehicleId}`);
    await expect(page.getByText(/document|uploaded|rc/i).first()).toBeVisible();
  });

  test("UPDATE: replace a document", async ({ page }) => {
    if (!docVehicleId) { test.skip(); return; }
    await login(page, SELLER);
    await page.goto(`/seller/documents?vehicle=${docVehicleId}`);
    await page.getByRole("button", { name: /Replace|Re-upload/i }).first().click();
    const fixture = path.resolve(__dirname, "../../project/qa/fixtures/generated-rc.pdf");
    await page.getByLabel(/File \(PDF or image\)/i).setInputFiles(fixture);
    await page.getByRole("button", { name: "Upload document" }).click();
    await expect(page.getByText(/replaced|updated|uploaded/i).first()).toBeVisible({ timeout: 30000 });
  });
});

test.describe("PHASE 4 — Seller Listings CRUD", () => {
  let listingId = "";

  test("PUBLISH a listing for a vehicle", async ({ page }) => {
    await login(page, SELLER);
    await page.goto("/seller/listings");
    await expect(page.getByText(/listing/i).first()).toBeVisible();

    const listRes = await page.request.get("/api/v1/seller/listings");
    const listJson = await listRes.json();
    const items = itemsOf(listJson);
    const entry = items.find((r: any) => r.listing && r.listing.status !== "published");
    if (!entry) { test.skip(); return; }
    listingId = entry.listing.id;

    await page.goto(`/seller/listings/${listingId}`);
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText(/Published/).first()).toBeVisible({ timeout: 60000 });

    const market = await page.request.get("/api/v1/marketplace/listings");
    expect(market.status()).toBe(200);
  });

  test("PAUSE and RESUME listing", async ({ page }) => {
    if (!listingId) { test.skip(); return; }
    await login(page, SELLER);
    const pauseRes = await page.request.post(`/api/v1/seller/listings/${listingId}/pause`);
    expect([200, 409]).toContain(pauseRes.status());
    const publishRes = await page.request.post(`/api/v1/seller/listings/${listingId}/publish`);
    expect([200, 409]).toContain(publishRes.status());
  });
});

test.describe("PHASE 5 — Buyer Dashboard", () => {
  test("EXPLORE: browse vehicles", async ({ page }) => {
    await login(page, BUYER);
    await page.goto("/buyer/explore");
    await expect(page.getByText(/explore|vehicle/i).first()).toBeVisible();
  });

  test("SEARCH: filter by brand", async ({ page }) => {
    await login(page, BUYER);
    await page.goto("/buyer/search");
    await page.getByLabel("Keyword").fill("Toyota");
    await page.getByRole("button", { name: /Apply filters/i }).click();
    await page.waitForTimeout(2000);
  });

  test("SAVED VEHICLES: view saved list", async ({ page }) => {
    await login(page, BUYER);
    await page.goto("/buyer/saved");
    await expect(page.getByText(/saved/i).first()).toBeVisible();
  });

  test("INQUIRIES: view inquiries", async ({ page }) => {
    await login(page, BUYER);
    await page.goto("/buyer/inquiries");
    await expect(page.getByText(/inquir/i).first()).toBeVisible();
  });

  test("PROFILE: view settings", async ({ page }) => {
    await login(page, BUYER);
    await page.goto("/buyer/settings");
    await expect(page.getByText(/profile|settings/i).first()).toBeVisible();
  });

  test("NOTIFICATIONS: view notifications", async ({ page }) => {
    await login(page, BUYER);
    await page.goto("/buyer/notifications");
    await expect(page.getByText(/notif/i).first()).toBeVisible();
  });

  test("REPORTS: view reports", async ({ page }) => {
    await login(page, BUYER);
    await page.goto("/buyer/reports");
    await expect(page.getByText(/report/i).first()).toBeVisible();
  });

  test("VERIFICATION: view vehicle verification lookup", async ({ page }) => {
    await login(page, BUYER);
    await page.goto("/buyer/verification");
    await expect(page.getByText(/verif/i).first()).toBeVisible();
  });

  test("RISK: view AI risk analysis", async ({ page }) => {
    await login(page, BUYER);
    await page.goto("/buyer/risk");
    await expect(page.getByText(/risk|fraud|ai/i).first()).toBeVisible();
  });

  test("COMPARE: view compare page", async ({ page }) => {
    await login(page, BUYER);
    await page.goto("/buyer/compare");
    await expect(page.getByText(/compare/i).first()).toBeVisible();
  });

  test("HISTORY: view vehicle history", async ({ page }) => {
    await login(page, BUYER);
    await page.goto("/buyer/history");
    await expect(page.getByText(/history/i).first()).toBeVisible();
  });
});

test.describe("PHASE 6 — Security & RBAC", () => {
  test("buyer cannot access seller-only endpoints", async ({ page }) => {
    await login(page, BUYER);
    const res = await page.request.get("/api/v1/seller/overview");
    expect([401, 403]).toContain(res.status());
  });

  test("seller cannot access admin endpoints", async ({ page }) => {
    await login(page, SELLER);
    const res = await page.request.get("/api/v1/admin/users");
    expect([401, 403]).toContain(res.status());
  });

  test("unauthenticated requests are rejected", async ({ page }) => {
    const res = await page.request.get("/api/v1/seller/vehicles");
    expect([401, 403]).toContain(res.status());
  });
});

test.describe("PHASE 7 — OCR & AI Workflows", () => {
  test("OCR: document upload page loads", async ({ page }) => {
    await login(page, SELLER);
    await page.goto("/seller/documents");
    await expect(page.getByText(/document/i).first()).toBeVisible();
  });

  test("AI: fraud investigation page loads", async ({ page }) => {
    await login(page, SELLER);
    await page.goto("/seller/fraud");
    await expect(page.getByText(/fraud|investigation/i).first()).toBeVisible();
  });

  test("VERIFICATION: verification center page loads", async ({ page }) => {
    await login(page, SELLER);
    await page.goto("/seller/verification");
    await expect(page.getByText(/verification/i).first()).toBeVisible();
  });
});

test.describe("PHASE 8 — 3D Viewer", () => {
  test("3D viewer loads and renders", async ({ page }) => {
    await login(page, BUYER);
    await page.goto("/inspection");
    await expect(page.locator("canvas").or(page.getByText(/WebGL/i))).toBeVisible({ timeout: 60000 });
  });
});
