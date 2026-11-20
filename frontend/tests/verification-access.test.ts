/**
 * RBAC regressions for the verification case API and the run progress stream.
 * Both expose findings/evidence IDs, so role alone must never be enough —
 * the vehicle owner (or an admin) is required, exactly like the page guard.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { signToken } from "../lib/server/auth";
import { getDb } from "../lib/server/db";
import { ensureVerificationCase } from "../lib/server/evidence";
import { GET as getCase } from "../app/api/v1/verification-cases/[id]/route";
import { GET as getStream } from "../app/api/v1/verification/runs/[runId]/stream/route";
import { GET as getVehicleReportApi } from "../app/api/v1/vehicles/[id]/route";

const OWNER_TOKEN = () => signToken({ sub: "u-seller", role: "seller", name: "Samarth Darak" });
const OTHER_TOKEN = () => signToken({ sub: "u-seller2", role: "seller", name: "Other Seller" });
const BUYER_TOKEN = () => signToken({ sub: "u-buyer", role: "buyer", name: "Test Buyer" });

function authed(token: string | null) {
  return new Request("http://localhost/api/test", {
    headers: token ? { cookie: `td_token=${token}` } : {},
  });
}

beforeAll(() => {
  getDb();
  ensureVerificationCase("u-seller", "seller", "v-bmw");
});

describe("verification case API is owner/admin only", () => {
  it("returns 401 without a session", async () => {
    const res = await getCase(authed(null), { params: { id: "vc-run-v-bmw" } });
    expect(res.status).toBe(401);
  });

  it("allows the vehicle owner", async () => {
    const res = await getCase(authed(OWNER_TOKEN()), { params: { id: "vc-run-v-bmw" } });
    expect(res.status).toBe(200);
  });

  it("rejects another seller (IDOR)", async () => {
    const res = await getCase(authed(OTHER_TOKEN()), { params: { id: "vc-run-v-bmw" } });
    expect(res.status).toBe(403);
  });
});

describe("verification run stream is authenticated and ownership-checked", () => {
  it("returns 401 without a session", async () => {
    const res = await getStream(authed(null), { params: { runId: "run-v-bmw" } });
    expect(res.status).toBe(401);
  });

  it("allows the vehicle owner", async () => {
    const res = await getStream(authed(OWNER_TOKEN()), { params: { runId: "run-v-bmw" } });
    expect(res.status).toBe(200);
  });

  it("rejects another seller", async () => {
    const res = await getStream(authed(OTHER_TOKEN()), { params: { runId: "run-v-bmw" } });
    expect(res.status).toBe(403);
  });
});

describe("full vehicle report API is owner-only for sellers", () => {
  it("returns 401 without a session", async () => {
    const res = await getVehicleReportApi(authed(null), { params: { id: "v-bmw" } });
    expect(res.status).toBe(401);
  });

  it("allows the owning seller", async () => {
    const res = await getVehicleReportApi(authed(OWNER_TOKEN()), { params: { id: "v-bmw" } });
    expect(res.status).toBe(200);
  });

  it("rejects a different seller (IDOR on a competitor's evidence set)", async () => {
    const res = await getVehicleReportApi(authed(OTHER_TOKEN()), { params: { id: "v-bmw" } });
    expect(res.status).toBe(403);
  });

  it("still lets a buyer inspect a listing", async () => {
    const res = await getVehicleReportApi(authed(BUYER_TOKEN()), { params: { id: "v-bmw" } });
    expect(res.status).toBe(200);
  });
});
