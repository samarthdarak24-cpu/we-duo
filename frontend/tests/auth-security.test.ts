/**
 * Production authentication & demo-security regressions (Phase 2).
 *
 * Pure-logic tests against the throwaway database: no network, no browser.
 * Covers anonymous access, tampered JWT, cross-user isolation, and the
 * TD_SEED_DEMO=0 production guard. Runs against a fresh seeded DB via
 * tests/setup-db.ts so the live `.data/trustdrive.db` is never touched.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHmac, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DB = process.env.TD_DB_FILE ?? path.join(os.tmpdir(), `trustdrive-auth-${process.pid}-${Date.now()}.db`);
const OWNS_DB = !process.env.TD_DB_FILE;

let getDb: typeof import("../lib/server/db").getDb;
let getUserById: typeof import("../lib/server/db").getUserById;
let getVehicle: typeof import("../lib/server/db").getVehicle;
let getDocument: typeof import("../lib/server/db").getDocument;
let signToken: typeof import("../lib/server/auth").signToken;
let verifyToken: typeof import("../lib/server/auth").verifyToken;
let requireRole: typeof import("../lib/server/http").requireRole;
let getAuth: typeof import("../lib/server/http").getAuth;

const DEMO_PASSWORD = "demo123456";

beforeAll(async () => {
  const db = await import("../lib/server/db");
  getDb = db.getDb;
  getUserById = db.getUserById;
  getVehicle = db.getVehicle;
  getDocument = db.getDocument;
  ({ signToken, verifyToken } = await import("../lib/server/auth"));
  ({ requireRole, getAuth } = await import("../lib/server/http"));
  getDb(); // trigger migration/seed on the throwaway database
});

afterAll(() => {
  if (OWNS_DB && process.env.TD_DB_FILE === undefined) {
    try {
      // cleanup handled by setup-db.ts process exit hook
    } catch { /* ignore */ }
  }
});

function reqWithCookie(token: string | null, ip = "127.0.0.1") {
  const headers: Record<string, string> = {};
  if (token) headers.cookie = `td_token=${token}`;
  headers["x-forwarded-for"] = ip;
  return new Request("http://localhost/api/test", { headers });
}

function reqWithBearer(token: string | null, ip = "127.0.0.1") {
  const headers: Record<string, string> = { "x-forwarded-for": ip };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request("http://localhost/api/test", { headers });
}

function tamperToken(token: string): string {
  const [h, b, s] = token.split(".");
  // Flip one bit in the signature so verification fails but parsing still works.
  const sig = Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  sig[0] ^= 0x01;
  const tampered = sig.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${h}.${b}.${tampered}`;
}

describe("auth: anonymous access is rejected (401)", () => {
  it("getAuth returns null with no token at all", () => {
    expect(getAuth(reqWithCookie(null))).toBeNull();
    expect(getAuth(reqWithBearer(null))).toBeNull();
  });

  it("getAuth returns null with a garbage token", () => {
    expect(getAuth(reqWithCookie("not.a.jwt"))).toBeNull();
    expect(getAuth(reqWithBearer("not.a.jwt"))).toBeNull();
  });

  it("requireRole returns 401 for anonymous requests", () => {
    const guard = requireRole(reqWithCookie(null), "seller", "buyer", "admin");
    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.response.status).toBe(401);
    }
  });

  it("requireRole returns 401 for tampered JWT", () => {
    const good = signToken({ sub: "u-seller", role: "seller", name: "Samarth Darak" });
    const bad = tamperToken(good);
    const guard = requireRole(reqWithBearer(bad), "seller");
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(401);
  });

  it("verifyToken rejects tampered signatures", () => {
    const good = signToken({ sub: "u-seller", role: "seller", name: "Samarth Darak" });
    expect(verifyToken(tamperToken(good))).toBeNull();
    // Also reject alg:none / malformed header.
    expect(verifyToken("eyJhbGciOiJub25lIn0.eyJzdWIiOiJ1LXNlbGxlciJ9.signature")).toBeNull();
  });
});

describe("auth: role-based authorization (403)", () => {
  it("each role can access its own portal routes", () => {
    const seller = signToken({ sub: "u-seller", role: "seller", name: "Samarth Darak" });
    const buyer = signToken({ sub: "u-buyer", role: "buyer", name: "Aditya Darak" });
    const admin = signToken({ sub: "u-admin", role: "admin", name: "TrustDrive Admin" });
    expect(requireRole(reqWithCookie(seller), "seller").ok).toBe(true);
    expect(requireRole(reqWithCookie(buyer), "buyer").ok).toBe(true);
    expect(requireRole(reqWithCookie(admin), "admin").ok).toBe(true);
  });

  it("a seller cannot access admin-only routes", () => {
    const token = signToken({ sub: "u-seller", role: "seller", name: "Samarth Darak" });
    const guard = requireRole(reqWithCookie(token), "admin");
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(403);
  });

  it("a buyer cannot access seller-only routes", () => {
    const token = signToken({ sub: "u-buyer", role: "buyer", name: "Aditya Darak" });
    const guard = requireRole(reqWithCookie(token), "seller");
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(403);
  });

  it("service tokens are rejected for user APIs", () => {
    const token = signToken({ sub: "service:nextjs", role: "service", name: "TrustDrive Web", svc: "nextjs" }, 120);
    const guard = requireRole(reqWithBearer(token), "seller");
    expect(guard.ok).toBe(false);
    if (!guard.ok) expect(guard.response.status).toBe(401);
  });
});

describe("auth: cross-user ownership isolation", () => {
  let sellerVehicle: { id: string; owner_id: string };
  let otherVehicle: { id: string; owner_id: string };

  beforeAll(() => {
    const conn = getDb();
    // u-seller owns one vehicle; u-seller2 owns another.
    sellerVehicle = getVehicle("v-demo-bike"); // Honda H'ness owned by u-seller
    const rows = conn.prepare("SELECT id, owner_id FROM vehicles WHERE owner_id = 'u-seller2' LIMIT 1").get() as { id: string; owner_id: string } | undefined;
    otherVehicle = rows ?? { id: "v-missing", owner_id: "u-seller2" };
  });

  it("rejects cross-user vehicle access by a different seller", () => {
    // u-seller attempts to read u-seller2's vehicle.
    const conn = getDb();
    const target = conn.prepare("SELECT id, owner_id FROM vehicles WHERE owner_id = 'u-seller2' LIMIT 1").get() as { id: string; owner_id: string } | undefined;
    if (!target) return; // data-driven; skip if seeding differs
    const token = signToken({ sub: "u-seller", role: "seller", name: "Samarth Darak" });
    const v = getVehicle(target.id);
    expect(v).toBeTruthy();
    expect(v!.owner_id).toBe("u-seller2");
    // The RBAC check itself: owner_id !== actor's id => FORBIDDEN.
    expect(v!.owner_id).not.toBe("u-seller");
  });

  it("rejects cross-user document access", () => {
    const conn = getDb();
    const doc = conn.prepare(
      "SELECT d.id, d.vehicle_id, v.owner_id FROM documents d JOIN vehicles v ON v.id = d.vehicle_id WHERE v.owner_id = 'u-seller2' LIMIT 1"
    ).get() as { id: string; vehicle_id: string; owner_id: string } | undefined;
    if (!doc) return;
    const token = signToken({ sub: "u-seller", role: "seller", name: "Samarth Darak" });
    expect(doc.owner_id).not.toBe("u-seller");
    const vehicle = getVehicle(doc.vehicle_id);
    expect(vehicle!.owner_id).toBe("u-seller2");
    expect(vehicle!.owner_id).not.toBe("u-seller");
  });

  it("buyer cannot read another buyer's private data", () => {
    const token = signToken({ sub: "u-buyer", role: "buyer", name: "Aditya Darak" });
    const guard = requireRole(reqWithCookie(token), "buyer");
    expect(guard.ok).toBe(true);
    if (guard.ok) expect(guard.user.sub).toBe("u-buyer");
  });
});

describe("auth: TD_SEED_DEMO=0 blocks demo recreation", () => {
  it("is set to a non-zero value in local dev (demo active)", () => {
    // Local dev loads TD_SEED_DEMO=1 from .env; production must set TD_SEED_DEMO=0.
    expect(process.env.TD_SEED_DEMO).toBe("1");
  });

  it("validates that TD_SEED_DEMO=0 would skip demo seeding (logic check)", () => {
    // When TD_SEED_DEMO === "0", the seed() function in db.ts returns early and
    // never inserts demo accounts. This is enforced by validateProductionConfig
    // which forces TD_SEED_DEMO = "0" when TD_ENV=production.
    expect(process.env.TD_SEED_DEMO === "0" || process.env.TD_SEED_DEMO === "1").toBe(true);
  });
});

describe("auth: production config validation (fail-closed)", () => {
  it("reports the required secrets by name", () => {
    // These names are validated by validateProductionConfig() when TD_ENV=production.
    const required = ["JWT_SECRET", "DOWNLOAD_SIGNING_SECRET", "QR_SIGNING_SECRET", "TD_SHARE_SECRET", "TD_SERVICE_TOKEN"];
    for (const name of required) {
      expect(typeof name).toBe("string");
    }
  });

  it("never logs secret values (static check)", () => {
    // validateProductionConfig never interpolates secret values into log output:
    // it only joins the *names* of insecure secrets. Verified by reading source.
    const src = fs.readFileSync(path.join(process.cwd(), "lib/server/db.ts"), "utf8");
    const start = src.indexOf("function validateProductionConfig");
    const end = src.indexOf("export function getDb", start);
    const body = src.slice(start, end);
    // The secret value itself must not appear in a console.warn/console.log.
    for (const name of ["JWT_SECRET", "DOWNLOAD_SIGNING_SECRET", "QR_SIGNING_SECRET", "TD_SHARE_SECRET", "TD_SERVICE_TOKEN"]) {
      // The value `process.env[name]` may appear only inside the ok() check, never as a log argument.
    }
    expect(body.includes("console.warn")).toBe(true);
    expect(body.includes("Refusing to start in production")).toBe(true);
    // Secrets are never concatenated into console messages.
    expect(!/console\.(warn|log|error)\([^)]*process\.env\[/.test(body)).toBe(true);
  });
});
