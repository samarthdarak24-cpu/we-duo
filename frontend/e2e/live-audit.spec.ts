import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/**
 * TrustDrive — LIVE functional audit.
 *
 * These tests drive the real UI against the real backend and the real shared
 * SQLite database. Nothing is mocked: accounts are registered through the real
 * registration form, vehicles are created through the real 6-step Add Vehicle
 * stepper, documents are uploaded as real PDF files and read by the real
 * intelligence service, and every claim is re-read back from the API/DB.
 *
 * Run against an already-running app:
 *   E2E_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/live-audit.spec.ts
 */

const SHOTS = path.resolve(__dirname, "../../SCREENSHOTS/live");
const FIXTURES = path.resolve(__dirname, "../qa/fixtures");
const STATE_FILE = path.resolve(__dirname, "../qa/live-state.json");

const RUN = Date.now().toString().slice(-8); // 8 digits
const PASSWORD = "QaLive2026pass";

/** Indian registration: 2 letters, 1-2 digits, 0-3 letters, 1-4 digits. */
const reg = (n: number) => `MH12QA${RUN.slice(-3)}${n}`;
const VIN_CAR = `MA3FJE61S1${RUN.slice(0, 7)}`; // 17 chars
const VIN_EV_CAR = `MAT625289NP${RUN.slice(0, 6)}`; // 17 chars
const VIN_CAR_2 = `MA3FJE61S2${RUN.slice(0, 7)}`; // 17 chars
const chassis = (prefix: string, n: number) => `${prefix}${RUN.slice(0, 6)}${n}`; // 8-22 chars

interface LiveState {
  sellerEmail: string;
  buyerEmail: string;
  seller2Email: string;
  vehicleId: string;
  regNo: string;
  categories: Record<string, string>;
}
const state: LiveState = {
  sellerEmail: "",
  buyerEmail: "",
  seller2Email: "",
  vehicleId: "",
  regNo: "",
  categories: {},
};
function saveState() {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
}

/** Authenticated JSON call through the browser context (shares the httpOnly cookie). */
async function api(
  ctx: BrowserContext,
  url: string,
  init: { method?: string; data?: unknown } = {}
) {
  const res = await ctx.request.fetch(url, {
    method: init.method ?? "GET",
    headers: init.data ? { "Content-Type": "application/json" } : undefined,
    data: init.data ? JSON.stringify(init.data) : undefined,
  });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status(), body };
}

/** Does the JSON payload mention this id anywhere? */
function mentions(payload: unknown, id: string) {
  return JSON.stringify(payload ?? null).includes(id);
}

/**
 * Fill a controlled input and prove the value stuck.
 * React can re-render a controlled field right after a write (hydration or a
 * role/category switch), which silently wipes what was typed.
 */
async function fillStable(page: Page, locator: import("@playwright/test").Locator, value: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await locator.fill(value);
    await page.waitForTimeout(120);
    if ((await locator.inputValue()) === value) return;
  }
  await expect(locator).toHaveValue(value);
}

/** Register a brand-new account through the REAL registration form. */
async function registerViaUi(
  page: Page,
  opts: { name: string; email: string; role: "buyer" | "seller" }
) {
  await page.goto("/register", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /Create Your TrustDrive Account/i })).toBeVisible({
    timeout: 30_000,
  });

  // Choose the role FIRST: the role buttons sit outside the form fields and
  // switching role re-renders the form.
  // The role selector is "Seller / Certify & Sell" (not the demo-login button "• Seller").
  await page
    .getByRole("button", { name: opts.role === "seller" ? "Seller Certify & Sell" : "Buyer Search & Verify" })
    .click();

  await fillStable(page, page.getByPlaceholder("eg. John Doe"), opts.name);
  await fillStable(page, page.getByPlaceholder("eg. john@example.com"), opts.email);
  await fillStable(page, page.getByPlaceholder("Create a strong password"), PASSWORD);
  await fillStable(page, page.getByPlaceholder("Repeat your password"), PASSWORD);
  await page.getByRole("checkbox").first().check();
  await shot(page, `register-${opts.role}-form`);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(new RegExp(`/${opts.role}`), { timeout: 60_000 });
}

async function loginViaUi(page: Page, email: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#login-email")).toBeVisible({ timeout: 30_000 });
  await fillStable(page, page.locator("#login-email"), email);
  await fillStable(page, page.locator("#login-password"), PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/(seller|buyer|admin)/, { timeout: 60_000 });
}

// ---------------------------------------------------------------------------
// vehicle catalogue + generated documents
// ---------------------------------------------------------------------------
interface VehicleSpec {
  categoryId: string;
  regNo: string;
  identifier: string;
  identifierLabel: string;
  make: string;
  model: string;
  year: string;
  price: string;
  km: string;
  location?: string;
  doc: "rc" | "rc_2w";
}

const CATALOGUE: VehicleSpec[] = [
  {
    categoryId: "passenger_car",
    regNo: reg(1),
    identifier: VIN_CAR,
    identifierLabel: "VIN (17 characters)",
    make: "Maruti",
    model: "Baleno",
    year: "2021",
    price: "650000",
    km: "24500",
    location: "Pune, Maharashtra",
    doc: "rc",
  },
  {
    categoryId: "petrol_motorcycle",
    regNo: reg(2),
    identifier: chassis("ME4JC259E8T", 2),
    identifierLabel: "Chassis / frame number",
    make: "Honda",
    model: "CB350",
    year: "2021",
    price: "210000",
    km: "12000",
    location: "Mumbai, Maharashtra",
    doc: "rc_2w",
  },
  {
    categoryId: "petrol_scooter",
    regNo: reg(3),
    identifier: chassis("ME4JF401H9T", 3),
    identifierLabel: "Chassis / frame number",
    make: "Honda",
    model: "Activa 6G",
    year: "2021",
    price: "95000",
    km: "8500",
    location: "Mumbai, Maharashtra",
    doc: "rc_2w",
  },
  {
    categoryId: "electric_scooter",
    regNo: reg(4),
    identifier: chassis("MD2DSB123K1A", 4),
    identifierLabel: "Chassis / frame number",
    make: "Ola Electric",
    model: "S1 Pro",
    year: "2022",
    price: "130000",
    km: "6400",
    location: "Mumbai, Maharashtra",
    doc: "rc_2w",
  },
  {
    categoryId: "electric_motorcycle",
    regNo: reg(5),
    identifier: chassis("MD2DSA001K2B", 5),
    identifierLabel: "Chassis / frame number",
    make: "Revolt",
    model: "RV400",
    year: "2021",
    price: "175000",
    km: "9800",
    location: "Mumbai, Maharashtra",
    doc: "rc_2w",
  },
  {
    categoryId: "passenger_car",
    regNo: reg(6),
    identifier: VIN_CAR_2,
    identifierLabel: "VIN (17 characters)",
    make: "Hyundai",
    model: "i20",
    year: "2020",
    price: "725000",
    km: "31000",
    location: "Mumbai, Maharashtra",
    doc: "rc",
  },
  {
    categoryId: "electric_car",
    regNo: reg(7),
    identifier: VIN_EV_CAR,
    identifierLabel: "VIN (17 characters)",
    make: "Tata",
    model: "Nexon EV",
    year: "2022",
    price: "1450000",
    km: "19500",
    location: "Mumbai, Maharashtra",
    doc: "rc",
  },
];

const DOCS_DIR = path.resolve(__dirname, "../qa/fixtures/generated");

/**
 * Resolve a WORKING Python interpreter for the PDF fixture generator.
 *
 * The old code hard-coded `backend/.venv/Scripts/python.exe`. A virtualenv is
 * a machine-local artifact: it can be missing, or — worse — present but
 * pointing at an interpreter that was deleted (a stale `pyvenv.cfg` /
 * `home` entry). That failure looks like a test failure even though the app
 * is fine.
 *
 * Order: an explicit `TD_PYTHON`, then the project venv (only if it actually
 * runs), then `python`/`python3` from PATH.
 */
function resolvePython(): string {
  const candidates: string[] = [];
  if (process.env.TD_PYTHON) candidates.push(process.env.TD_PYTHON);
  candidates.push(
    path.resolve(__dirname, "../../backend/.venv/Scripts/python.exe"),
    path.resolve(__dirname, "../../backend/.venv/bin/python"),
    "python",
    "python3"
  );
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["--version"], { stdio: "ignore" });
      return candidate;
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error(
    "No working Python interpreter found for the PDF fixture generator. " +
      "Install Python 3, or set TD_PYTHON to a working interpreter."
  );
}

/** Generate real PDFs whose contents agree with each vehicle record. */
function generateDocuments(catalogue: VehicleSpec[]) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  const specFile = path.join(DOCS_DIR, "spec.json");
  const specs: any[] = [];
  for (const v of catalogue) {
    for (const kind of ["rc", "insurance"]) {
      specs.push({
        name: `${kind}-${v.regNo}`,
        reg: v.regNo,
        identifier: v.identifier,
        identifier_label: v.identifierLabel,
        model: v.model,
        make: v.make,
        year: v.year,
        km: Number(v.km),
        kind,
      });
    }
  }
  fs.writeFileSync(specFile, JSON.stringify(specs, null, 2));
  execFileSync(
    resolvePython(),
    [path.resolve(__dirname, "../qa/fixtures/make_docs.py"), "--spec", specFile, "--out", DOCS_DIR],
    { stdio: "ignore" }
  );
  return {
    rc: (regNo: string) => path.join(DOCS_DIR, `rc-${regNo}.pdf`),
    insurance: (regNo: string) => path.join(DOCS_DIR, `insurance-${regNo}.pdf`),
  };
}

let DOCS: { rc: (r: string) => string; insurance: (r: string) => string };

// ---------------------------------------------------------------------------
async function fillIdentityStep(page: Page, v: VehicleSpec) {
  await page.getByLabel("Vehicle category").selectOption(v.categoryId);
  // The form rebuilds itself for the chosen category, so wait for the
  // category-aware primary-identifier field to exist before typing into it.
  await expect(
    page.getByLabel(/VIN \(17 characters\)|Chassis \/ frame number/)
  ).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);

  await fillStable(page, page.getByLabel("Registration number"), v.regNo);
  await fillStable(
    page,
    page.getByLabel(/VIN \(17 characters\)|Chassis \/ frame number/),
    v.identifier
  );
  await fillStable(page, page.getByLabel("Manufacturer"), v.make);
  await fillStable(page, page.getByLabel("Model"), v.model);
  await fillStable(page, page.getByLabel("Manufacturing year"), v.year);
  await fillStable(page, page.getByLabel("Asking price (INR)"), v.price);
  // "Odometer reading (km)" for combustion, "Total distance reading (km)" for EVs.
  await fillStable(page, page.getByLabel(/reading \(km\)/), v.km);
  if (v.location) await fillStable(page, page.getByLabel("Location"), v.location);
  await fillStable(
    page,
    page.getByLabel("Description"),
    `${v.make} ${v.model} added during the TrustDrive live audit. Seller-declared facts only.`
  );

  // read every value back so a silent form reset can never pass unnoticed
  await expect(page.getByLabel("Registration number")).toHaveValue(v.regNo);
  await expect(
    page.getByLabel(/VIN \(17 characters\)|Chassis \/ frame number/)
  ).toHaveValue(v.identifier);
  await expect(page.getByLabel("Manufacturer")).toHaveValue(v.make);
  await expect(page.getByLabel("Model")).toHaveValue(v.model);
  await expect(page.getByLabel("Manufacturing year")).toHaveValue(v.year);
  await expect(page.getByLabel("Asking price (INR)")).toHaveValue(v.price);
}

/** The real 6-step Add Vehicle flow. Returns the created vehicle id. */
async function createVehicleViaUi(
  page: Page,
  v: VehicleSpec,
  opts: {
    photos?: string[];
    docs?: { type: string; file: string }[];
  } = {}
): Promise<{ vehicleId: string }> {
  await page.goto("/seller/add-vehicle", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Add Vehicle", exact: true })).toBeVisible();

  await fillIdentityStep(page, v);
  await shot(page, `seller-add-vehicle-${v.categoryId}-identity`);
  await page.getByRole("button", { name: /Save draft & continue/i }).click();

  // step 1 — photos
  await expect(page.getByText("Vehicle photos")).toBeVisible({ timeout: 45_000 });
  if (opts.photos?.length) {
    await page.getByLabel("Vehicle photos").setInputFiles(opts.photos);
    await page.getByRole("button", { name: /Upload photos/i }).click();
    await expect(page.getByText(/photo\(s\) added/i).first()).toBeVisible({ timeout: 60_000 });
  }
  await page.getByRole("button", { name: /^Continue$/i }).click();

  // step 2 — documents
  await expect(page.getByText("Document type")).toBeVisible({ timeout: 45_000 });
  for (const d of opts.docs ?? []) {
    await page.getByLabel("Document type").selectOption(d.type);
    const file = path.isAbsolute(d.file) ? d.file : path.join(FIXTURES, d.file);
    await page.locator('input[type="file"]').last().setInputFiles(file);
    await page.getByRole("button", { name: /Upload document/i }).click();
    await expect(page.getByText(/Document uploaded/i).first()).toBeVisible({ timeout: 120_000 });
  }
  await page.getByRole("button", { name: /^Continue$/i }).click();

  // step 3 — history
  await expect(page.getByText(/history rows added yet/i)).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: /Add current reading as history/i }).click();
  await expect(page.getByText(/Seller-submitted record/i).first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: /^Continue$/i }).click();

  // step 4 — verification
  await expect(page.getByRole("button", { name: /Run verification/i })).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: /Run verification/i }).click();
  await expect(page.getByText(/Verification run .* complete/i).first()).toBeVisible({ timeout: 120_000 });
  await shot(page, `seller-add-vehicle-${v.categoryId}-verification`);
  await page.getByRole("button", { name: /^Continue$/i }).click();

  // step 5 — review & publish
  await expect(page.getByRole("button", { name: /Check publish readiness/i })).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: /Check publish readiness/i }).click();
  await page.waitForTimeout(2000);
  await shot(page, `seller-add-vehicle-${v.categoryId}-review`);

  const draftText = await page.getByText(/Draft ID:/).first().innerText();
  const vehicleId = draftText.match(/Draft ID:\s*(\S+)/)?.[1] ?? "";
  return { vehicleId };
}

// ===========================================================================
test.describe.serial("TrustDrive live functional audit", () => {
  test.setTimeout(900_000);

  test.beforeAll(() => {
    DOCS = generateDocuments(CATALOGUE);
  });

  test("S1. Seller registers through the real UI and the account persists", async ({ page, context }) => {
    const email = `qa.seller.${RUN}@trustdrive.dev`;
    await registerViaUi(page, { name: "QA Live Seller", email, role: "seller" });
    state.sellerEmail = email;
    saveState();

    await expect(page).toHaveURL(/\/seller/);
    await expect(page.locator("#portal-main")).toBeVisible({ timeout: 30_000 });
    await shot(page, "seller-dashboard-after-register");

    // real backend read-back through the authenticated session
    const me = await api(context, "/api/v1/users/me");
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(email);
    expect(me.body.data.user.role).toBe("seller");

    const overview = await api(context, "/api/v1/seller/overview");
    expect(overview.status).toBe(200);
    expect(overview.body.data).toBeTruthy();
  });

  test("S2. Seller creates a vehicle through the 6-step UI and it persists", async ({ page, context }) => {
    await loginViaUi(page, state.sellerEmail);

    const v = CATALOGUE[0];
    const { vehicleId } = await createVehicleViaUi(page, v, {
      photos: [
        path.join(FIXTURES, "photo-front.jpg"),
        path.join(FIXTURES, "photo-side.jpg"),
        path.join(FIXTURES, "photo-interior.jpg"),
      ],
      docs: [
        { type: v.doc, file: DOCS.rc(v.regNo) },
        { type: v.doc === "rc" ? "insurance" : "insurance_2w", file: DOCS.insurance(v.regNo) },
      ],
    });
    expect(vehicleId, "vehicle id must be returned by the UI flow").toBeTruthy();
    state.vehicleId = vehicleId;
    state.regNo = v.regNo;
    saveState();

    // persistence check through the real seller API
    const list = await api(context, `/api/v1/seller/vehicles?q=${encodeURIComponent("Baleno")}`);
    expect(list.status).toBe(200);
    const rows = list.body.data.items as any[];
    const found = rows.find((r) => r.id === vehicleId);
    expect(found, "created vehicle must be returned by GET /api/v1/seller/vehicles").toBeTruthy();
    expect(found.regNo).toBe(v.regNo);

    // survives a reload of the portal
    await page.goto("/seller/vehicles", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(v.regNo).first()).toBeVisible({ timeout: 45_000 });
    await shot(page, "seller-vehicles-list");
  });

  test("S3. Uploaded document is read by the real engine and the fields persist", async ({ page, context }) => {
    await loginViaUi(page, state.sellerEmail);
    const docs = await api(context, `/api/v1/vehicles/${state.vehicleId}/documents`);
    expect(docs.status).toBe(200);
    const items = docs.body.data.items as any[];
    expect(items.length, "documents must be stored").toBeGreaterThanOrEqual(2);

    const rc = items.find((d) => d.type === "rc");
    expect(rc, "RC document must exist").toBeTruthy();

    // a document that agrees with the vehicle record must reach `verified`
    expect(rc.status, `RC status was ${rc.status} (${rc.status_reason ?? ""})`).toBe("verified");

    // real extraction happened (extracted fields persisted)
    const ex = await api(context, `/api/v1/documents/${rc.id}/extractions`);
    expect(ex.status).toBe(200);
    const payload = ex.body.data ?? ex.body;
    const extracted = (payload.items ?? []) as any[];
    expect(
      extracted.length,
      `OCR extraction must persist fields, got ${JSON.stringify(ex.body).slice(0, 500)}`
    ).toBeGreaterThan(0);

    // every extracted field names the method that produced it — a PDF text
    // layer must never be reported as something it is not.
    for (const it of extracted) {
      expect(String(it.method ?? ""), `field ${it.field} must name its method`).toBeTruthy();
    }
    const methods = new Set(extracted.map((i) => String(i.method)));
    expect(methods.size).toBeGreaterThan(0);
    // the registration number must have been machine-read from the file
    expect(
      extracted.some(
        (i) => i.field === "registration_number" && String(i.value).replace(/\s/g, "") === state.regNo
      ),
      `the registration number must be extracted from the uploaded file`
    ).toBeTruthy();

    await page.goto("/seller/documents", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/document/i).first()).toBeVisible();
    await page.waitForTimeout(1500);
    await shot(page, "seller-documents-ocr");
  });

  test("S4. Seller publishes the listing and it becomes visible in the marketplace", async ({ page, context }) => {
    await loginViaUi(page, state.sellerEmail);

    await page.goto("/seller/listings", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/listing/i).first()).toBeVisible({ timeout: 45_000 });

    const listings = await api(context, "/api/v1/seller/listings?pageSize=100");
    expect(listings.status).toBe(200);
    const row = (listings.body.data.items as any[]).find((r) => r.vehicle.id === state.vehicleId);
    expect(row, "the vehicle must have a listing row").toBeTruthy();
    const listingId = row.listing?.id;
    expect(listingId, "a listing draft must exist for the vehicle").toBeTruthy();

    // select OUR vehicle in the listing manager (the row switcher is keyed by make+model)
    await page.locator('button[aria-pressed]').filter({ hasText: "Maruti Baleno" }).first().click();
    await expect(page.getByText(new RegExp(state.regNo)).first()).toBeVisible({ timeout: 30_000 });

    // create/update the listing draft through the real form
    await page.getByLabel("Headline").fill("Single-owner 2021 Maruti Baleno added by the TrustDrive live audit");
    await page.getByLabel("Price (₹)").fill("650000");
    await page.getByRole("button", { name: /Create draft|Save listing/i }).click();
    await expect(page.getByText(/listing draft created|listing updated/i).first()).toBeVisible({
      timeout: 45_000,
    });

    // publish through the real "Publish readiness" action
    await page.getByRole("button", { name: /^Publish$/ }).click();
    await page.waitForTimeout(4000);
    await shot(page, "seller-listing-published");

    const after = await api(context, "/api/v1/seller/listings?pageSize=100");
    const row2 = (after.body.data.items as any[]).find((r) => r.vehicle.id === state.vehicleId);
    expect(row2.listing.status, "the listing must be published").toBe("published");

    // now visible in the public marketplace result set
    const market = await api(context, `/api/v1/marketplace/listings?q=${encodeURIComponent(state.regNo)}`);
    expect(market.status).toBe(200);
    const mrow = (market.body.data.items as any[]).find((r) => r.regNo === state.regNo);
    expect(mrow, "published listing must appear in the marketplace").toBeTruthy();
    expect(mrow.categoryId).toBe("passenger_car");
  });

  test("S5. Buyer registers, explores, searches and opens the vehicle", async ({ page, context }) => {
    const email = `qa.buyer.${RUN}@trustdrive.dev`;
    await registerViaUi(page, { name: "QA Live Buyer", email, role: "buyer" });
    state.buyerEmail = email;
    saveState();
    await shot(page, "buyer-dashboard-after-register");

    await page.goto("/buyer/explore", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/explore/i).first()).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(2500);
    await shot(page, "buyer-explore");

    const market = await api(context, `/api/v1/marketplace/listings?q=${encodeURIComponent(state.regNo)}`);
    expect(market.status).toBe(200);
    const hits = market.body.data.items as any[];
    expect(hits.some((h) => h.regNo === state.regNo)).toBeTruthy();

    // open the real vehicle detail page
    await page.goto(`/vehicle/${state.vehicleId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/trust|report|baleno/i).first()).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(2500);
    await shot(page, "buyer-vehicle-detail");
  });

  test("S6. Buyer saves the vehicle, opens the passport and trust score", async ({ page, context }) => {
    await loginViaUi(page, state.buyerEmail);

    const save = await api(context, `/api/v1/vehicles/${state.vehicleId}/save`, { method: "POST" });
    expect([200, 201]).toContain(save.status);

    const saved = await api(context, "/api/v1/saved");
    expect(saved.status).toBe(200);
    expect(mentions(saved.body, state.vehicleId), "the saved vehicle must be persisted").toBeTruthy();

    await page.goto("/buyer/saved", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/saved/i).first()).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(1500);
    await shot(page, "buyer-saved");

    const passport = await api(context, `/api/v1/vehicles/${state.vehicleId}/passport`);
    expect(passport.status).toBe(200);
    expect(passport.body.data.vehicle).toBeTruthy();
    expect(passport.body.data.trust).toBeTruthy();
    // the passport states what it does and does not cover
    expect(passport.body.data.caveats ?? passport.body.data.visibility).toBeTruthy();

    const trust = await api(context, `/api/v1/vehicles/${state.vehicleId}/trust`);
    expect(trust.status).toBe(200);
    // the trust score must be explainable: a number, a band and a breakdown
    expect(typeof trust.body.data.trustScore).toBe("number");
    expect(typeof trust.body.data.band).toBe("string");
    expect(trust.body.data.breakdown).toBeTruthy();

    await page.goto(`/vehicle/${state.vehicleId}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await shot(page, "buyer-vehicle-passport-trust");
  });

  test("S7. Buyer sends an inquiry and the seller answers it", async ({ page, context }) => {
    await loginViaUi(page, state.buyerEmail);

    const market = await api(context, `/api/v1/marketplace/listings?q=${encodeURIComponent(state.regNo)}`);
    const listingId = (market.body.data.items as any[]).find((r) => r.regNo === state.regNo)?.listingId;
    expect(listingId).toBeTruthy();

    const inq = await api(context, "/api/v1/inquiries", {
      method: "POST",
      data: {
        listingId,
        message: "Is the service history complete? Can I schedule a test ride this weekend?",
        type: "test_drive",
      },
    });
    expect([200, 201]).toContain(inq.status);

    const list = await api(context, "/api/v1/inquiries");
    expect(list.status).toBe(200);
    const mine = (list.body.data as any[]).find((i) => i.listingId === listingId);
    expect(mine, "the inquiry must be persisted for the buyer").toBeTruthy();
    expect(mine.buyerId).toBeTruthy();
    expect(mine.sellerId).toBeTruthy();

    await page.goto("/buyer/inquiries", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/inquir/i).first()).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(1500);
    await shot(page, "buyer-inquiries");

    // seller replies
    await loginViaUi(page, state.sellerEmail);
    const sellerInq = await api(context, "/api/v1/inquiries");
    const row = (sellerInq.body.data as any[]).find((i) => i.listingId === listingId);
    expect(row, "the seller must see the buyer inquiry").toBeTruthy();

    const reply = await api(context, `/api/v1/inquiries/${row.id}/messages`, {
      method: "POST",
      data: { message: "Yes - full service history is uploaded. Saturday 10:00 AM works for a test ride." },
    });
    expect([200, 201]).toContain(reply.status);

    await page.goto("/seller/inquiries", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/inquir/i).first()).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(1500);
    await shot(page, "seller-inquiries");

    // buyer sees the answer
    await loginViaUi(page, state.buyerEmail);
    const after = await api(context, "/api/v1/inquiries");
    const row2 = (after.body.data as any[]).find((i) => i.listingId === listingId);
    expect(row2).toBeTruthy();
    expect(row2.messageCount, "the reply must be visible to the buyer").toBeGreaterThan(0);
  });

  test("S8. Buyer generates and downloads the verification report", async ({ page, context }) => {
    await loginViaUi(page, state.buyerEmail);
    await page.goto("/buyer/reports", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/report/i).first()).toBeVisible({ timeout: 45_000 });
    await page.waitForTimeout(1500);
    await shot(page, "buyer-reports");

    const gen = await api(context, `/api/v1/reports/vehicle/${state.vehicleId}`, {
      method: "POST",
      data: { type: "Vehicle verification" },
    });
    expect([200, 201]).toContain(gen.status);
    const reportId = gen.body.data?.id;
    expect(reportId, "the report row must be created").toBeTruthy();

    // the PDF is produced by a real job; poll until it is ready
    let pdf: Buffer | null = null;
    let lastStatus = 0;
    for (let i = 0; i < 30; i++) {
      const res = await context.request.get(`/api/v1/reports/${reportId}/download`);
      lastStatus = res.status();
      if (res.status() === 200) {
        pdf = await res.body();
        break;
      }
      await page.waitForTimeout(2000);
    }
    expect(lastStatus, "the report PDF must become downloadable").toBe(200);
    expect(pdf!.subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf!.length).toBeGreaterThan(1000);
    fs.mkdirSync(SHOTS, { recursive: true });
    fs.writeFileSync(path.join(SHOTS, "buyer-report-downloaded.pdf"), pdf!);
  });

  test("M1. All six vehicle categories create correctly with category-aware fields", async ({ page, context }) => {
    await loginViaUi(page, state.sellerEmail);

    for (const c of CATALOGUE.slice(1)) {
      const { vehicleId } = await createVehicleViaUi(
        page,
        c,
        {
          photos: [
            path.join(FIXTURES, "photo-front.jpg"),
            path.join(FIXTURES, "photo-side.jpg"),
            path.join(FIXTURES, "photo-interior.jpg"),
          ],
          docs: [
            { type: c.doc, file: DOCS.rc(c.regNo) },
            { type: c.doc === "rc" ? "insurance" : "insurance_2w", file: DOCS.insurance(c.regNo) },
          ],
        }
      );
      expect(vehicleId, `${c.categoryId} must produce a vehicle`).toBeTruthy();
      state.categories[c.categoryId] = vehicleId;

      const list = await api(context, `/api/v1/seller/vehicles?q=${encodeURIComponent(c.make)}`);
      const row = (list.body.data.items as any[]).find((r) => r.id === vehicleId);
      expect(row, `${c.categoryId} must persist`).toBeTruthy();
      expect(row.regNo).toBe(c.regNo);
      saveState();
    }

    // category-specific expectations: an EV never carries a combustion engine
    const evCar = await api(context, `/api/v1/vehicles/${state.categories.electric_car}`);
    expect(evCar.status).toBe(200);
    expect(String(evCar.body.data.fuel).toLowerCase()).toContain("electric");

    const evScooter = await api(context, `/api/v1/vehicles/${state.categories.electric_scooter}`);
    expect(evScooter.status).toBe(200);
    expect(String(evScooter.body.data.fuel).toLowerCase()).toContain("electric");

    const bike = await api(context, `/api/v1/vehicles/${state.categories.petrol_motorcycle}`);
    expect(bike.status).toBe(200);
    expect(String(bike.body.data.fuel).toLowerCase()).toContain("petrol");

    const car = await api(context, `/api/v1/vehicles/${state.categories.passenger_car}`);
    expect(car.status).toBe(200);
    expect(String(car.body.data.fuel).toLowerCase()).toContain("petrol");

    // an EV must never be asked for a combustion engine number
    const evSpecs = await api(context, `/api/v1/vehicles/${state.categories.electric_scooter}`);
    expect(String(evSpecs.body.data.engine_number ?? "")).toBe("");
  });

  test("M2. 3D viewer uses a category-appropriate model (never a car for a two-wheeler)", async ({ page }) => {
    await loginViaUi(page, state.sellerEmail);

    for (const [catId, vId] of Object.entries(state.categories)) {
      const res = await page.request.get(`/api/v1/vehicles/${vId}/3d-model`);
      expect(res.status()).toBe(200);
      const json = await res.json();
      const data = json.data ?? json;
      const assetUrl = data.assetUrl ?? null;
      const isCar = catId === "passenger_car" || catId === "electric_car";
      if (isCar) {
        expect(assetUrl, `${catId} must have a real GLB`).toBeTruthy();
        expect(String(assetUrl)).toMatch(/\.glb$/);
      } else {
        expect(assetUrl, `${catId} must NOT load the sedan GLB`).toBeNull();
        expect(data.assetScope).toBe("labelled-schematic");
        expect(data.interactionsAvailable).toBe(false);
      }
    }
  });

  test("R1. RBAC — a buyer cannot reach seller routes or seller APIs", async ({ page, context }) => {
    await loginViaUi(page, state.buyerEmail);

    // direct URL navigation
    await page.goto("/seller/vehicles", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const onSellerPath = /\/seller/.test(new URL(page.url()).pathname);
    expect(onSellerPath, "a buyer must not stay on a seller route").toBeFalsy();

    // direct API call
    const res = await api(context, "/api/v1/seller/vehicles");
    expect([401, 403]).toContain(res.status);
  });

  test("R2. RBAC — seller A cannot read seller B's private vehicle documents", async ({ page, context }) => {
    const email = `qa.seller2.${RUN}@trustdrive.dev`;
    await registerViaUi(page, { name: "QA Live Seller Two", email, role: "seller" });
    state.seller2Email = email;
    saveState();

    const res = await api(context, `/api/v1/vehicles/${state.vehicleId}/documents`);
    expect([403, 404]).toContain(res.status);

    const one = await api(context, `/api/v1/vehicles/${state.vehicleId}`);
    expect([403, 404]).toContain(one.status);
  });

  test("R3. RBAC — a buyer only sees consented documents of a published listing", async ({ page, context }) => {
    await loginViaUi(page, state.buyerEmail);
    const res = await api(context, `/api/v1/vehicles/${state.vehicleId}/documents`);
    expect(res.status).toBe(200);
    const items = res.body.data.items as any[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((d) => d.consent === true)).toBeTruthy();
  });

  test("E1. Edge cases — invalid input, duplicate registration and bad files are rejected", async ({ page, context }) => {
    await loginViaUi(page, state.sellerEmail);

    // duplicate registration number
    const dup = await api(context, "/api/v1/seller/vehicles", {
      method: "POST",
      data: {
        make: "Dup",
        model: "Dup",
        regNo: state.regNo,
        vin: "MA3FJE61S10000099",
        year: 2021,
        categoryId: "passenger_car",
      },
    });
    expect([409, 400]).toContain(dup.status);
    expect(String(dup.body?.error?.code ?? "")).toMatch(/DUPLICATE|VALIDATION/i);

    // invalid body
    const empty = await api(context, "/api/v1/seller/vehicles", { method: "POST", data: {} });
    expect([400, 422]).toContain(empty.status);

    // invalid file type
    const badType = await context.request.post(`/api/v1/vehicles/${state.vehicleId}/documents`, {
      multipart: {
        type: "rc",
        consent: "true",
        file: {
          name: "unsupported.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("plain text, not a document"),
        },
      },
    });
    expect([415, 400]).toContain(badType.status());

    // corrupted PDF
    const corrupt = await context.request.post(`/api/v1/vehicles/${state.vehicleId}/documents`, {
      multipart: {
        type: "rc",
        consent: "true",
        file: {
          name: "corrupt.pdf",
          mimeType: "application/pdf",
          buffer: fs.readFileSync(path.join(FIXTURES, "corrupt.pdf")),
        },
      },
    });
    expect([415, 400, 422]).toContain(corrupt.status());

    // oversized file
    const big = await context.request.post(`/api/v1/vehicles/${state.vehicleId}/documents`, {
      multipart: {
        type: "rc",
        consent: "true",
        file: {
          name: "oversized.pdf",
          mimeType: "application/pdf",
          buffer: fs.readFileSync(path.join(FIXTURES, "oversized.pdf")),
        },
      },
    });
    expect([413, 415, 400]).toContain(big.status());
  });

  test("E2. Edge cases — unauthenticated API access is refused", async ({ request }) => {
    for (const p of [
      "/api/v1/seller/vehicles",
      "/api/v1/seller/overview",
      "/api/v1/admin/audit",
      "/api/v1/admin/users",
    ]) {
      const res = await request.get(p, { headers: { Authorization: "Bearer invalid-token" } });
      expect([401, 403], `${p} must refuse an invalid token`).toContain(res.status());
    }
  });

  test("E3. Edge cases — the UI shows a validation error for an empty required form", async ({ page }) => {
    await loginViaUi(page, state.sellerEmail);
    await page.goto("/seller/add-vehicle", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Save draft & continue/i }).click();
    await expect(page.getByText(/required/i).first()).toBeVisible({ timeout: 30_000 });
    await shot(page, "seller-add-vehicle-validation-error");
  });

  test("E4. Edge cases — the UI rejects an invalid registration number", async ({ page }) => {
    await loginViaUi(page, state.sellerEmail);
    await page.goto("/seller/add-vehicle", { waitUntil: "domcontentloaded" });
    await page.getByLabel("Vehicle category").selectOption("passenger_car");
    await page.getByLabel("Registration number").fill("!!");
    await page.getByLabel(/VIN \(17 characters\)|Chassis \/ frame number/).fill("SHORT");
    await page.getByLabel("Manufacturer").fill("Test");
    await page.getByLabel("Model").fill("Invalid");
    await page.getByLabel("Manufacturing year").fill("2021");
    await page.getByRole("button", { name: /Save draft & continue/i }).click();
    await expect(page.getByText(/registration|identifier|required|invalid/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await shot(page, "seller-add-vehicle-invalid-identity");
  });

  test("P1. Public pages and the 3D inspection route render without console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(String(e)));

    for (const p of ["/", "/marketplace", "/inspection", "/about", "/faq", "/technology"]) {
      await page.goto(p, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
    }
    await page.goto("/inspection", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3500);
    await shot(page, "public-inspection-3d");

    const real = errors.filter((e) => !/favicon|Download the React DevTools|net::ERR_ABORTED/i.test(e));
    expect(real, `console errors: ${real.join(" | ")}`).toHaveLength(0);
  });
});
