/**
 * Independent read-only API probe for the running TrustDrive stack.
 * Writes qa/indep-api.json. No direct DB writes, no session injection.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const BASE = process.env.TD_BASE_URL || "http://127.0.0.1:3000";
const INTEL = process.env.TD_INTEL_URL || "http://127.0.0.1:8000";

// Read the service token from the repo .env without printing it.
const envText = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
const serviceToken = (envText.match(/^TD_SERVICE_TOKEN=(.*)$/m)?.[1] || "").trim();

const rows = [];
function rec(group, method, url, status, ok, detail) {
  rows.push({ group, method, url, status, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${group} ${method} ${url} → ${status} ${detail ?? ""}`);
}

async function call(target, pathname, opts = {}) {
  const r = await fetch(`${target}${pathname}`, { ...opts, signal: AbortSignal.timeout(30000) });
  const text = await r.text().catch(() => "");
  let json = null;
  try { json = JSON.parse(text); } catch { /* binary / html */ }
  return { status: r.status, headers: r.headers, json, text };
}

(async () => {
  // ---- Python intelligence service ----
  const health = await call(INTEL, "/health");
  rec("Intelligence", "GET", "/health", health.status, health.status === 200 && health.json?.status === "ok",
    `version=${health.json?.version} tables=${health.json?.database?.tables} shared=${health.json?.database?.shared_with_nextjs}`);

  const svc = { "X-Service-Token": serviceToken };
  // These endpoints are service-token gated by design. Test BOTH sides.
  for (const p of ["/api/intelligence/capabilities", "/api/intelligence/categories"]) {
    const anonymous = await call(INTEL, p);
    rec("Security", "GET", `${p} (anonymous)`, anonymous.status, anonymous.status === 401 || anonymous.status === 403, "service-token required");
  }
  const caps = await call(INTEL, "/api/intelligence/capabilities", { headers: svc });
  rec("Intelligence", "GET", "/api/intelligence/capabilities (service token)", caps.status, caps.status === 200, `keys=${Object.keys(caps.json?.data ?? caps.json ?? {}).slice(0, 8).join(",")}`);

  const cats = await call(INTEL, "/api/intelligence/categories", { headers: svc });
  const catList = cats.json?.data?.categories ?? cats.json?.categories ?? cats.json?.data ?? [];
  rec("Intelligence", "GET", "/api/intelligence/categories (service token)", cats.status, cats.status === 200, `categories=${Array.isArray(catList) ? catList.length : "n/a"}`);

  // Anonymous investigation must be rejected (SEC).
  const anon = await call(INTEL, "/api/intelligence/investigate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vehicleId: "v-bmw", requesterRole: "seller" }),
  });
  rec("Security", "POST", "/api/intelligence/investigate (anonymous)", anon.status, anon.status === 401 || anon.status === 403, "service-token required");

  // ---- Next.js public / protected API ----
  const stack = await call(BASE, "/api/v1/ai/stack");
  rec("Frontend API", "GET", "/api/v1/ai/stack", stack.status, stack.status === 200 && stack.json?.data?.connected === true,
    `connected=${stack.json?.data?.connected}`);

  const listings = await call(BASE, "/api/v1/marketplace/listings");
  const items = listings.json?.data?.items ?? listings.json?.data ?? [];
  rec("Frontend API", "GET", "/api/v1/marketplace/listings", listings.status, listings.status === 200,
    `items=${Array.isArray(items) ? items.length : "n/a"}`);

  const catsFe = await call(BASE, "/api/v1/categories");
  rec("Frontend API", "GET", "/api/v1/categories", catsFe.status, catsFe.status === 200, `bytes=${catsFe.text.length}`);

  const sample = await call(BASE, "/api/v1/public/sample-report");
  rec("Frontend API", "GET", "/api/v1/public/sample-report", sample.status,
    sample.status === 200 && (sample.headers.get("content-type") || "").includes("pdf") && sample.text.startsWith("%PDF"),
    `bytes=${sample.text.length} demo=${sample.headers.get("x-trustdrive-demo-data")}`);

  const priv = await call(BASE, "/api/v1/reports/rep-1/download");
  rec("Security", "GET", "/api/v1/reports/rep-1/download (anonymous)", priv.status, priv.status === 401 || priv.status === 403, "RBAC preserved");

  for (const p of ["/api/v1/seller/overview", "/api/v1/buyer/overview", "/api/v1/admin/audit", "/api/v1/notifications"]) {
    const r = await call(BASE, p);
    rec("Security", "GET", `${p} (anonymous)`, r.status, r.status === 401 || r.status === 403, "protected");
  }

  const summary = {
    executedAt: new Date().toISOString(),
    base: BASE, intel: INTEL,
    total: rows.length,
    passed: rows.filter((r) => r.ok).length,
    failed: rows.filter((r) => !r.ok).length,
    rows,
  };
  fs.writeFileSync(path.join(HERE, "indep-api.json"), JSON.stringify(summary, null, 2));
  console.log(`\nAPI PROBE: ${summary.passed}/${summary.total} passed, ${summary.failed} failed`);
  process.exit(summary.failed ? 1 : 0);
})().catch((e) => { console.error("PROBE ERROR", e); process.exit(2); });
