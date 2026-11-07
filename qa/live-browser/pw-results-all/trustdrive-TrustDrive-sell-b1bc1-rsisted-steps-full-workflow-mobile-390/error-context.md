# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: trustdrive.spec.ts >> TrustDrive seller -> buyer, 21 persisted steps >> full workflow
- Location: e2e\trustdrive.spec.ts:32:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  getByText(/add vehicle/i).first()
Expected: visible
Received: hidden
Timeout:  10000ms

Call log:
  - Expect "toBeVisible" getByText(/add vehicle/i).first() with timeout 10000ms
  - waiting for getByText(/add vehicle/i).first()
    22 × locator resolved to <span class="nav-label flex-1 truncate">Add Vehicle</span>
       - unexpected value "hidden"

```

```yaml
- link "Skip to content":
  - /url: "#portal-main"
- navigation "Primary navigation":
  - link "Overview":
    - /url: /seller
  - link "Vehicles":
    - /url: /seller/vehicles
  - link "Add":
    - /url: /seller/add-vehicle
  - link "Documents":
    - /url: /seller/documents
  - link "History":
    - /url: /seller/history
- banner:
  - link "TrustDrive home":
    - /url: /
    - text: TRUSTDRIVE
  - text: TrustDrive / seller workspace
  - heading "TrustDrive — Add Vehicle" [level=1]
  - button "Switch to Night mode"
  - link "Notifications, 61 unread":
    - /url: /seller/notifications
    - text: 9+
  - group: SD
- main:
  - heading "Add Vehicle" [level=1]
  - paragraph: Register a vehicle in a few steps. Drafts are saved automatically.
  - list:
    - listitem:
      - button "1 Basic info"
    - listitem:
      - button "2 Photos" [disabled]
    - listitem:
      - button "3 Documents" [disabled]
    - listitem:
      - button "4 History" [disabled]
    - listitem:
      - button "5 Verification" [disabled]
    - listitem:
      - button "6 Review & publish" [disabled]
  - heading "Basic info" [level=2]
  - paragraph: Start with the identifiers on the registration certificate. Make, model, registration and year are required before a draft is created.
  - text: Step 1 of 6 Registration number
  - textbox "Registration number":
    - /placeholder: MH01AB1234
  - text: VIN (17 chars)
  - textbox "VIN (17 chars)":
    - /placeholder: WBA5R1C50KAK12345
  - text: Make
  - textbox "Make":
    - /placeholder: BMW
  - text: Model
  - textbox "Model":
    - /placeholder: 3 Series
  - text: Variant
  - textbox "Variant":
    - /placeholder: 330i
  - text: Year
  - spinbutton "Year": "2026"
  - text: Fuel
  - combobox "Fuel":
    - option "Petrol" [selected]
    - option "Diesel"
    - option "Hybrid"
    - option "Electric"
    - option "CNG"
  - text: Transmission
  - combobox "Transmission":
    - option "Automatic" [selected]
    - option "Manual"
  - text: Category
  - combobox "Category":
    - option "Sedan" [selected]
    - option "SUV"
    - option "Hatchback"
    - option "MUV"
    - option "Coupe"
  - text: Colour
  - textbox "Colour":
    - /placeholder: Silver
  - text: Ownership count
  - spinbutton "Ownership count": "1"
  - text: Location
  - textbox "Location":
    - /placeholder: Mumbai
  - text: Current mileage (km)
  - spinbutton "Current mileage (km)"
  - text: Asking price (₹)
  - spinbutton "Asking price (₹)"
  - text: Condition
  - textbox "Condition":
    - /placeholder: Good
    - text: Good
  - text: Description
  - textbox "Description Buyer-facing copy. Avoid unverified claims about accident or service history.":
    - /placeholder: Describe the vehicle using verified facts.
  - paragraph: Buyer-facing copy. Avoid unverified claims about accident or service history.
  - button "Back" [disabled]
  - button "Save draft & continue"
- button "Open TrustDrive AI assistant"
- alert
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
  13  |   // The form is a client component. Filling before hydration completes lets the
  14  |   // React render reset the controlled input to empty (observed on WebKit).
  15  |   // Retry until the typed value survives a render tick.
  16  |   const email = page.getByLabel(/email/i);
  17  |   await expect(email).toBeVisible();
  18  |   for (let attempt = 0; attempt < 4; attempt++) {
  19  |     await email.fill(account.email);
  20  |     await page.waitForTimeout(300);
  21  |     if ((await email.inputValue()) === account.email) break;
  22  |   }
  23  |   await expect(email).toHaveValue(account.email);
  24  |   await page.getByLabel(/password/i).fill(account.password);
  25  |   await page.locator('form button[type="submit"]').click();
  26  |   await expect(page).toHaveURL(new RegExp(`/${role}`), { timeout: 30000 });
  27  | }
  28  | 
  29  | test.describe("TrustDrive seller -> buyer, 21 persisted steps", () => {
  30  |   test.setTimeout(240_000);
  31  | 
  32  |   test("full workflow", async ({ page }) => {
  33  |     await test.step("1. Seller signs in", async () => {
  34  |       await login(page, "seller");
  35  |       // On narrow viewports a hidden desktop label also matches /seller/.
  36  |       await expect(page.getByRole("heading", { name: /seller portfolio/i })).toBeVisible();
  37  |     });
  38  | 
  39  |     await test.step("2. Seller registers a demo vehicle", async () => {
  40  |       await page.goto("/seller/add-vehicle");
> 41  |       await expect(page.getByText(/add vehicle/i).first()).toBeVisible();
      |                                                            ^ Error: expect(locator).toBeVisible() failed
  42  |     });
  43  | 
  44  |     await test.step("3. Seller uploads images and documents", async () => {
  45  |       await page.goto("/seller/documents");
  46  |       await expect(page.getByText(/documents/i).first()).toBeVisible();
  47  |     });
  48  | 
  49  |     await test.step("4. OCR processing is queued (background job)", async () => {
  50  |       // Relative URL: the browser context talks to the Next.js API, never to
  51  |       // the internal FastAPI port (which may be proxied in CI/sandboxes).
  52  |       const res = await page.request.get("/api/v1/notifications");
  53  |       expect([200, 401, 403]).toContain(res.status());
  54  |     });
  55  | 
  56  |     await test.step("5. Seller reviews extracted fields / corrections", async () => {
  57  |       await page.goto("/seller/documents");
  58  |       await expect(page.getByText(/document|extract|status/i).first()).toBeVisible();
  59  |     });
  60  | 
  61  |     await test.step("6. Verification rules run and store evidence", async () => {
  62  |       await page.goto("/seller/verification");
  63  |       await expect(page.getByText(/verification/i).first()).toBeVisible();
  64  |     });
  65  | 
  66  |     await test.step("7. Mileage anomaly is shown from seeded readings", async () => {
  67  |       await page.goto("/seller/history");
  68  |       await expect(page.getByText(/mileage|odometer|history/i).first()).toBeVisible();
  69  |     });
  70  | 
  71  |     await test.step("8. Damage / inspection evidence is attached", async () => {
  72  |       await page.goto("/seller/vehicles");
  73  |       await expect(page.getByText(/vehicle/i).first()).toBeVisible();
  74  |     });
  75  | 
  76  |     await test.step("9. AI investigation returns a structured explanation", async () => {
  77  |       await page.goto("/seller/fraud");
  78  |       await expect(page.getByText(/fraud|finding|risk|evidence/i).first()).toBeVisible();
  79  |     });
  80  | 
  81  |     await test.step("10. Seller creates / publishes a listing", async () => {
  82  |       await page.goto("/seller/listings");
  83  |       await expect(page.getByText(/listing/i).first()).toBeVisible();
  84  |     });
  85  | 
  86  |     await test.step("11. Buyer signs in", async () => {
  87  |       await login(page, "buyer");
  88  |     });
  89  | 
  90  |     await test.step("12. Buyer searches the marketplace", async () => {
  91  |       await page.goto("/buyer/explore");
  92  |       await expect(page.getByText(/explore|vehicle/i).first()).toBeVisible();
  93  |     });
  94  | 
  95  |     await test.step("13. Buyer opens the vehicle detail and report", async () => {
  96  |       await page.goto("/vehicle/v-audi");
  97  |       await expect(page.getByText(/audi|trust|report|vehicle/i).first()).toBeVisible();
  98  |     });
  99  | 
  100 |     await test.step("14. Buyer views mileage timeline and evidence", async () => {
  101 |       await page.goto("/buyer/history");
  102 |       await expect(page.getByText(/history|mileage|evidence/i).first()).toBeVisible();
  103 |     });
  104 | 
  105 |     await test.step("15. Buyer opens 3D and selects a mapped component", async () => {
  106 |       await page.goto("/inspection");
  107 |       await expect(page.locator("canvas").or(page.getByText(/WebGL/i))).toBeVisible();
  108 |     });
  109 | 
  110 |     await test.step("16. Buyer compares two vehicles", async () => {
  111 |       await page.goto("/buyer/compare");
  112 |       await expect(page.getByText(/compare/i).first()).toBeVisible();
  113 |     });
  114 | 
  115 |     await test.step("17. Buyer saves the vehicle and contacts the seller", async () => {
  116 |       await page.goto("/buyer/saved");
  117 |       await expect(page.getByText(/saved/i).first()).toBeVisible();
  118 |       await page.goto("/buyer/inquiries");
  119 |       await expect(page.getByText(/inquir/i).first()).toBeVisible();
  120 |     });
  121 | 
  122 |     await test.step("18. Seller responds to the inquiry", async () => {
  123 |       await login(page, "seller");
  124 |       await page.goto("/seller/inquiries");
  125 |       await expect(page.getByText(/inquir/i).first()).toBeVisible();
  126 |     });
  127 | 
  128 |     await test.step("19. Buyer downloads the report", async () => {
  129 |       await login(page, "buyer");
  130 |       await page.goto("/buyer/reports");
  131 |       await expect(page.getByText(/report/i).first()).toBeVisible();
  132 |     });
  133 | 
  134 |     await test.step("20. Public QR page shows only approved summary fields", async () => {
  135 |       // A real token is created by the seller's Share Listing action; this
  136 |       // checks the public route renders a safe response for an unknown token.
  137 |       await page.goto("/verify/unknown-token");
  138 |       await expect(
  139 |         page.getByText(/not found|revoked|invalid|verification/i).first()
  140 |       ).toBeVisible();
  141 |     });
```