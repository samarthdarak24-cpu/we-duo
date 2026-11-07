// Probe: real end-to-end latency + engine source of the AI investigation,
// measured through the app's own authenticated route (Next -> Python agent).
import fs from "node:fs";
import { newContext, api, closeAll, waitForHydration, BASE } from "./live/harness.mjs";

const VEHICLE = process.argv[2] ?? "v-1794050457225";

const ctx = await newContext();
const page = await ctx.newPage();
let status = 0;
for (let attempt = 1; attempt <= 3 && status !== 200; attempt += 1) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await waitForHydration(page, "#login-email");
  await page.locator("#login-email").fill("samarth@trustdrive.dev");
  await page.locator("#login-password").fill("demo1234");
  const rp = page
    .waitForResponse((r) => r.url().includes("/api/v1/auth/login") && r.request().method() === "POST", { timeout: 45000 })
    .catch(() => null);
  await page.locator('form button[type="submit"]').click().catch(() => {});
  const res = await rp;
  status = res?.status() ?? 0;
  await page.waitForTimeout(1200);
}
console.log(`login HTTP ${status} -> ${page.url()}`);
if (status !== 200) process.exit(1);
await page.waitForTimeout(800);

for (let i = 1; i <= 3; i += 1) {
  const t0 = Date.now();
  const res = await api(page, "POST", `/api/v1/vehicles/${VEHICLE}/ai-investigations`, {
    question: "Latency probe. Summarise the verified evidence and open findings.",
  });
  const ms = Date.now() - t0;
  const d = res.json?.data ?? {};
  console.log(`attempt ${i}: HTTP ${res.status} in ${ms}ms source=${d.source} orchestrator=${d.orchestrator} nodes=${(d.nodes ?? []).length}`);
  fs.writeFileSync(`qa/probe-investigate-${i}.json`, JSON.stringify(d, null, 2));
}

await closeAll();
