/**
 * Regressions added by the 10-phase LIVE frontend + backend audit.
 *
 * These are pure-logic tests (no DB, no network) that lock down the six product
 * rules the live Chromium audit verified against the running stack. They are
 * deliberately independent of `qa/live_e2e.mjs` so `npm test` still catches a
 * regression even when the services are not running.
 */
import { describe, it, expect } from "vitest";
import {
  implementedCategories,
  getCategory,
  validateIdentity,
  fieldsForCategory,
  documentsForCategory,
  modelAssetForCategory,
  agentNodesForCategory,
  isElectric,
  pucApplicable,
} from "../lib/vehicle-categories";
import { publishGate } from "../lib/server/engine";

const rcTypeFor = (id: string) =>
  documentsForCategory(id).some((d) => d.id === "rc_2w") ? "rc_2w" : "rc";

const IDS = implementedCategories().map((c) => c.id);
const TWO_WHEELERS = ["petrol_motorcycle", "petrol_scooter", "electric_scooter", "electric_motorcycle"];
const CARS = ["passenger_car", "electric_car"];
const EVS = ["electric_scooter", "electric_motorcycle", "electric_car"];

describe("live audit: the six implemented categories stay implemented", () => {
  it("exposes exactly six categories in the required order", () => {
    expect(IDS).toEqual([
      "petrol_motorcycle",
      "petrol_scooter",
      "electric_scooter",
      "electric_motorcycle",
      "passenger_car",
      "electric_car",
    ]);
  });

  it.each(IDS)("%s declares a category-correct identity label", (id) => {
    const label = getCategory(id)?.identity.primaryLabel;
    expect(label).toBe(TWO_WHEELERS.includes(id) ? "Chassis / frame number" : "VIN (17 characters)");
  });
});

describe("live audit: no universal 17-character VIN rule", () => {
  const shortFrame = "ME4JC259E8"; // 10 characters
  const carVin = "WBA5R1C50KAK12345"; // 17 characters, no I/O/Q

  it.each(TWO_WHEELERS)("%s accepts a 10-character stamped frame number", (id) => {
    const r = validateIdentity(id, { regNo: "MH12AB1234", primaryIdentifier: shortFrame });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.normalized.identifier).toBe(shortFrame);
  });

  it.each(CARS)("%s rejects the same 10-character value", (id) => {
    const r = validateIdentity(id, { regNo: "MH12AB1234", primaryIdentifier: shortFrame });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/17 characters/);
  });

  it.each(CARS)("%s accepts a real 17-character VIN", (id) => {
    expect(validateIdentity(id, { regNo: "MH12AB1234", primaryIdentifier: carVin }).ok).toBe(true);
  });

  it("never applies the car rule to a scooter even with a 17-character frame", () => {
    expect(validateIdentity("petrol_scooter", { regNo: "MH12AB1234", primaryIdentifier: carVin }).ok).toBe(true);
  });
});

describe("live audit: EVs are never asked for petrol details", () => {
  it.each(IDS)("%s exposes only its own powertrain fields", (id) => {
    const names = fieldsForCategory(id).flatMap((g) => g.fields.map((f) => f.name));
    const electric = isElectric(id);
    expect(electric).toBe(EVS.includes(id));
    if (electric) {
      expect(names).not.toContain("engine_number");
      expect(names).not.toContain("engine_cc");
      expect(names).toContain("battery_soh");
      expect(names).toContain("motor_number");
      expect(pucApplicable(id)).toBe(false);
    } else {
      expect(names).toContain("engine_number");
      expect(names).toContain("engine_cc");
      expect(names).not.toContain("battery_soh");
    }
  });

  it.each(IDS)("%s keeps Battery State of Health out of the odometer field", (id) => {
    const fields = fieldsForCategory(id).flatMap((g) => g.fields);
    const soh = fields.find((f) => f.name === "battery_soh");
    const odo = fields.find((f) => f.name === "odometer_km");
    expect(odo?.column).toBe("km_claimed");
    if (soh) expect(soh.column).toBe("specs");
    expect(odo?.column).not.toBe(soh?.column);
  });
});

describe("live audit: no car 3D model for a scooter", () => {
  it.each(TWO_WHEELERS)("%s never receives a car GLB", (id) => {
    const asset = modelAssetForCategory(id);
    expect(asset.status).toBe("unavailable");
    expect(asset.url).toBeNull();
    expect(asset.assetId).toBeNull();
    expect(asset.interactionsAvailable).toBe(false);
    expect(asset.note).toMatch(/no car model/i);
    expect(asset.note).toMatch(/no primitive placeholder is substituted/i);
  });

  it.each(CARS)("%s keeps the licensed car GLB and labels it as generic reference", (id) => {
    const asset = modelAssetForCategory(id);
    expect(asset.status).toBe("available");
    expect(asset.assetId).toBe("trustdrive-sedan");
    expect(asset.url).toMatch(/\.glb$/);
    expect(asset.interactionsAvailable).toBe(true);
  });
});

describe("live audit: conditional LangGraph node sets", () => {
  it.each(IDS)("%s runs 15 nodes for combustion and 16 for electric", (id) => {
    const nodes = agentNodesForCategory(id);
    expect(nodes.length).toBe(isElectric(id) ? 16 : 15);
    expect(nodes.includes("EVBatteryAnalysisNode")).toBe(isElectric(id));
  });
});

describe("live audit: RC document type is category correct", () => {
  it.each(IDS)("%s uses the right RC type", (id) => {
    expect(rcTypeFor(id)).toBe(TWO_WHEELERS.includes(id) ? "rc_2w" : "rc");
  });
});

describe("live audit: publish gate cannot be bypassed by a bare draft", () => {
  const base = {
    criticalVinMismatch: false,
    insuranceExpired: false,
    mileageFindingOpen: false,
    documentsPending: false,
    inspectionPending: false,
  };

  it("blocks when photos, verified RC, fields and price are missing", () => {
    const gate = publishGate({ ...base, photoCount: 0, rcMissing: true, requiredFieldsMissing: true, askingPrice: 0 });
    expect(gate.blockers).toHaveLength(4);
    expect(gate.blockers.join(" ")).toMatch(/3 vehicle photos/);
    expect(gate.blockers.join(" ")).toMatch(/Registration Certificate/);
  });

  it("blocks when only two photos were uploaded", () => {
    const gate = publishGate({ ...base, photoCount: 2, rcMissing: false, requiredFieldsMissing: false, askingPrice: 500000 });
    expect(gate.blockers).toEqual(["Add at least 3 vehicle photos."]);
  });

  it("unblocks with 3 photos + verified RC + complete fields + positive price", () => {
    const gate = publishGate({ ...base, photoCount: 3, rcMissing: false, requiredFieldsMissing: false, askingPrice: 500000 });
    expect(gate.blockers).toEqual([]);
  });

  it("reports warnings without turning them into blockers", () => {
    const gate = publishGate({
      photoCount: 3, rcMissing: false, requiredFieldsMissing: false, askingPrice: 500000,
      criticalVinMismatch: false, insuranceExpired: true, mileageFindingOpen: true,
      documentsPending: true, inspectionPending: true,
    });
    expect(gate.blockers).toEqual([]);
    expect(gate.warnings).toHaveLength(4);
  });

  it("blocks a critical VIN/registration mismatch even when everything else is ready", () => {
    const gate = publishGate({ ...base, criticalVinMismatch: true, photoCount: 3, rcMissing: false, requiredFieldsMissing: false, askingPrice: 500000 });
    expect(gate.blockers.join(" ")).toMatch(/VIN\/registration mismatch/);
  });
});
