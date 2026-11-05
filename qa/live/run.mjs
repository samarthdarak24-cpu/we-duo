// One-feature-at-a-time live E2E CRUD runner.
// Usage: node qa/live/run.mjs F01
import * as H from "./harness.mjs";

const FEATURES = {
  F01: "Authentication / session",
  F02: "Seller overview KPIs",
  F03: "My Vehicles (list + detail)",
  F04: "Add vehicle wizard",
  F05: "Vehicle detail + edit",
  F06: "Documents / OCR",
  F07: "Verification center",
  F08: "AI fraud analysis / findings",
  F09: "3D inspection / damage records",
  F10: "Listings / marketplace",
  F11: "Listing action bar (8 actions)",
  F12: "Buyer inquiries",
  F13: "Seller inquiries",
  F14: "Compare vehicles",
  F15: "Saved / wishlist",
  F16: "Mileage analysis",
  F17: "Trust score",
  F18: "Reports / PDF",
  F19: "QR verification",
  F20: "Notifications",
  F21: "RBAC (server-side)",
};

const id = (process.argv[2] || "").toUpperCase();
if (!FEATURES[id]) {
  console.error(`Usage: node qa/live/run.mjs <${Object.keys(FEATURES).join("|")}>`);
  process.exit(2);
}

const rec = new H.Recorder(id, FEATURES[id]);
const ctx = await H.newContext();
const page = await ctx.newPage();
const net = H.recordNetwork(page);
const shared = { H, rec, page, ctx, net, BASE: H.BASE };

try {
  const mod = await import(`./features/${id}.mjs`);
  await mod.default(shared);
} catch (e) {
  rec.error("runner", e);
} finally {
  const out = rec.finish();
  await H.closeAll();
  process.exit(out.passed ? 0 : 1);
}
