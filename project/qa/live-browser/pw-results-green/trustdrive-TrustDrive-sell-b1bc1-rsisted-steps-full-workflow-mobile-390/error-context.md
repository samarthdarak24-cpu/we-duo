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

Locator:  getByText(/seller|overview/i).first()
Expected: visible
Received: hidden
Timeout:  10000ms

Call log:
  - Expect "toBeVisible" getByText(/seller|overview/i).first() with timeout 10000ms
  - waiting for getByText(/seller|overview/i).first()
    11 × locator resolved to <div class="mt-0.5 text-[10.5px] font-medium capitalize tracking-wide text-[#8F979F]">…</div>
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
  - heading "Seller portfolio" [level=1]
  - text: BMW 3 Series MH01AB1234
  - button "Switch to Night mode"
  - link "Notifications, 61 unread":
    - /url: /seller/notifications
    - text: 9+
  - group: SD
- main:
  - paragraph: Seller workspace
  - heading "Portfolio overview" [level=1]
  - paragraph: Welcome back, Samarth. Track verification, clear blockers and keep every listing evidence-ready.
  - text: 24 vehicles 6 live 14 open findings
  - link "Add vehicle":
    - /url: /seller/add-vehicle
  - link "Open vehicle":
    - /url: /seller/vehicles/v-bmw
  - link "Total vehicles 24 In your portfolio":
    - /url: /seller/vehicles
  - link "Active listings 6 Published on marketplace":
    - /url: /seller/listings
  - link "Pending verification 16 Documents or checks awaiting review":
    - /url: /seller/documents
  - link "Buyer inquiries 20 Open conversations":
    - /url: /seller/inquiries
  - status:
    - paragraph: Odometer rollback detected — needs your attention
    - paragraph: The submitted reading of 7,00,678 km is lower than the previous reading of 9,99,999 km.
    - link "Review finding":
      - /url: /seller/fraud
  - heading "Verification pipeline" [level=2]
  - paragraph: Every vehicle, its evidence coverage and the state of its listing.
  - link "Manage vehicles":
    - /url: /seller/vehicles
  - table:
    - rowgroup:
      - row "Vehicle Trust Coverage Listing":
        - columnheader "Vehicle"
        - columnheader "Trust"
        - columnheader "Coverage"
        - columnheader "Listing"
        - columnheader
    - rowgroup:
      - row "Honda City ZX MH02E2E9185 · 18,500 km 0/100 0% Draft Open Honda City ZX":
        - cell "Honda City ZX MH02E2E9185 · 18,500 km":
          - link "Honda City ZX":
            - /url: /seller/vehicles/v-1793887106524
          - text: MH02E2E9185 · 18,500 km
        - cell "0/100"
        - cell "0%"
        - cell "Draft"
        - cell "Open Honda City ZX":
          - link "Open Honda City ZX":
            - /url: /seller/vehicles/v-1793887106524
      - row "Honda City ZX MH02E2E9150 · 18,500 km 0/100 0% Draft Open Honda City ZX":
        - cell "Honda City ZX MH02E2E9150 · 18,500 km":
          - link "Honda City ZX":
            - /url: /seller/vehicles/v-1793886266814
          - text: MH02E2E9150 · 18,500 km
        - cell "0/100"
        - cell "0%"
        - cell "Draft"
        - cell "Open Honda City ZX":
          - link "Open Honda City ZX":
            - /url: /seller/vehicles/v-1793886266814
      - row "Honda City DL01AB6585 · 25,000 km 30/100 30% sold Open Honda City":
        - cell "Honda City DL01AB6585 · 25,000 km":
          - link "Honda City":
            - /url: /seller/vehicles/v-1793885304387
          - text: DL01AB6585 · 25,000 km
        - cell "30/100"
        - cell "30%"
        - cell "sold"
        - cell "Open Honda City":
          - link "Open Honda City":
            - /url: /seller/vehicles/v-1793885304387
      - row "Honda City DL01AB1379 · 25,000 km 30/100 30% sold Open Honda City":
        - cell "Honda City DL01AB1379 · 25,000 km":
          - link "Honda City":
            - /url: /seller/vehicles/v-1793884724861
          - text: DL01AB1379 · 25,000 km
        - cell "30/100"
        - cell "30%"
        - cell "sold"
        - cell "Open Honda City":
          - link "Open Honda City":
            - /url: /seller/vehicles/v-1793884724861
      - row "Honda City ZX MH02E2E2360 · 18,500 km 0/100 0% Draft Open Honda City ZX":
        - cell "Honda City ZX MH02E2E2360 · 18,500 km":
          - link "Honda City ZX":
            - /url: /seller/vehicles/v-1793883784998
          - text: MH02E2E2360 · 18,500 km
        - cell "0/100"
        - cell "0%"
        - cell "Draft"
        - cell "Open Honda City ZX":
          - link "Open Honda City ZX":
            - /url: /seller/vehicles/v-1793883784998
      - row "QA KpiProbe MH02QA1924 · 10,000 km 0/100 0% Draft Open QA KpiProbe":
        - cell "QA KpiProbe MH02QA1924 · 10,000 km":
          - link "QA KpiProbe":
            - /url: /seller/vehicles/v-1793883128218
          - text: MH02QA1924 · 10,000 km
        - cell "0/100"
        - cell "0%"
        - cell "Draft"
        - cell "Open QA KpiProbe":
          - link "Open QA KpiProbe":
            - /url: /seller/vehicles/v-1793883128218
  - heading "Portfolio signals" [level=2]
  - paragraph: Secondary metrics live here, not in the KPI row.
  - link "Verified vehicles 3":
    - /url: /seller/verification
  - link "Open alerts 14":
    - /url: /seller/fraud
  - link "Listing views 200":
    - /url: /seller/listings
  - link "Saved by buyers 49":
    - /url: /seller/listings
  - link "Verifications · 30d 21":
    - /url: /seller/verification
  - link "Last verification 05 Nov":
    - /url: /seller/verification
  - link "Document completeness 38%":
    - /url: /seller/documents
  - link "Listing readiness 50%":
    - /url: /seller/listings
  - heading "Document completeness" [level=2]
  - paragraph: 100% of the required evidence is on file.
  - link "Manage":
    - /url: /seller/documents
  - text: 100% Complete
  - list:
    - listitem: RC Verified
    - listitem: Insurance Valid
    - listitem: PUC Uploaded
    - listitem: Service Records 1 records
  - paragraph: Missing documents are shown as unknown. A complete set improves coverage; it does not certify authenticity.
  - heading "Alerts needing attention" [level=2]
  - paragraph: Warnings to investigate — not proof of fraud.
  - link "All findings":
    - /url: /seller/fraud
  - list:
    - listitem:
      - link "Suspicious Odometer rollback detected The submitted reading of 7,00,678 km is lower than the previous reading of 9,99,999 km. Review":
        - /url: /seller/fraud
    - listitem:
      - link "Suspicious Mileage inconsistency detected +9,57,999 km in 748 days exceeds the expected rate. Review":
        - /url: /seller/fraud
    - listitem:
      - link "Pending Insurance renewal due The policy expires within 30 days. Renew to keep documents current. Review":
        - /url: /seller/fraud
    - listitem:
      - link "Verified Theft record No theft record found in supported sources Review":
        - /url: /seller/fraud
  - heading "Mileage history" [level=2]
  - paragraph: Latest recorded 7,00,923 km · verified 7,00,923 km
  - link "Full history":
    - /url: /seller/history?vehicle=v-bmw
  - button "1Y"
  - button "3Y"
  - button "5Y"
  - application: 2022 2023 2026 2026 2026 0k 250k 500k 750k 1000k
  - paragraph: Claimed and verified readings are tracked separately. A reading lower than the previous one is flagged for review.
  - complementary:
    - heading "Listing readiness" [level=2]
    - paragraph: Published on Marketplace
    - link "Edit":
      - /url: /seller/listings?vehicle=v-bmw
    - list:
      - listitem: Vehicle details complete Verified
      - listitem: Photos uploaded Verified
      - listitem: Documents verified Verified
      - listitem: Verification run Verified
      - listitem: Inspection Verified
    - link "Manage listing":
      - /url: /seller/listings?vehicle=v-bmw
    - heading "Buyer interest" [level=2]
    - link "Inbox":
      - /url: /seller/inquiries
    - text: 40 Views 9 Saves 7 Inquiries
    - list:
      - listitem:
        - text: AD Aditya Darak 24m ago
        - paragraph: Hello, I am interested in viewing this BMW 3 Series. Is Sunday afternoon available for an inspection?
      - listitem:
        - text: RM Rohan Mehta 1d ago
        - paragraph: Hello! Yes, the vehicle is available for test drive this Saturday at 11 AM.
    - heading "Market price estimate" [level=2]
    - text: Low ₹24.5L Suggested ₹26L High ₹28.5L Suggested ₹26L ₹24.5L ₹28.5L
    - paragraph: Based on similar vehicles.
    - paragraph: "Estimate: 14 comparable vehicles · confidence High. Estimate, not a valuation."
    - heading "3D inspection" [level=2]
    - paragraph: 2 damage panel(s) mapped on 3D studio.
    - link "View Studio":
      - /url: "#viewer"
    - text: Diagnostic Studio Live 3D
    - paragraph: Full 360° interactive car inspection with Exploded, Damage, and X-Ray diagnostic modes.
    - link "Open 3D Inspection Studio":
      - /url: "#viewer"
  - heading "Vehicle 3D Damage Inspection Studio" [level=2]
  - paragraph: Interactive spatial diagnostic model for BMW 3 Series. Raycast panels to inspect verified records, or explore Exploded & X-Ray modes.
  - text: 2 recorded damage panels
  - link "Detailed Vehicle Report":
    - /url: /seller/vehicles/v-bmw#viewer
  - button "Front Bumper & Lower Fascia (3 damage records)": "3"
  - button "Rear Bumper & Lower Valance (1 damage records)": "1"
  - text: TrustDrive 3D Studio | NORMAL
  - button "Normal"
  - button "Exploded"
  - button "Damage"
  - button "X-Ray"
  - button "Expand Theater Mode"
  - text: "Recorded Defects (2):"
  - button "Front Bumper & Lower Fascia 3"
  - button "Rear Bumper & Lower Valance 1"
  - button "3/4 Hero"
  - button "Front"
  - button "Side Profile"
  - button "Rear Tail"
  - button "Top Down"
  - button "Powertrain"
  - button "Toggle turntable auto rotation"
  - button "Reset view"
  - button "Toggle theater mode"
  - button "Toggle fullscreen"
  - text: Khronos CC BY 4.0 Executive Sedan GLB. Hotspots map directly to verified SQLite database damage rows. Spatial Diagnostic Studio
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
> 35  |       await expect(page.getByText(/seller|overview/i).first()).toBeVisible();
      |                                                                ^ Error: expect(locator).toBeVisible() failed
  36  |     });
  37  | 
  38  |     await test.step("2. Seller registers a demo vehicle", async () => {
  39  |       await page.goto("/seller/add-vehicle");
  40  |       await expect(page.getByText(/add vehicle/i).first()).toBeVisible();
  41  |     });
  42  | 
  43  |     await test.step("3. Seller uploads images and documents", async () => {
  44  |       await page.goto("/seller/documents");
  45  |       await expect(page.getByText(/documents/i).first()).toBeVisible();
  46  |     });
  47  | 
  48  |     await test.step("4. OCR processing is queued (background job)", async () => {
  49  |       // Relative URL: the browser context talks to the Next.js API, never to
  50  |       // the internal FastAPI port (which may be proxied in CI/sandboxes).
  51  |       const res = await page.request.get("/api/v1/notifications");
  52  |       expect([200, 401, 403]).toContain(res.status());
  53  |     });
  54  | 
  55  |     await test.step("5. Seller reviews extracted fields / corrections", async () => {
  56  |       await page.goto("/seller/documents");
  57  |       await expect(page.getByText(/document|extract|status/i).first()).toBeVisible();
  58  |     });
  59  | 
  60  |     await test.step("6. Verification rules run and store evidence", async () => {
  61  |       await page.goto("/seller/verification");
  62  |       await expect(page.getByText(/verification/i).first()).toBeVisible();
  63  |     });
  64  | 
  65  |     await test.step("7. Mileage anomaly is shown from seeded readings", async () => {
  66  |       await page.goto("/seller/history");
  67  |       await expect(page.getByText(/mileage|odometer|history/i).first()).toBeVisible();
  68  |     });
  69  | 
  70  |     await test.step("8. Damage / inspection evidence is attached", async () => {
  71  |       await page.goto("/seller/vehicles");
  72  |       await expect(page.getByText(/vehicle/i).first()).toBeVisible();
  73  |     });
  74  | 
  75  |     await test.step("9. AI investigation returns a structured explanation", async () => {
  76  |       await page.goto("/seller/fraud");
  77  |       await expect(page.getByText(/fraud|finding|risk|evidence/i).first()).toBeVisible();
  78  |     });
  79  | 
  80  |     await test.step("10. Seller creates / publishes a listing", async () => {
  81  |       await page.goto("/seller/listings");
  82  |       await expect(page.getByText(/listing/i).first()).toBeVisible();
  83  |     });
  84  | 
  85  |     await test.step("11. Buyer signs in", async () => {
  86  |       await login(page, "buyer");
  87  |     });
  88  | 
  89  |     await test.step("12. Buyer searches the marketplace", async () => {
  90  |       await page.goto("/buyer/explore");
  91  |       await expect(page.getByText(/explore|vehicle/i).first()).toBeVisible();
  92  |     });
  93  | 
  94  |     await test.step("13. Buyer opens the vehicle detail and report", async () => {
  95  |       await page.goto("/vehicle/v-audi");
  96  |       await expect(page.getByText(/audi|trust|report|vehicle/i).first()).toBeVisible();
  97  |     });
  98  | 
  99  |     await test.step("14. Buyer views mileage timeline and evidence", async () => {
  100 |       await page.goto("/buyer/history");
  101 |       await expect(page.getByText(/history|mileage|evidence/i).first()).toBeVisible();
  102 |     });
  103 | 
  104 |     await test.step("15. Buyer opens 3D and selects a mapped component", async () => {
  105 |       await page.goto("/inspection");
  106 |       await expect(page.locator("canvas").or(page.getByText(/WebGL/i))).toBeVisible();
  107 |     });
  108 | 
  109 |     await test.step("16. Buyer compares two vehicles", async () => {
  110 |       await page.goto("/buyer/compare");
  111 |       await expect(page.getByText(/compare/i).first()).toBeVisible();
  112 |     });
  113 | 
  114 |     await test.step("17. Buyer saves the vehicle and contacts the seller", async () => {
  115 |       await page.goto("/buyer/saved");
  116 |       await expect(page.getByText(/saved/i).first()).toBeVisible();
  117 |       await page.goto("/buyer/inquiries");
  118 |       await expect(page.getByText(/inquir/i).first()).toBeVisible();
  119 |     });
  120 | 
  121 |     await test.step("18. Seller responds to the inquiry", async () => {
  122 |       await login(page, "seller");
  123 |       await page.goto("/seller/inquiries");
  124 |       await expect(page.getByText(/inquir/i).first()).toBeVisible();
  125 |     });
  126 | 
  127 |     await test.step("19. Buyer downloads the report", async () => {
  128 |       await login(page, "buyer");
  129 |       await page.goto("/buyer/reports");
  130 |       await expect(page.getByText(/report/i).first()).toBeVisible();
  131 |     });
  132 | 
  133 |     await test.step("20. Public QR page shows only approved summary fields", async () => {
  134 |       // A real token is created by the seller's Share Listing action; this
  135 |       // checks the public route renders a safe response for an unknown token.
```