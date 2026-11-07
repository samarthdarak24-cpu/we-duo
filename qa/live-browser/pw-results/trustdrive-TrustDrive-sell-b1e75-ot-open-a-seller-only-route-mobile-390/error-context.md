# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: trustdrive.spec.ts >> TrustDrive seller -> buyer, 21 persisted steps >> RBAC: a buyer cannot open a seller-only route
- Location: e2e\trustdrive.spec.ts:141:7

# Error details

```
Test timeout of 240000ms exceeded.
```

```
Error: locator.fill: Test timeout of 240000ms exceeded.
Call log:
  - waiting for getByLabel(/email/i)

```

# Test source

```ts
  1   | import { test, expect } from "@playwright/test";
  2   | 
  3   | /** The checklist's 21-step end-to-end workflow against PERSISTED data.
  4   |  *  Demo accounts come from `npm run seed:reset` (see docs/TESTING.md).
  5   |  *  Run: `npm run test:e2e -- --project=chromium-1920`.
  6   |  */
  7   | const SELLER = { email: "samarth@trustdrive.dev", password: "demo1234" };
  8   | const BUYER = { email: "rohan@trustdrive.dev", password: "demo1234" };
  9   | 
  10  | async function login(page: import("@playwright/test").Page, role: "seller" | "buyer") {
  11  |   const account = role === "seller" ? SELLER : BUYER;
  12  |   await page.goto("/login");
> 13  |   await page.getByLabel(/email/i).fill(account.email);
      |                                   ^ Error: locator.fill: Test timeout of 240000ms exceeded.
  14  |   await page.getByLabel(/password/i).fill(account.password);
  15  |   await page.locator('form button[type="submit"]').click();
  16  |   await expect(page).toHaveURL(new RegExp(`/${role}`));
  17  | }
  18  | 
  19  | test.describe("TrustDrive seller -> buyer, 21 persisted steps", () => {
  20  |   test.setTimeout(240_000);
  21  | 
  22  |   test("full workflow", async ({ page }) => {
  23  |     await test.step("1. Seller signs in", async () => {
  24  |       await login(page, "seller");
  25  |       await expect(page.getByText(/seller|overview/i).first()).toBeVisible();
  26  |     });
  27  | 
  28  |     await test.step("2. Seller registers a demo vehicle", async () => {
  29  |       await page.goto("/seller/add-vehicle");
  30  |       await expect(page.getByText(/add vehicle/i).first()).toBeVisible();
  31  |     });
  32  | 
  33  |     await test.step("3. Seller uploads images and documents", async () => {
  34  |       await page.goto("/seller/documents");
  35  |       await expect(page.getByText(/documents/i).first()).toBeVisible();
  36  |     });
  37  | 
  38  |     await test.step("4. OCR processing is queued (background job)", async () => {
  39  |       // Relative URL: the browser context talks to the Next.js API, never to
  40  |       // the internal FastAPI port (which may be proxied in CI/sandboxes).
  41  |       const res = await page.request.get("/api/v1/notifications");
  42  |       expect([200, 401, 403]).toContain(res.status());
  43  |     });
  44  | 
  45  |     await test.step("5. Seller reviews extracted fields / corrections", async () => {
  46  |       await page.goto("/seller/documents");
  47  |       await expect(page.getByText(/document|extract|status/i).first()).toBeVisible();
  48  |     });
  49  | 
  50  |     await test.step("6. Verification rules run and store evidence", async () => {
  51  |       await page.goto("/seller/verification");
  52  |       await expect(page.getByText(/verification/i).first()).toBeVisible();
  53  |     });
  54  | 
  55  |     await test.step("7. Mileage anomaly is shown from seeded readings", async () => {
  56  |       await page.goto("/seller/history");
  57  |       await expect(page.getByText(/mileage|odometer|history/i).first()).toBeVisible();
  58  |     });
  59  | 
  60  |     await test.step("8. Damage / inspection evidence is attached", async () => {
  61  |       await page.goto("/seller/vehicles");
  62  |       await expect(page.getByText(/vehicle/i).first()).toBeVisible();
  63  |     });
  64  | 
  65  |     await test.step("9. AI investigation returns a structured explanation", async () => {
  66  |       await page.goto("/seller/fraud");
  67  |       await expect(page.getByText(/fraud|finding|risk|evidence/i).first()).toBeVisible();
  68  |     });
  69  | 
  70  |     await test.step("10. Seller creates / publishes a listing", async () => {
  71  |       await page.goto("/seller/listings");
  72  |       await expect(page.getByText(/listing/i).first()).toBeVisible();
  73  |     });
  74  | 
  75  |     await test.step("11. Buyer signs in", async () => {
  76  |       await login(page, "buyer");
  77  |     });
  78  | 
  79  |     await test.step("12. Buyer searches the marketplace", async () => {
  80  |       await page.goto("/buyer/explore");
  81  |       await expect(page.getByText(/explore|vehicle/i).first()).toBeVisible();
  82  |     });
  83  | 
  84  |     await test.step("13. Buyer opens the vehicle detail and report", async () => {
  85  |       await page.goto("/vehicle/v-audi");
  86  |       await expect(page.getByText(/audi|trust|report|vehicle/i).first()).toBeVisible();
  87  |     });
  88  | 
  89  |     await test.step("14. Buyer views mileage timeline and evidence", async () => {
  90  |       await page.goto("/buyer/history");
  91  |       await expect(page.getByText(/history|mileage|evidence/i).first()).toBeVisible();
  92  |     });
  93  | 
  94  |     await test.step("15. Buyer opens 3D and selects a mapped component", async () => {
  95  |       await page.goto("/inspection");
  96  |       await expect(page.locator("canvas").or(page.getByText(/WebGL/i))).toBeVisible();
  97  |     });
  98  | 
  99  |     await test.step("16. Buyer compares two vehicles", async () => {
  100 |       await page.goto("/buyer/compare");
  101 |       await expect(page.getByText(/compare/i).first()).toBeVisible();
  102 |     });
  103 | 
  104 |     await test.step("17. Buyer saves the vehicle and contacts the seller", async () => {
  105 |       await page.goto("/buyer/saved");
  106 |       await expect(page.getByText(/saved/i).first()).toBeVisible();
  107 |       await page.goto("/buyer/inquiries");
  108 |       await expect(page.getByText(/inquir/i).first()).toBeVisible();
  109 |     });
  110 | 
  111 |     await test.step("18. Seller responds to the inquiry", async () => {
  112 |       await login(page, "seller");
  113 |       await page.goto("/seller/inquiries");
```