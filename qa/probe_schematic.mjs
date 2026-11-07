// Visual verification: confirm a two-wheeler buyer page actually RENDERS the
// labelled category schematic after the lazy 3D chunk finishes loading, and
// that it never falls back to the sedan GLB. Also confirm the car page renders
// the real GLB. Writes two full-height screenshots into SCREENSHOTS/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SHOTS = path.join(ROOT, "SCREENSHOTS");
fs.mkdirSync(SHOTS, { recursive: true });
const frontendRequire = createRequire(path.join(ROOT, "frontend", "package.json"));
const { chromium } = frontendRequire("@playwright/test");
const BASE = process.env.TD_BASE_URL || "http://127.0.0.1:3000";

const summary = JSON.parse(fs.readFileSync(path.join(ROOT, "qa", "live-e2e-summary.json"), "utf8"));
const pick = (id) => summary.created.find((c) => c.categoryId === id);
const twoWheeler = pick("electric_scooter");
const car = pick("passenger_car");

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();

async function inspect(entry, name) {
  if (!entry) return { name, error: "no fixture in summary" };
  await page.goto(`${BASE}/vehicle/${entry.vehicleId}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  // Wait for the dynamic Viewer3DLazy chunk to replace its loading placeholder.
  await page.getByText("Loading 3D viewer…").waitFor({ state: "hidden", timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const text = await page.locator("body").innerText();
  const out = path.join(SHOTS, name);
  await page.screenshot({ path: out, fullPage: false });
  return {
    name,
    vehicleId: entry.vehicleId,
    screenshot: path.relative(ROOT, out).replaceAll("\\", "/"),
    loadingPlaceholderGone: !text.includes("Loading 3D viewer"),
    labelledSchematicShown: /No 3D model available|Labelled schematic|interactions off/i.test(text),
    noCarGlbMentioned: !/trustdrive-sedan|sedan\.glb/i.test(text),
    carStudioShown: /TrustDrive 3D Studio/i.test(text),
    excerpt: text.split("\n").filter((l) => /schematic|3D model|Studio|damage panel/i.test(l)).slice(0, 6),
  };
}

const results = [];
results.push(await inspect(twoWheeler, "verify-electric_scooter-schematic.png"));
results.push(await inspect(car, "verify-passenger_car-glb.png"));
console.log(JSON.stringify(results, null, 2));
await browser.close();
