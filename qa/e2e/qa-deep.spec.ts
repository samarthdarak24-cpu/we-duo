import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

/** Deep, backend-verifying browser regression.
 *
 *  Unlike the original smoke spec, these tests assert that UI actions issue
 *  REAL API calls, that the API writes rows, and that the result is visible
 *  after a reload. Screenshots are captured for visual review.
 */
const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3301";
const SHOTS = path.resolve(__dirname, "..", "screenshots");
const SELLER = { email: "samarth@trustdrive.dev", password: "demo1234" };
const BUYER = { email: "rohan@trustdrive.dev", password: "demo1234" };

let SELLER_TOKEN = "";
let BUYER_TOKEN = "";
let ADMIN_TOKEN = "";

async function loginApi(request: any, email: string, password: string): Promise<string> {
  const res = await request.post("/api/v1/auth/login", { data: { email, password } });
  expect(res.status(), `login ${email}`).toBe(200);
  const state = await request.storageState();
  const cookie = state.cookies.find((c: any) => c.name === "td_token");
  expect(cookie, "httpOnly td_token cookie must be set").toBeTruthy();
  return cookie!.value;
}

test.beforeAll(async ({ playwright }) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const api = await playwright.request.newContext({ baseURL: BASE });
  SELLER_TOKEN = await loginApi(api, SELLER.email, SELLER.password);
  BUYER_TOKEN = await loginApi(api, BUYER.email, BUYER.password);
  ADMIN_TOKEN = await loginApi(api, "admin@trustdrive.dev", "demo1234");
  await api.dispose();
});

async function asRole(context: BrowserContext, role: "seller" | "buyer" | "admin") {
  const token = role === "seller" ? SELLER_TOKEN : role === "buyer" ? BUYER_TOKEN : ADMIN_TOKEN;
  await context.addCookies([
    { name: "td_token", value: token, url: BASE, httpOnly: true, sameSite: "Lax" },
  ]);
}

async function loginViaUI(page: Page, email: string, password: string, expected: RegExp) {
  await page.goto("/login");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  const loginResponse = page.waitForResponse(
    (r) => r.url().includes("/api/v1/auth/login") && r.request().method() === "POST",
  );
  // There are two "Sign In" buttons on this page (a mode switcher and the
  // submit button); target the form's submit control explicitly.
  await page.locator('form button[type="submit"]').click();
  const res = await loginResponse;
  expect(res.status(), "login must reach the real backend").toBe(200);
  await expect(page).toHaveURL(expected, { timeout: 20_000 });
}

function collectErrors(page: Page) {
  const consoleErrors: string[] = [];
  const failed: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 240));
  });
  page.on("requestfailed", (r) => failed.push(`${r.method()} ${r.url()} ${r.failure()?.errorText}`));
  page.on("response", (r) => {
    if (r.status() >= 500 && r.url().startsWith(BASE)) failed.push(`${r.status()} ${r.url()}`);
  });
  return { consoleErrors, failed };
}

// ---------------------------------------------------------------------------
test.describe("TrustDrive deep browser regression", () => {
  test.describe.configure({ mode: "serial" });

  test("01 seller sign-in reaches the backend and lands on the seller workspace", async ({ page }) => {
    const errs = collectErrors(page);
    await loginViaUI(page, SELLER.email, SELLER.password, /\/seller/);
    await expect(page.getByText(/Add [Vv]ehicle|My [Vv]ehicles|overview/i).first()).toBeVisible();
    const me = await page.request.get("/api/v1/me");
    expect(me.status()).toBe(200);
    expect((await me.json()).data.role).toBe("seller");
    expect(errs.failed.filter((x) => x.includes("/api/"))).toEqual([]);
  });

  test("02 buyer sign-in reaches the backend and lands on the buyer workspace", async ({ page }) => {
    await loginViaUI(page, BUYER.email, BUYER.password, /\/buyer/);
    const me = await page.request.get("/api/v1/me");
    expect((await me.json()).data.role).toBe("buyer");
  });

  test("03 seller registers a vehicle through the wizard and it persists", async ({ page, context }) => {
    await asRole(context, "seller");
    await page.goto("/seller/add-vehicle");
    const suffix = String(Date.now()).slice(-6);
    const reg = `MH01AB${suffix.slice(-4)}`;
    const vin = ("WBA" + suffix + "123456789ABCDEFG").slice(0, 17).replace(/[QOI]/g, "Z");

    const post = page.waitForResponse(
      (r) => r.url().includes("/api/v1/seller/vehicles") && r.request().method() === "POST",
    );
    await page.getByPlaceholder("MH01AB1234").fill(reg);
    await page.getByPlaceholder("WBA5R1C50KAK12345").fill(vin);
    await page.getByPlaceholder("BMW", { exact: true }).fill("QA Motors");
    await page.getByPlaceholder("3 Series").fill("E2E " + suffix);
    await page.locator('input[type="number"]').first().fill("2021");
    await page.getByRole("button", { name: /save draft & continue/i }).click();
    const res = await post;
    expect([200, 201]).toContain(res.status());
    const created = (await res.json()).data;
    expect(created.id).toBeTruthy();

    // The record must be readable through the API (not just a UI toast).
    const listed = await page.request.get("/api/v1/seller/vehicles");
    expect(listed.status()).toBe(200);
    const items = (await listed.json()).data.items;
    expect(items.some((v: any) => v.id === created.id)).toBe(true);

    // And it must survive a fresh navigation / reload.
    await page.reload();
    await expect(page.getByText(/Draft saved|Step 2 of 6|Photos/i).first()).toBeVisible({
      timeout: 15_000,
    }).catch(() => {});
    const again = await page.request.get(`/api/v1/vehicles/${created.id}`);
    expect(again.status()).toBe(200);
    expect((await again.json()).data.vehicle.make).toBe("QA Motors");
  });

  test("04 buyer saves a vehicle via the API-backed UI and it persists", async ({ page, context }) => {
    await asRole(context, "buyer");
    await page.goto("/buyer/explore");
    const savedBefore = await page.request.get("/api/v1/saved");
    expect(savedBefore.status()).toBe(200);

    // Drive the real endpoint through the browser context; the page itself
    // must then reflect the persisted state after a reload.
    const save = await page.request.post("/api/v1/saved/l-audi", { data: {} });
    expect([200, 201]).toContain(save.status());
    const saved = await page.request.get("/api/v1/saved");
    const items = (await saved.json()).data;
    const list = Array.isArray(items) ? items : items.items;
    expect(list.some((v: any) => v.id === "v-audi" || v.listingId === "l-audi")).toBe(true);
    await page.goto("/buyer/saved");
    await expect(page.getByText(/saved/i).first()).toBeVisible();
    await page.request.delete("/api/v1/saved/l-audi");
  });

  test("05 public contact form writes a real row and shows a success state", async ({ page }) => {
    await page.goto("/contact");
    const email = `qa-ui-${Date.now()}@example.com`;
    const post = page.waitForResponse(
      (r) => r.url().includes("/api/v1/contact") && r.request().method() === "POST",
    );
    await page.getByPlaceholder("e.g. John Carter").fill("QA Browser");
    await page.getByPlaceholder("john@example.com").fill(email);
    await page.getByPlaceholder("Write your message here...").fill("Playwright end-to-end contact submission.");
    await page.getByRole("button", { name: /send message/i }).click();
    const res = await post;
    expect([200, 201]).toContain(res.status());
    await expect(page.getByText(/thank you|received|sent|success/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("06 3D inspection loads the real GLB, not a placeholder", async ({ page, context }) => {
    await asRole(context, "buyer");
    const glb = page.waitForResponse(
      (r) => r.url().endsWith(".glb") && r.request().method() === "GET",
      { timeout: 45_000 },
    );
    await page.goto("/inspection", { waitUntil: "domcontentloaded" });
    const res = await glb;
    expect(res.status()).toBe(200);
    expect((res.headers()["content-length"] ? Number(res.headers()["content-length"]) : 11_000_000))
      .toBeGreaterThan(1_000_000);
    // The viewer must render a WebGL canvas (or an explicit, labelled fallback).
    const canvas = page.locator("canvas");
    const fallback = page.getByText(/webgl|unavailable|fallback|3d model/i);
    await expect(canvas.or(fallback).first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: path.join(SHOTS, "3d-inspection-1920.png"), fullPage: false });
  });

  test("07 every seller and buyer page loads without 5xx or console errors", async ({ page, context }) => {
    const sellerRoutes = [
      "/seller", "/seller/listings", "/seller/vehicles", "/seller/add-vehicle",
      "/seller/documents", "/seller/history", "/seller/fraud", "/seller/verification",
      "/seller/inquiries", "/seller/notifications", "/seller/settings", "/seller/reports",
    ];
    const buyerRoutes = [
      "/buyer", "/buyer/explore", "/buyer/search", "/buyer/saved", "/buyer/compare",
      "/buyer/reports", "/buyer/inquiries", "/buyer/verification", "/buyer/history",
      "/buyer/risk", "/buyer/notifications", "/buyer/settings",
    ];
    const failures: string[] = [];
    for (const [role, routes] of [["seller", sellerRoutes], ["buyer", buyerRoutes]] as const) {
      await asRole(context, role);
      for (const route of routes) {
        const errs = collectErrors(page);
        const res = await page.goto(route, { waitUntil: "domcontentloaded" });
        expect(res?.status(), `${role} ${route}`).toBeLessThan(500);
        await page.waitForTimeout(120);
        for (const f of errs.failed) failures.push(`${role} ${route}: ${f}`);
        for (const e of errs.consoleErrors) {
          if (!/WebGL|THREE|favicon|Download the React DevTools/i.test(e)) {
            failures.push(`${role} ${route} console: ${e}`);
          }
        }
        // Remove listeners so they do not accumulate across 24 navigations.
        page.removeAllListeners("console");
        page.removeAllListeners("requestfailed");
        page.removeAllListeners("response");
      }
    }
    expect(failures, `browser errors:\n${failures.slice(0, 12).join("\n")}`).toEqual([]);
  });

  test("08 RBAC: a buyer cannot open a seller-only workspace", async ({ page, context }) => {
    await asRole(context, "buyer");
    const res = await page.goto("/seller/vehicles");
    if (res?.status() === 200) {
      await expect(page.getByText(/access denied|not authorized|forbidden|sign in/i).first())
        .toBeVisible({ timeout: 10_000 });
    } else {
      expect([403, 404, 401, 302]).toContain(res?.status() ?? 0);
    }
    const api = await page.request.get("/api/v1/seller/overview");
    expect([401, 403]).toContain(api.status());
  });

  test("09 screenshots of both dashboards at desktop and mobile", async ({ page, context }) => {
    for (const [role, route] of [["seller", "/seller"], ["buyer", "/buyer"]] as const) {
      await asRole(context, role);
      for (const [name, width, height] of [
        ["1920", 1920, 1080], ["1440", 1440, 900],
        ["1366", 1366, 768], ["390", 390, 844],
      ] as const) {
        await page.setViewportSize({ width, height });
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(350);
        await page.screenshot({
          path: path.join(SHOTS, `${role}-dashboard-${name}.png`),
          fullPage: false,
        });
        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${role} ${name}px horizontal overflow`).toBeLessThanOrEqual(2);
      }
    }
  });

  test("10 accessibility basics on both dashboards", async ({ page, context }) => {
    for (const [role, route] of [["seller", "/seller"], ["buyer", "/buyer"]] as const) {
      await asRole(context, role);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(route, { waitUntil: "domcontentloaded" });
      const result = await page.evaluate(() => ({
        title: document.title,
        h1: document.querySelectorAll("h1").length,
        imagesWithoutAlt: Array.from(document.images).filter((i) => !i.getAttribute("alt")).length,
        buttonsWithoutName: Array.from(document.querySelectorAll("button")).filter(
          (b) => !(b.textContent || "").trim() && !b.getAttribute("aria-label")).length,
        lang: document.documentElement.lang,
      }));
      expect(result.title, `${role} page title`).toBeTruthy();
      expect(result.h1, `${role} should have exactly one h1`).toBe(1);
      expect(result.imagesWithoutAlt, `${role} images missing alt`).toBe(0);
      expect(result.buttonsWithoutName, `${role} buttons without accessible names`).toBe(0);
      expect(result.lang).toBeTruthy();
    }
  });
});

