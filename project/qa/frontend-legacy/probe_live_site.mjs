import { chromium } from "@playwright/test";

const BASE = "https://trustdrive-live.apps.workbuddy.host";
const SC = "sharecode=W4ELB7QPSK";
const browser = await chromium.launch({ headless: true });
const results = [];

async function loginAs(email) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login?${SC}`, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(1800);
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill("demo123456");
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 20000 });
  return { ctx, page };
}

async function api(page, method, path, body) {
  return page.evaluate(async ({ method, path, body }) => {
    const res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    return { status: res.status, data };
  }, { method, path, body });
}

function check(label, ok, detail) {
  results.push({ label, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} — ${detail}`);
}

try {
  const seller = await loginAs("samarth@trustdrive.dev");
  const so = await api(seller.page, "GET", "/api/v1/seller/overview");
  check("published seller overview (authenticated)", so.status === 200, `status=${so.status}`);

  const stamp = Date.now().toString(36).toUpperCase();
  const created = await api(seller.page, "POST", "/api/v1/seller/vehicles", {
    categoryId: "passenger_car", make: "LiveProbe", model: `Pub-${stamp}`, year: 2022,
    regNo: "MH12AB" + String(Date.now()).slice(-4),
    vin: "WBATEST" + String(Date.now()).slice(-10),
    fuel: "Petrol", transmission: "Manual", category: "Sedan", location: "Pune",
    ownershipCount: 1, price: 910000, km: 12000,
  });
  const vid = created.data?.data?.id;
  check("published seller creates a real vehicle", created.status === 201 && !!vid, `status=${created.status} id=${vid}`);
  if (vid) {
    const read = await api(seller.page, "GET", `/api/v1/seller/vehicles/${vid}`);
    check("published vehicle persists in DB", read.status === 200 && read.data?.data?.id === vid, `status=${read.status}`);
    const hist = await api(seller.page, "POST", `/api/v1/vehicles/${vid}/history`, { category: "service", date: "2023-06-01", km: 10000, title: "Published live probe" });
    check("published history write", hist.status === 201, `status=${hist.status}`);
  }
  const listing = await api(seller.page, "GET", "/api/v1/seller/listings?pageSize=5");
  check("published seller listings", listing.status === 200 && (listing.data?.data?.items?.length ?? 0) > 0, `status=${listing.status}`);

  const buyer = await loginAs("aditya@trustdrive.dev");
  const bo = await api(buyer.page, "GET", "/api/v1/buyer/overview");
  check("published buyer overview (authenticated)", bo.status === 200, `status=${bo.status}`);
  const market = await api(buyer.page, "GET", "/api/v1/marketplace/listings?pageSize=5");
  const row = market.data?.data?.items?.[0];
  const lid = row?.listingId;
  check("published marketplace has real listings", !!lid, `listingId=${lid}`);
  if (lid) {
    const saved = await api(buyer.page, "POST", `/api/v1/saved/${lid}`);
    const list = await api(buyer.page, "GET", "/api/v1/saved");
    check("published buyer save persists", [200, 201, 409].includes(saved.status) && JSON.stringify(list.data).includes(lid), `save=${saved.status}`);
    const inquiry = await api(buyer.page, "POST", "/api/v1/inquiries", { listingId: lid, message: `Live published inquiry ${stamp}`, type: "general" });
    check("published buyer inquiry persists", [200, 201].includes(inquiry.status), `status=${inquiry.status}`);
  }
  const report = await api(buyer.page, "POST", `/api/v1/reports/vehicle/${row?.id || "v-bmw"}`, { type: "Vehicle verification" });
  check("published report generation", [200, 201].includes(report.status), `status=${report.status}`);
  const stack = await api(buyer.page, "GET", "/api/v1/ai/stack");
  check("published AI stack reports honest status", stack.status === 200 && stack.data?.data?.connected === false, `connected=${stack.data?.data?.connected}`);
} catch (e) {
  check("harness", false, String(e).slice(0, 220));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n=== PUBLISHED LIVE WIRING: ${results.length - failed.length}/${results.length} passed ===`);
if (failed.length) process.exitCode = 1;
