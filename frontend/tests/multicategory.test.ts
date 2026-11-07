/**
 * Multi-category migration + taxonomy regression tests.
 *
 * Runs against the throwaway database prepared by `tests/setup-db.ts`, so the
 * live `.data/trustdrive.db` and the QA-verified vehicle evidence are never
 * touched. That setup file runs before this module is imported, which matters
 * because getDb() caches its connection on globalThis for the process lifetime.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DB = process.env.TD_DB_FILE ?? path.join(os.tmpdir(), `trustdrive-multicategory-${process.pid}-${Date.now()}.db`);
const OWNS_DB = !process.env.TD_DB_FILE;
let BASE_VEHICLE_COUNT = 0;
let BASE_DEMO_COUNT = 0;
const DEMO_IDS = ["v-demo-bike", "v-demo-scooter", "v-demo-escooter", "v-demo-ebike", "v-demo-car", "v-demo-evcar"];

let getDb: typeof import("../lib/server/db").getDb;
let getVehicle: typeof import("../lib/server/db").getVehicle;
let getVehicleSpecs: typeof import("../lib/server/db").getVehicleSpecs;
let getAllVehicles: typeof import("../lib/server/db").getAllVehicles;
let getDocuments: typeof import("../lib/server/db").getDocuments;
let getDamage: typeof import("../lib/server/db").getDamage;
let getMileage: typeof import("../lib/server/db").getMileage;
let ensureMultiCategorySchema: typeof import("../lib/server/multicategory").ensureMultiCategorySchema;
let seedMultiCategoryDemo: typeof import("../lib/server/multicategory").seedMultiCategoryDemo;
let vehicleCategories: typeof import("../lib/vehicle-categories");
let dataService: typeof import("../lib/server/data");
let categoryService: typeof import("../lib/server/category-service");
let engine: typeof import("../lib/server/engine");

beforeAll(async () => {
  // Import the DB module first: on a clean checkout setup-db points at a fresh
  // path that getDb() must create, migrate and seed before we can count rows.
  const db = await import("../lib/server/db");
  getDb = db.getDb;
  getVehicle = db.getVehicle;
  getVehicleSpecs = db.getVehicleSpecs;
  getAllVehicles = db.getAllVehicles;
  getDocuments = db.getDocuments;
  getDamage = db.getDamage;
  getMileage = db.getMileage;
  getDb(); // trigger migration/seed on the throwaway database
  const conn = getDb();
  BASE_VEHICLE_COUNT = (conn.prepare("SELECT COUNT(*) c FROM vehicles").get() as { c: number }).c;
  // getDb() seeds the six multi-category demos as part of its additive step, so
  // this count is normally 6; a live snapshot may already contain them too.
  BASE_DEMO_COUNT = (
    conn.prepare(
      `SELECT COUNT(*) c FROM vehicles WHERE id IN (${DEMO_IDS.map(() => "?").join(",")})`
    ).get(...DEMO_IDS) as { c: number }
  ).c;
  const mc = await import("../lib/server/multicategory");
  ensureMultiCategorySchema = mc.ensureMultiCategorySchema;
  seedMultiCategoryDemo = mc.seedMultiCategoryDemo;
  vehicleCategories = await import("../lib/vehicle-categories");
  dataService = await import("../lib/server/data");
  categoryService = await import("../lib/server/category-service");
  engine = await import("../lib/server/engine");
});

afterAll(() => {
  // setup-db owns the shared throwaway database; only remove a path this file
  // created itself when the setup file was not loaded.
  if (!OWNS_DB) return;
  for (const suffix of ["", "-wal", "-shm"]) {
    try { fs.unlinkSync(TEST_DB + suffix); } catch { /* already gone */ }
  }
});

describe("shared taxonomy (single source of truth)", () => {
  it("ships six implemented categories in the required priority order", () => {
    expect(vehicleCategories.implementedCategories().map((c) => c.id)).toEqual([
      "petrol_motorcycle", "petrol_scooter", "electric_scooter",
      "electric_motorcycle", "passenger_car", "electric_car",
    ]);
  });

  it("uses a car VIN only for four-wheelers", () => {
    const car = vehicleCategories.validateIdentity("passenger_car", { regNo: "MH12AB1234", primaryIdentifier: "WBA5R1C50KAK12345" });
    expect(car.ok).toBe(true);
    const tooShortForCar = vehicleCategories.validateIdentity("passenger_car", { regNo: "MH12AB1234", primaryIdentifier: "ME4JF401" });
    expect(tooShortForCar.errors.join(" ")).toContain("VIN must be 17 characters");
    const shortFrame = vehicleCategories.validateIdentity("petrol_scooter", { regNo: "MH12AB1234", primaryIdentifier: "ME4JF401" });
    expect(shortFrame.ok).toBe(true);
    const badFrame = vehicleCategories.validateIdentity("petrol_scooter", { regNo: "MH12AB1234", primaryIdentifier: "ABC" });
    expect(badFrame.ok).toBe(false);
    expect(badFrame.errors.join(" ")).toContain("17-character car VIN rule does not apply");
  });

  it("never asks an EV for engine number, engine CC or PUC", () => {
    for (const id of ["electric_scooter", "electric_motorcycle", "electric_car"]) {
      const names = vehicleCategories.fieldsForCategory(id).flatMap((g) => g.fields.map((f) => f.name));
      expect(names, id).not.toContain("engine_number");
      expect(names, id).not.toContain("engine_cc");
      expect(vehicleCategories.pucApplicable(id), id).toBe(false);
      const docs = vehicleCategories.documentsForCategory(id).map((d) => d.id);
      expect(docs, id).toContain("battery_health");
    }
    const ev = vehicleCategories.mileageRulesForCategory("electric_scooter");
    expect(ev.sohIsOdometer).toBe(false);
  });

  it("maps legacy rows with fuel without changing the original text", () => {
    expect(vehicleCategories.categoryForVehicle({ category: "Sedan", fuel: "Petrol" }).id).toBe("passenger_car");
    expect(vehicleCategories.categoryForVehicle({ category: "Sedan", fuel: "Electric" }).id).toBe("electric_car");
    expect(vehicleCategories.categoryForVehicle({ category: "Superbike", fuel: "Petrol" }).id).toBe("petrol_motorcycle");
    expect(vehicleCategories.categoryForVehicle({ category: "Scooter", fuel: "Electric" }).id).toBe("electric_scooter");
    expect(vehicleCategories.categoryForVehicle({ vehicle_category_id: "electric_scooter", category: "Sedan", fuel: "Petrol" }).id).toBe("electric_scooter");
  });

  it("never substitutes a car GLB for a two-wheeler", () => {
    expect(vehicleCategories.modelAssetForCategory("passenger_car").url).toContain("trustdrive-sedan.glb");
    for (const id of ["petrol_motorcycle", "petrol_scooter", "electric_scooter", "electric_motorcycle"]) {
      const asset = vehicleCategories.modelAssetForCategory(id);
      expect(asset.url, id).toBeNull();
      expect(asset.status, id).toBe("unavailable");
      expect(asset.interactionsAvailable, id).toBe(false);
    }
  });

  it("runs the EV battery node only for electric profiles", () => {
    expect(vehicleCategories.agentNodesForCategory("passenger_car")).not.toContain("EVBatteryAnalysisNode");
    expect(vehicleCategories.agentNodesForCategory("electric_scooter")).toContain("EVBatteryAnalysisNode");
  });
});

describe("additive DB migration", () => {
  it("adds vehicle_category_id without destroying the existing history", () => {
    const conn = getDb();
    const cols = (conn.prepare("PRAGMA table_info(vehicles)").all() as { name: string }[]).map((c) => c.name);
    expect(cols).toContain("vehicle_category_id");
    expect((conn.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(3);
    const bmw = getVehicle("v-bmw");
    expect(bmw?.reg_no).toBe("MH01AB1234");
    expect(bmw?.category).toBe("Sedan");
    expect(bmw?.vehicle_category_id).toBe("passenger_car");
    // Seeding is idempotent: +6 on a fresh copy, +0 when the live DB already
    // contains the demo inventory. It must never duplicate a vehicle.
    expect(getAllVehicles().length).toBe(BASE_VEHICLE_COUNT + (6 - BASE_DEMO_COUNT));
    expect(getAllVehicles().filter((v) => v.id.startsWith("v-demo-")).length).toBe(6);
    // A live snapshot carries the full QA inventory; a clean checkout/CI seed
    // starts smaller. Both must retain every pre-existing row.
    expect(BASE_VEHICLE_COUNT).toBeGreaterThanOrEqual(1);
  });

  it("creates the category-specific tables", () => {
    const names = (getDb().prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map((r) => r.name);
    for (const t of ["vehicle_specs", "battery_records", "category_registry_snapshot"]) expect(names).toContain(t);
  });

  it("adds real component_id columns to damage_records", () => {
    const cols = (getDb().prepare("PRAGMA table_info(damage_records)").all() as { name: string }[]).map((c) => c.name);
    for (const c of ["component_id", "damage_type", "position_source", "local_x", "local_y", "local_z"]) expect(cols).toContain(c);
  });

  it("is idempotent — running it twice changes nothing", () => {
    const conn = getDb();
    const before = (conn.prepare("SELECT COUNT(*) c FROM vehicles").get() as { c: number }).c;
    const r = ensureMultiCategorySchema(conn);
    expect(r.backfilled).toBe(0);
    expect(r.addedColumns).toEqual([]);
    expect(seedMultiCategoryDemo(conn).seeded).toBe(0);
    expect((conn.prepare("SELECT COUNT(*) c FROM vehicles").get() as { c: number }).c).toBe(before);
  });
});

describe("six representative demo vehicles", () => {
  const expected: [string, string][] = [
    ["v-demo-bike", "petrol_motorcycle"],
    ["v-demo-scooter", "petrol_scooter"],
    ["v-demo-escooter", "electric_scooter"],
    ["v-demo-ebike", "electric_motorcycle"],
    ["v-demo-car", "passenger_car"],
    ["v-demo-evcar", "electric_car"],
  ];

  it.each(expected)("%s carries the correct category id", (id, categoryId) => {
    expect(getVehicle(id)?.vehicle_category_id).toBe(categoryId);
  });

  it("stores category-specific specs and never an engine number for EVs", () => {
    const conn = getDb();
    const specs = (vid: string) => JSON.parse((conn.prepare("SELECT specs FROM vehicle_specs WHERE vehicle_id = ?").get(vid) as { specs: string }).specs);
    expect(specs("v-demo-bike").engine_number).toBeTruthy();
    expect(specs("v-demo-escooter").engine_number).toBeUndefined();
    expect(specs("v-demo-escooter").motor_number).toBeTruthy();
    expect(specs("v-demo-evcar").battery_soh).toBe(94);
  });

  it("uses two-wheeler document types and no PUC for electric vehicles", () => {
    const types = (vid: string) => getDocuments(vid).map((d) => d.type);
    expect(types("v-demo-bike")).toContain("rc_2w");
    expect(types("v-demo-scooter")).toContain("insurance_2w");
    expect(types("v-demo-car")).toContain("rc");
    for (const id of ["v-demo-escooter", "v-demo-ebike", "v-demo-evcar"]) {
      expect(types(id), id).not.toContain("puc");
      expect(types(id), id).toContain("battery_health");
    }
  });

  it("records battery SOH only from a report, never as a distance reading", () => {
    const conn = getDb();
    const rows = conn.prepare("SELECT * FROM battery_records WHERE vehicle_id = ?").all("v-demo-escooter") as { soh_percent: number | null; notes: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.soh_percent === 87)).toBe(true);
    expect(rows.every((r) => r.notes.toLowerCase().includes("not an odometer") || r.notes.toLowerCase().includes("warranty"))).toBe(true);
    const kms = getMileage("v-demo-escooter").map((m) => m.km);
    expect(kms).not.toContain(87);
  });

  it("links damage hotspots to real category component ids", () => {
    const bike = getDamage("v-demo-bike").map((d) => d.component_id);
    expect(bike).toContain("front_fairing");
    expect(vehicleCategories.componentIdsForCategory("petrol_motorcycle")).toContain("front_fairing");
    const scooter = getDamage("v-demo-escooter").map((d) => d.component_id);
    expect(scooter).toContain("side_panel_right");
    expect(vehicleCategories.componentIdsForCategory("electric_scooter")).toContain("side_panel_right");
  });

  it("flags rollback/conflict findings with evidence, not fabricated conclusions", () => {
    const conn = getDb();
    for (const id of ["v-demo-bike", "v-demo-ebike"]) {
      const findings = conn.prepare("SELECT code, explanation, evidence FROM findings WHERE vehicle_id = ?").all(id) as { code: string; explanation: string; evidence: string }[];
      expect(findings.length).toBeGreaterThan(0);
      expect(findings.some((f) => f.explanation.includes("not proof of fraud") || f.explanation.includes("unverified"))).toBe(true);
      expect(JSON.parse(findings[0].evidence).evidenceIds.length).toBeGreaterThan(0);
    }
  });

  it("gives every demo vehicle an evidence graph and a hash chain", () => {
    const conn = getDb();
    for (const [id] of expected) {
      const nodes = (conn.prepare("SELECT COUNT(*) c FROM evidence_nodes WHERE vehicle_id = ?").get(id) as { c: number }).c;
      const chain = (conn.prepare("SELECT COUNT(*) c FROM chain_records WHERE vehicle_id = ?").get(id) as { c: number }).c;
      expect(nodes, id).toBeGreaterThan(3);
      expect(chain, id).toBe(nodes);
    }
  });

  it("publishes all six so a buyer can actually find them", () => {
    const conn = getDb();
    for (const [id] of expected) {
      const l = conn.prepare("SELECT status FROM listings WHERE vehicle_id = ?").get(id) as { status: string } | undefined;
      expect(l?.status, id).toBe("published");
    }
  });
});

describe("category-aware verification engine", () => {
  it("keeps the measured car GLB registry and gives scooters their own component set", () => {
    const car = dataService.componentsForVehicle("v-demo-car");
    const scooter = dataService.componentsForVehicle("v-demo-escooter");
    expect(car.categoryId).toBe("passenger_car");
    expect(car.interactionsAvailable).toBe(true);
    expect(car.defs.map((d) => d.id)).toContain("bonnet");
    expect(scooter.categoryId).toBe("electric_scooter");
    expect(scooter.interactionsAvailable).toBe(false);
    expect(scooter.defs.map((d) => d.id)).toContain("battery_compartment");
    expect(scooter.defs.map((d) => d.id)).not.toContain("bonnet");
    expect(scooter.defs.every((d) => d.available === false && d.defaultHotspotAnchor === null)).toBe(true);
  });

  it("taxonomy car component ids exactly match the measured GLB registry", () => {
    expect(vehicleCategories.componentIdsForCategory("passenger_car")).toEqual(
      dataService.componentsForVehicle("v-demo-car").defs.map((d) => d.id)
    );
  });

  it("never exposes car hotspots or 3D positions on a two-wheeler", () => {
    const hs = dataService.hotspotsFor("v-demo-bike");
    expect(hs.length).toBeGreaterThan(0);
    expect(hs.map((h) => h.id)).toContain("front_fairing");
    expect(hs.map((h) => h.id)).not.toContain("front_left_door");
    expect(hs.every((h) => h.position === null && h.interactionsAvailable === false)).toBe(true);
  });

  it("weights document completeness by the category's own document set", () => {
    const docs = [
      { type: "rc_2w", status: "verified" },
      { type: "insurance_2w", status: "verified" },
    ];
    expect(engine.computeCompleteness(docs)).toBe(0); // legacy car weights
    expect(engine.computeCompleteness(docs, "petrol_scooter")).toBeGreaterThan(0);
    expect(engine.computeCompleteness([], "electric_scooter")).toBe(0);
  });

  it("applies lower daily-distance ceilings to scooters than to cars", () => {
    const readings = [
      { date: "2024-01-01", km: 10000 },
      { date: "2024-03-01", km: 32500 }, // +22,500 km / 60 days = 375 km/day
    ];
    const car = engine.analyzeMileage(readings);
    const scooter = engine.analyzeMileage(readings, "petrol_scooter");
    expect(car.rules.dailyMaxKm).toBe(400);
    expect(scooter.rules.dailyMaxKm).toBe(200);
    expect(car.findings.map((f) => f.code)).not.toContain("MILEAGE_JUMP");
    expect(scooter.findings.map((f) => f.code)).toContain("MILEAGE_JUMP");
  });

  it("flags conflicting same-date readings only for explicitly categorised vehicles", () => {
    const readings = [
      { date: "2024-01-01", km: 10000 },
      { date: "2024-01-01", km: 14000 },
    ];
    expect(engine.analyzeMileage(readings).findings.map((f) => f.code)).not.toContain("DUPLICATE_DISTANCE_READING");
    expect(engine.analyzeMileage(readings, "electric_scooter").findings.map((f) => f.code)).toContain("DUPLICATE_DISTANCE_READING");
  });

  it("exposes a category catalogue and honest capability profile", () => {
    const catalog = categoryService.categoryCatalog();
    expect(catalog.implemented).toHaveLength(6);
    expect(catalog.trustVersion).toBe("trust-v2-multicategory");
    const scooter = categoryService.categoryProfile("electric_scooter")!;
    expect(scooter.isElectric).toBe(true);
    expect(scooter.pucApplicable).toBe(false);
    expect(scooter.model3d.status).toBe("unavailable");
    expect(scooter.damageDetection.status).toBe("unavailable");
    expect(categoryService.categoryProfile("not-a-category")).toBeNull();
  });

  it("produces an evidence-backed passport with no invented EV or 3D claims", () => {
    const scooter = categoryService.vehiclePassport("v-demo-escooter")!;
    expect(scooter.category.id).toBe("electric_scooter");
    expect(scooter.battery.applicable).toBe(true);
    expect(scooter.battery.sohIsOdometer).toBe(false);
    expect(scooter.category.pucApplicable).toBe(false);
    expect(scooter.inspection3d.status).toBe("unavailable");
    expect(scooter.inspection3d.assetUrl).toBeNull();
    expect(scooter.damage.records.every((d) => d.componentValidForCategory)).toBe(true);
    expect(scooter.caveats.join(" ")).toContain("not a certificate of genuineness");
    expect(scooter.agent.includesEVBatteryNode).toBe(true);

    const car = categoryService.vehiclePassport("v-demo-car")!;
    expect(car.category.id).toBe("passenger_car");
    expect(car.battery.applicable).toBe(false);
    expect(car.category.pucApplicable).toBe(true);
    expect(car.inspection3d.status).toBe("available");
    expect(car.agent.includesEVBatteryNode).toBe(false);
    expect(categoryService.vehiclePassport("does-not-exist")).toBeNull();
  });
});

describe("damage writes after the additive column migration", () => {
  it("inserts a new damage row into the 20-column table with a real component id", () => {
    // Regression: createDamage() used a positional 14-value INSERT. After six
    // additive geometry columns it would throw "20 columns, 14 values".
    const result = dataService.addDamageForVehicle("u-seller2", "v-demo-escooter", {
      zoneId: "side_panel_left",
      description: "Regression: seller-reported scratch",
      severity: "Minor",
      repairStatus: "Not repaired",
    });
    expect(result.ok).toBe(true);
    const conn = getDb();
    const row = conn.prepare("SELECT component_id, damage_type, position_source FROM damage_records WHERE id = ?").get(
      (result as { id: string }).id
    ) as { component_id: string; damage_type: string; position_source: string };
    expect(row.component_id).toBe("side_panel_left");
    expect(row.damage_type).toBe("visible_damage");
    expect(row.position_source).toBe("seller_submitted");
  });

  it("rejects a car component id on a scooter", () => {
    const result = dataService.addDamageForVehicle("u-seller2", "v-demo-escooter", {
      zoneId: "front_left_door",
      description: "Should be rejected",
      severity: "Minor",
      repairStatus: "Not repaired",
    });
    expect(result.ok).toBe(false);
    expect((result as { code: string }).code).toBe("INVALID_COMPONENT");
  });

  it("still accepts a legacy car zone alias for a car", () => {
    const result = dataService.addDamageForVehicle("u-seller", "v-demo-car", {
      zoneId: "front-left-door",
      description: "Legacy alias preserved",
      severity: "Minor",
      repairStatus: "Repaired",
    });
    expect(result.ok).toBe(true);
    expect((result as { componentId: string }).componentId).toBe("front_left_door");
  });
});

describe("strict category resolution at API boundaries", () => {
  it("resolves ids, human labels and legacy body styles", () => {
    expect(vehicleCategories.matchCategoryId("electric_scooter")).toBe("electric_scooter");
    expect(vehicleCategories.matchCategoryId("Electric Scooter")).toBe("electric_scooter");
    expect(vehicleCategories.matchCategoryId("Sedan")).toBe("passenger_car");
    expect(vehicleCategories.matchCategoryId("Sedan", "Electric")).toBe("electric_car");
    expect(vehicleCategories.matchCategoryId("Sedan", "Petrol")).toBe("passenger_car");
  });

  it("never silently falls back to car rules for an unknown category", () => {
    expect(vehicleCategories.matchCategoryId("not-a-category")).toBeUndefined();
    expect(vehicleCategories.matchCategoryId("   ")).toBeUndefined();
    expect(vehicleCategories.matchCategoryId(null)).toBeUndefined();
    // The lenient resolver still exists for LEGACY database rows only.
    expect(vehicleCategories.resolveCategoryId("not-a-category")).toBe("passenger_car");
  });

  it("an explicit new category id is authoritative over legacy fuel text", () => {
    expect(vehicleCategories.matchCategoryId("electric_scooter", "Petrol")).toBe("electric_scooter");
    expect(vehicleCategories.matchCategoryId("passenger_car", "Electric")).toBe("passenger_car");
  });
});

describe("category-aware Seller registration (Task #9)", () => {
  // The IN registration pattern is ^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$.
  // Build identifiers that actually match it so the validation path is exercised.
  let regSeq = 0;
  const newReg = () => {
    regSeq += 1;
    const letters = ["AB", "CD", "EF", "GH", "JK", "LM", "NP", "QR"];
    return `RJ${String(regSeq).padStart(2, "0")}${letters[regSeq % letters.length]}${String(1000 + regSeq).padStart(4, "0")}`;
  };
  const newFrame = (prefix: string) => `${prefix.slice(0, 2)}${Date.now().toString().slice(-11)}${Math.floor(Math.random() * 90 + 10)}`;

  it("creates a two-wheeler draft with category-specific specs and no car VIN rule", () => {
    const reg = newReg();
    const frame = newFrame("SCOOT");
    const res = dataService.createVehicleDraft("u-seller", {
      make: "Honda",
      model: "Activa 6G",
      variant: "DLX",
      year: 2022,
      regNo: reg,
      vin: frame,
      fuel: "Petrol",
      transmission: "CVT",
      category: "Scooter",
      color: "Grey",
      location: "Pune",
      ownershipCount: 1,
      price: 72000,
      km: 18500,
      categoryId: "petrol_scooter",
      specs: { engine_cc: "110", bike_type: "Scooter", front_tyre: "Good", rear_tyre: "Worn" },
    });
    if (!res.ok) console.log("DEBUG scooter create:", JSON.stringify(res));
    expect(res.ok).toBe(true);
    const id = (res as { id: string }).id;
    const v = getVehicle(id);
    expect(v.vehicle_category_id).toBe("petrol_scooter");
    // A scooter frame number is NOT forced through the 17-char car VIN rule.
    expect(v.vin).toBe(frame);
    const specs = getVehicleSpecs(id);
    expect(specs.engine_cc).toBe("110");
    expect(specs.bike_type).toBe("Scooter");
    // No engine number must ever be invented for a two-wheeler.
    expect("engine_number" in specs).toBe(false);
  });

  it("patches a two-wheeler draft (incl. specs) without applying the car VIN rule", () => {
    const reg = newReg();
    const frame = newFrame("BIKE");
    const created = dataService.createVehicleDraft("u-seller", {
      make: "Bajaj",
      model: "Pulsar",
      year: 2021,
      regNo: reg,
      vin: frame,
      fuel: "Petrol",
      categoryId: "petrol_motorcycle",
      specs: { engine_cc: "150" },
    });
    expect(created.ok).toBe(true);
    const id = (created as { id: string }).id;
    const patch = dataService.updateVehicleForOwner("u-seller", id, {
      reg_no: reg,
      vin: frame,
      make: "Bajaj",
      model: "Pulsar",
      year: 2021,
      ownership_count: 2,
      asking_price: 95000,
      km_claimed: 22000,
      transmission: "Manual",
      fuel: "Petrol",
      category: "Motorcycle",
      description: "Well kept",
      condition: "Good",
      categoryId: "petrol_motorcycle",
      specs: { engine_cc: "150", bike_type: "Commuter", front_tyre: "Good" },
    });
    expect(patch.ok).toBe(true);
    const specs = getVehicleSpecs(id);
    expect(specs.bike_type).toBe("Commuter");
    // The frame number (not a 17-char VIN) must survive the category-aware patch.
    expect(getVehicle(id).vin).toBe(frame);
  });

  it("accepts category-specific document types and rejects invalid ones", () => {
    const reg = newReg();
    const frame = newFrame("ESCOOT");
    const created = dataService.createVehicleDraft("u-seller", {
      make: "Ola",
      model: "S1",
      year: 2023,
      regNo: reg,
      vin: frame,
      fuel: "Electric",
      categoryId: "electric_scooter",
      specs: { battery_capacity_kwh: "3" },
    });
    expect(created.ok).toBe(true);
    const id = (created as { id: string }).id;
    expect(dataService.addDocumentForVehicle("u-seller", id, { type: "rc_2w", fileName: "rc.pdf" }).ok).toBe(true);
    expect(dataService.addDocumentForVehicle("u-seller", id, { type: "battery_warranty", fileName: "bw.pdf" }).ok).toBe(true);
    const bad = dataService.addDocumentForVehicle("u-seller", id, { type: "not_a_real_doc", fileName: "x.pdf" });
    expect(bad.ok).toBe(false);
  });
});

describe("buyer marketplace category filtering (Task #10)", () => {
  it("returns only matching categories for an exact category id", () => {
    const res = dataService.getMarketplace({ category: "petrol_scooter" });
    expect(res.total).toBeGreaterThan(0);
    expect(res.items.every((i) => i.categoryId === "petrol_scooter")).toBe(true);
    expect(res.items.some((i) => i.id === "v-demo-scooter")).toBe(true);
    expect(res.items.some((i) => i.id === "v-demo-car")).toBe(false);
  });

  it("returns cars only for the passenger_car category", () => {
    const res = dataService.getMarketplace({ category: "passenger_car" });
    expect(res.items.every((i) => i.categoryId === "passenger_car")).toBe(true);
    expect(res.items.some((i) => i.id === "v-demo-car")).toBe(true);
    expect(res.items.some((i) => i.id === "v-demo-scooter")).toBe(false);
  });

  it("returns every two-wheeler when filtered by class", () => {
    // Request a full page: the live QA database can contain more than the
    // default 12 published two-wheelers, so the default page would truncate
    // the seed inventory before both demo scooters are reached.
    const res = dataService.getMarketplace({ category: "two_wheeler", pageSize: 48 });
    const ids = res.items.map((i) => i.id);
    expect(ids).toContain("v-demo-scooter");
    expect(ids).toContain("v-demo-escooter");
    expect(res.items.every((i) => i.categoryId !== "passenger_car" && i.categoryId !== "electric_car")).toBe(true);
  });

  it("surfaces categoryLabel on every marketplace card", () => {
    const res = dataService.getMarketplace({ pageSize: 48 });
    expect(res.items.length).toBeGreaterThan(0);
    expect(res.items.every((i) => typeof i.categoryLabel === "string" && i.categoryLabel.length > 0)).toBe(true);
  });
});
