// Read-only API probe: logs in as each demo role and calls every GET endpoint,
// printing status + payload shape so mock/empty/broken surfaces are visible.
// Usage: node scripts/probe-api.mjs [base]
const base = process.argv[2] || "http://localhost:3000";

async function login(email, password) {
  const r = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error(`login ${email} -> ${r.status} ${JSON.stringify(await r.json()).slice(0, 120)}`);
  const setc = r.headers.getSetCookie();
  const token = String(setc.find((c) => c.startsWith("td_token=")) || "").match(/td_token=([^;]+)/)?.[1];
  if (!token) throw new Error(`no session cookie for ${email}`);
  return token;
}

function shape(v) {
  if (Array.isArray(v)) return `array(${v.length})`;
  if (v && typeof v === "object") {
    const keys = Object.keys(v);
    return `object{${keys.slice(0, 8).join(",")}${keys.length > 8 ? ",…" : ""}}`;
  }
  return JSON.stringify(v)?.slice(0, 40) ?? "undefined";
}

async function probe(token, label, endpoints) {
  const lines = [];
  await Promise.all(
    endpoints.map(async (e) => {
      try {
        const r = await fetch(`${base}${e}`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
        const j = await r.json().catch(() => null);
        const d = j && j.data !== undefined ? j.data : j?.error;
        const note = j?.error ? ` msg="${String(j.error.message).slice(0, 60)}"` : "";
        lines.push(`${r.status}\t${e}\t${shape(d)}${note}`);
      } catch (err) {
        lines.push(`ERR\t${e}\t${err.message}`);
      }
    })
  );
  lines.sort((a, b) => a.split("\t")[1].localeCompare(b.split("\t")[1]));
  console.log(`\n########## ${label} ##########`);
  console.log(lines.join("\n"));
}

const vehicleScoped = (id) =>
  ["", "/history", "/mileage", "/documents", "/documents/completeness", "/findings", "/damage", "/trust", "/risk", "/pricing", "/insights", "/alerts", "/chain", "/theft", "/photos", "/verification", "/report", "/ai/explain"]
    .map((s) => `/api/v1/vehicles/${id}${s}`);

const common = [
  "/api/v1/me",
  "/api/v1/me/sessions",
  "/api/v1/notifications",
  "/api/v1/reports",
  "/api/v1/marketplace/listings?pageSize=5",
  "/api/v1/marketplace/search?q=bmw",
  "/api/v1/marketplace/search?make=BMW&sort=trust&pageSize=5",
  "/api/v1/ai/health",
  "/api/v1/compare?ids=v-bmw,v-audi",
  "/api/v1/verification/lookup",
  ...vehicleScoped("v-bmw"),
];

const seller = [
  ...common,
  "/api/v1/seller/overview",
  "/api/v1/seller/vehicles",
  "/api/v1/seller/listings?pageSize=100",
  "/api/v1/inquiries",
];

const buyer = [
  ...common,
  "/api/v1/buyer/overview",
  "/api/v1/buyer/recommended",
  "/api/v1/saved",
  "/api/v1/saved-searches",
  "/api/v1/inquiries",
];

const admin = [
  ...common,
  "/api/v1/admin/queue",
  "/api/v1/admin/kyc",
  "/api/v1/admin/audit?pageSize=10",
  "/api/v1/admin/disputes",
];

const pw = "demo123456";
try {
  const [s, b, a] = await Promise.all([
    login("samarth@trustdrive.dev", pw),
    login("aditya@trustdrive.dev", pw),
    login("admin@trustdrive.dev", pw),
  ]);
  await Promise.all([probe(s, "SELLER", seller), probe(b, "BUYER", buyer), probe(a, "ADMIN", admin)]);
} catch (err) {
  console.error("probe failed:", err.message);
  process.exit(1);
}
