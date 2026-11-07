// Live check of the 3D studio: does the viewer resolve its asset through the
// backend manifest, does the WebGL canvas boot, and is the on-screen provenance
// label honest for each role?
const { chromium } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:3000";
const CREDS = {
  seller: ["samarth@trustdrive.dev", "demo1234"],
  buyer: ["rohan@trustdrive.dev", "demo1234"],
};

async function login(page, role) {
  const [email, pw] = CREDS[role];
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"], input[name="email"]', email);
  await page.fill('input[type="password"], input[name="password"]', pw);
  await page.click('button[type="submit"]');
  await page.waitForURL(/seller|buyer|admin/, { timeout: 20000 }).catch(() => {});
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  const targets = [
    { role: "seller", path: "/seller", name: "seller home studio" },
    { role: "seller", path: "/seller/vehicles/v-bmw", name: "seller vehicle detail" },
    { role: "buyer", path: "/vehicle/v-bmw", name: "buyer vehicle report" },
    { role: null, path: "/inspection", name: "public inspection studio" },
  ];

  for (const t of targets) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const net = [];
    const errs = [];
    page.on("response", async (r) => {
      if (/3d-model|components|\.glb/.test(r.url())) {
        let body = "";
        if (/3d-model/.test(r.url())) {
          try {
            body = (await r.text()).slice(0, 160);
          } catch {}
        }
        net.push(`${r.status()} ${r.url().replace(BASE, "").slice(0, 70)} ${body}`);
      }
    });
    page.on("console", (m) => {
      if (m.type() === "error") errs.push(m.text().slice(0, 160));
    });
    page.on("pageerror", (e) => errs.push("PAGEERROR " + String(e).slice(0, 160)));

    if (t.role) await login(page, t.role);
    await page.goto(BASE + t.path, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(4000);

    const canvas = await page.locator("canvas").first().isVisible().catch(() => false);
    const pins = await page.locator('text=/damage/i').count().catch(() => 0);
    const label = await page
      .locator("p[title]", { hasText: /reference|generic|vehicle-specific|geometry/i })
      .first()
      .innerText()
      .catch(() => "(no provenance label)");
    const title = await page
      .locator("p[title]")
      .filter({ hasText: /reference|generic|vehicle-specific|geometry/i })
      .first()
      .getAttribute("title")
      .catch(() => null);
    const shot = `qa/shots/3d-${t.role || "anon"}${t.path.replace(/[^a-z0-9]/gi, "_")}.png`;
    await page.screenshot({ path: shot }).catch(() => {});

    console.log(`\n=== ${t.name} (${t.path}) ===`);
    console.log("canvas visible :", canvas);
    console.log("provenance     :", label.replace(/\s+/g, " ").slice(0, 190));
    console.log("tooltip        :", (title || "-").replace(/\s+/g, " ").slice(0, 190));
    console.log("damage mentions:", pins);
    console.log("asset network  :", net.length ? net.join(" | ") : "(none)");
    console.log("errors         :", errs.length ? [...new Set(errs)].slice(0, 4).join(" || ") : "none");
    console.log("screenshot     :", shot);
    await ctx.close();
  }
  await browser.close();
})();
