/**
 * Regressions added by the 10-phase LIVE frontend + backend audit.
 *
 * These are pure-logic tests (no DB, no network) that lock down the product
 * rules the live Chromium audit verified against the running stack. They are
 * deliberately independent of `qa/live_e2e.mjs` so `npm test` still catches a
 * regression even when the services are not running.
 *
 * Updated for the 20-category taxonomy (multicategory-2.0.0): six categories
 * became twenty. Every rule below is category-aware rather than hardcoded to
 * the old six-profile set.
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
  hasBatteryPack,
  pucApplicable,
  matchCategoryId,
  isAllowedDocument,
} from "../lib/vehicle-categories";
import { publishGate } from "../lib/server/engine";

const IDS = implementedCategories().map((c) => c.id);

// Class groupings from the taxonomy.
const TWO_WHEELERS = [
  "petrol_motorcycle", "petrol_scooter", "electric_scooter", "electric_motorcycle",
  "moped", "electric_bike",
];
const THREE_WHEELERS = [
  "auto_rickshaw", "electric_three_wheeler", "passenger_three_wheeler", "cargo_three_wheeler",
];
const FOUR_WHEELER_CARS = [
  "passenger_car", "electric_car", "hatchback", "suv", "muv", "hybrid_car",
];
const COMMERCIAL = ["light_commercial", "truck", "bus", "electric_commercial"];

// Battery-pack profiles (pure electric + hybrid) get the battery node / battery
// fields; pure-combustion profiles do not.
const BATTERY_PACK = [
  ...["electric_scooter", "electric_motorcycle", "electric_car", "electric_bike",
     "electric_three_wheeler", "electric_commercial"],
  "hybrid_car",
];
// Pure battery-electric (no engine): isElectric true.
const PURE_ELECTRIC = [
  "electric_scooter", "electric_motorcycle", "electric_car", "electric_bike",
  "electric_three_wheeler", "electric_commercial",
];

const rcTypeFor = (id: string) => {
  const docs = documentsForCategory(id).map((d) => d.id);
  if (docs.includes("rc_2w")) return "rc_2w";
  if (docs.includes("rc_3w")) return "rc_3w";
  if (docs.includes("rc_commercial")) return "rc_commercial";
  return "rc";
};

describe("live audit: twenty implemented categories in required order", () => {
  it("exposes exactly 20 categories, none planned", () => {
    expect(IDS).toEqual([
      "petrol_motorcycle", "petrol_scooter", "electric_scooter", "electric_motorcycle",
      "passenger_car", "electric_car", "moped", "electric_bike", "auto_rickshaw",
      "electric_three_wheeler", "passenger_three_wheeler", "cargo_three_wheeler",
      "hatchback", "suv", "muv", "hybrid_car", "light_commercial", "truck", "bus",
      "electric_commercial",
    ]);
    expect(new Set(IDS).size).toBe(20);
  });

  it.each(IDS)("%s resolves through matchCategoryId and is registered", (id) => {
    expect(matchCategoryId(id)).toBe(id);
    expect(getCategory(id)).toBeTruthy();
  });
});

describe("live audit: category-correct identity label per class", () => {
  it.each(TWO_WHEELERS)("%s uses Chassis / frame number", (id) => {
    expect(getCategory(id)?.identity.primaryLabel).toBe("Chassis / frame number");
  });
  it.each(THREE_WHEELERS)("%s uses Chassis / frame number", (id) => {
    expect(getCategory(id)?.identity.primaryLabel).toBe("Chassis / frame number");
  });
  it.each([...FOUR_WHEELER_CARS])("%s uses VIN (17 characters)", (id) => {
    const label = getCategory(id)?.identity.primaryLabel;
    expect(label).toBe("VIN (17 characters)");
  });
  it.each([...COMMERCIAL])("%s uses Chassis / VIN number", (id) => {
    const label = getCategory(id)?.identity.primaryLabel;
    expect(label).toBe("Chassis / VIN number");
  });
});

describe("live audit: no universal 17-character VIN rule", () => {
  const shortFrame = "ME4JC259E8"; // 10 characters
  const carVin = "WBA5R1C50KAK12345"; // 17 characters, no I/O/Q
  const chassis14 = "MAT12345678901234"; // 14-character commercial chassis

  it.each([...TWO_WHEELERS, ...THREE_WHEELERS, ...COMMERCIAL])(
    "%s accepts a short stamped frame / chassis number", (id) => {
      const r = validateIdentity(id, { regNo: "MH12AB1234", primaryIdentifier: shortFrame });
      expect(r.ok, id).toBe(true);
      expect(r.normalized.identifier, id).toBe(shortFrame);
    }
  );

  it.each(FOUR_WHEELER_CARS)("%s rejects the 10-character value", (id) => {
    const r = validateIdentity(id, { regNo: "MH12AB1234", primaryIdentifier: shortFrame });
    expect(r.ok, id).toBe(false);
    expect(r.errors.join(" "), id).toMatch(/17 characters/);
  });

  it.each(FOUR_WHEELER_CARS)("%s accepts a real 17-character VIN", (id) => {
    expect(validateIdentity(id, { regNo: "MH12AB1234", primaryIdentifier: carVin }).ok, id).toBe(true);
  });

  it("never applies the car rule to a scooter even with a 17-character frame", () => {
    expect(validateIdentity("petrol_scooter", { regNo: "MH12AB1234", primaryIdentifier: carVin }).ok).toBe(true);
  });

  it.each(COMMERCIAL)("%s accepts a 14-character chassis number", (id) => {
    const r = validateIdentity(id, { regNo: "MH12AB1234", primaryIdentifier: chassis14 });
    expect(r.ok, id).toBe(true);
    expect(r.normalized.identifier, id).toBe(chassis14);
  });
});

describe("live audit: EVs are never asked for petrol details; hybrids keep both", () => {
  it.each(IDS)("%s exposes only its own powertrain fields", (id) => {
    const names = fieldsForCategory(id).flatMap((g) => g.fields.map((f) => f.name));
    const electric = isElectric(id);
    const battery = hasBatteryPack(id);
    expect(electric).toBe(PURE_ELECTRIC.includes(id));
    expect(battery).toBe(BATTERY_PACK.includes(id));

    if (electric) {
      expect(names).not.toContain("engine_number");
      expect(names).not.toContain("engine_cc");
      expect(names).toContain("battery_soh");
      expect(names).toContain("motor_number");
      expect(pucApplicable(id)).toBe(false);
    } else if (battery) {
      // Hybrid: keeps engine fields AND adds battery evidence.
      expect(names).toContain("engine_number");
      expect(names).toContain("engine_cc");
      expect(names).toContain("battery_soh");
      expect(pucApplicable(id)).toBe(true);
    } else {
      expect(names).toContain("engine_number");
      expect(names).toContain("engine_cc");
      expect(names).not.toContain("battery_soh");
      expect(pucApplicable(id)).toBe(true);
    }
  });

  it.each(BATTERY_PACK)("%s keeps Battery State of Health out of the odometer field", (id) => {
    const fields = fieldsForCategory(id).flatMap((g) => g.fields);
    const soh = fields.find((f) => f.name === "battery_soh");
    const odo = fields.find((f) => f.name === "odometer_km");
    expect(odo?.column).toBe("km_claimed");
    if (soh) expect(soh.column).toBe("specs");
    expect(odo?.column).not.toBe(soh?.column);
  });
});

describe("live audit: no car 3D model for non-car categories", () => {
  it.each([...TWO_WHEELERS, ...THREE_WHEELERS, ...COMMERCIAL, "hatchback", "suv", "muv", "hybrid_car"])(
    "%s never receives a car GLB", (id) => {
      const asset = modelAssetForCategory(id);
      expect(asset.status).toBe("unavailable");
      expect(asset.url).toBeNull();
      expect(asset.assetId).toBeNull();
      expect(asset.interactionsAvailable).toBe(false);
      expect(asset.note).toMatch(/No licensed|no car model|no licensed 3D asset|not substituted/i);
    }
  );

  it.each(["passenger_car", "electric_car"])("%s keeps the licensed car GLB and labels it as generic reference", (id) => {
    const asset = modelAssetForCategory(id);
    expect(asset.status).toBe("available");
    expect(asset.assetId).toBe("trustdrive-sedan");
    expect(asset.url).toMatch(/\.glb$/);
    expect(asset.interactionsAvailable).toBe(true);
  });
});

describe("live audit: conditional LangGraph node sets", () => {
  it.each(IDS)("%s runs 16 nodes when it has a battery pack, else 15", (id) => {
    const nodes = agentNodesForCategory(id);
    const expected = hasBatteryPack(id) ? 16 : 15;
    expect(nodes.length, id).toBe(expected);
    expect(nodes.includes("EVBatteryAnalysisNode"), id).toBe(hasBatteryPack(id));
  });
});

describe("live audit: RC document type is category correct", () => {
  it.each([...TWO_WHEELERS])("%s uses rc_2w", (id) => {
    expect(rcTypeFor(id)).toBe("rc_2w");
  });
  it.each([...THREE_WHEELERS])("%s uses rc_3w", (id) => {
    expect(rcTypeFor(id)).toBe("rc_3w");
  });
  it.each([...COMMERCIAL])("%s uses rc_commercial", (id) => {
    expect(rcTypeFor(id)).toBe("rc_commercial");
  });
  it.each([...FOUR_WHEELER_CARS])("%s uses rc", (id) => {
    expect(rcTypeFor(id)).toBe("rc");
  });
});

describe("live audit: strict document allowlist, no car-doc fallback", () => {
  it("allows rc_2w on a petrol scooter but rejects car rc", () => {
    expect(isAllowedDocument("petrol_scooter", "rc_2w")).toBe(true);
    expect(isAllowedDocument("petrol_scooter", "rc")).toBe(false);
  });
  it("allows rc_commercial on a truck but rejects rc_2w", () => {
    expect(isAllowedDocument("truck", "rc_commercial")).toBe(true);
    expect(isAllowedDocument("truck", "rc_2w")).toBe(false);
    expect(isAllowedDocument("truck", "rc")).toBe(false);
  });
  it("allows rc_3w on a cargo three-wheeler", () => {
    expect(isAllowedDocument("cargo_three_wheeler", "rc_3w")).toBe(true);
    expect(isAllowedDocument("cargo_three_wheeler", "goods_permit")).toBe(true);
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
