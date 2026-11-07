// ---------------------------------------------------------------------------
// Multi-category persistence layer (additive only).
//
// IMPORTANT: `migrate()` in db.ts DROPS AND RECREATES 27 core tables whenever
// PRAGMA user_version != SCHEMA_VERSION. The live database holds 69 vehicles
// plus the QA22-verified evidence history, so SCHEMA_VERSION is deliberately
// NOT bumped here. Every change below is an idempotent ALTER / CREATE IF NOT
// EXISTS and never rewrites an existing row's evidence.
//
// One database, one verification engine. Categories live in the shared JSON
// taxonomy (frontend/lib/vehicle-categories.json); this file only stores the
// per-vehicle category assignment, category-specific specifications and
// evidence-backed battery facts.
// ---------------------------------------------------------------------------
import type { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import {
  allCategories,
  categoryForVehicle,
  categoryMatrix,
  CATEGORY_SPEC_VERSION,
  documentsForCategory,
  TRUST_VERSION,
} from "@/lib/vehicle-categories";

/** Explicit column list: positional `INSERT INTO vehicles VALUES(...)` breaks
 *  the moment a column is added. Both the seed and createVehicle use this. */
export const VEHICLE_INSERT_COLUMNS = [
  "id", "owner_id", "make", "model", "variant", "year", "reg_no", "vin", "fuel",
  "transmission", "category", "color", "ownership_count", "location", "km_claimed",
  "last_verified_km", "asking_price", "status", "base_value", "condition_score",
  "trustdrive_id", "qr_token", "description", "condition", "created_at", "updated_at",
  "vehicle_category_id",
] as const;

export const VEHICLE_INSERT_SQL = `INSERT INTO vehicles (${VEHICLE_INSERT_COLUMNS.join(", ")}) VALUES (${VEHICLE_INSERT_COLUMNS.map(() => "?").join(",")})`;

export interface VehicleSpecsRow {
  vehicle_id: string;
  category_id: string;
  specs: string;
  spec_version: string;
  created_at: string;
  updated_at: string;
}

export interface BatteryRecordRow {
  id: string;
  vehicle_id: string;
  kind: string;
  soh_percent: number | null;
  capacity_kwh: number | null;
  serial: string | null;
  measured_at: string;
  source_document_id: string | null;
  status: string;
  notes: string;
  created_at: string;
}

/** Additive DDL + idempotent backfill of the authoritative category id. */
export function ensureMultiCategorySchema(conn: DatabaseSync): { addedColumns: string[]; backfilled: number } {
  const addedColumns: string[] = [];
  const cols = conn.prepare("PRAGMA table_info(vehicles)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "vehicle_category_id")) {
    conn.exec("ALTER TABLE vehicles ADD COLUMN vehicle_category_id TEXT");
    addedColumns.push("vehicles.vehicle_category_id");
  }

  conn.exec(`
  CREATE TABLE IF NOT EXISTS vehicle_specs(
    vehicle_id TEXT PRIMARY KEY REFERENCES vehicles(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL,
    specs TEXT NOT NULL DEFAULT '{}',
    spec_version TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL);

  CREATE TABLE IF NOT EXISTS battery_records(
    id TEXT PRIMARY KEY,
    vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    soh_percent REAL,
    capacity_kwh REAL,
    serial TEXT,
    measured_at TEXT NOT NULL,
    source_document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'verified',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL);

  CREATE TABLE IF NOT EXISTS category_registry_snapshot(
    id TEXT PRIMARY KEY,
    spec_version TEXT NOT NULL,
    trust_version TEXT NOT NULL,
    matrix TEXT NOT NULL,
    created_at TEXT NOT NULL);

  CREATE INDEX IF NOT EXISTS idx_vehicles_category ON vehicles(vehicle_category_id);
  CREATE INDEX IF NOT EXISTS idx_specs_category ON vehicle_specs(category_id);
  CREATE INDEX IF NOT EXISTS idx_battery_vehicle ON battery_records(vehicle_id, measured_at);
  `);

  // Legacy rows carry a free-text body style + fuel. Resolve them at write time
  // once so marketplace filtering, reports and the agent can all use one id.
  // The original `category`/`fuel` values are left untouched, so the existing
  // car UI and the QA22 evidence history keep working exactly as before.
  const rows = conn.prepare("SELECT id, category, fuel, vehicle_category_id FROM vehicles").all() as {
    id: string; category: string | null; fuel: string | null; vehicle_category_id: string | null;
  }[];
  const upd = conn.prepare("UPDATE vehicles SET vehicle_category_id = ? WHERE id = ?");
  let backfilled = 0;
  for (const r of rows) {
    if (r.vehicle_category_id) continue;
    upd.run(categoryForVehicle(r).id, r.id);
    backfilled += 1;
  }

  // A versioned snapshot makes the exact category rules that produced a
  // passport reproducible, without duplicating the taxonomy as a second source.
  const snapId = `cat-${CATEGORY_SPEC_VERSION}`;
  const exists = conn.prepare("SELECT id FROM category_registry_snapshot WHERE id = ?").get(snapId);
  if (!exists) {
    conn.prepare("INSERT INTO category_registry_snapshot VALUES (?,?,?,?,?)").run(
      snapId, CATEGORY_SPEC_VERSION, TRUST_VERSION, JSON.stringify(categoryMatrix()), new Date().toISOString()
    );
  }
  return { addedColumns, backfilled };
}

// ---------------------------------------------------------------------------
// Six representative demo vehicles.
//
// Every row is explicitly labelled as demo data. Findings are derived from
// records that are actually inserted below; nothing is invented. Missing
// documents produce "unverified coverage", never a clean-history claim and
// never a fabricated accident/insurance record.
// ---------------------------------------------------------------------------
interface DemoDoc { type: string; name: string; status?: string; reason?: string | null }
interface DemoReading { date: string; km: number; source: string; flagged?: boolean; verified?: boolean; isClaim?: boolean }
interface DemoFinding { rule: string; code: string; severity: string; title: string; explanation: string; recommendation: string; points: number }
interface DemoDamage { component: string; zone: string; description: string; severity: string; status: string; source: string }
interface DemoBattery { kind: string; soh: number | null; capacity: number | null; serial: string | null; date: string; doc: string; notes: string }
interface DemoHistory { title: string; date: string; km: number; source: string; status: string }

interface DemoVehicle {
  id: string;
  ownerId: string;
  make: string;
  model: string;
  variant: string;
  year: number;
  regNo: string;
  identifier: string;
  fuel: string;
  transmission: string;
  legacyCategory: string;
  color: string;
  owners: number;
  location: string;
  km: number;
  lastVerifiedKm: number;
  price: number;
  conditionScore: number;
  tdid: string;
  description: string;
  condition: string;
  categoryId: string;
  specs: Record<string, unknown>;
  docs: DemoDoc[];
  readings: DemoReading[];
  findings: DemoFinding[];
  damages: DemoDamage[];
  battery?: DemoBattery[];
  history: DemoHistory[];
}

const DEMO: DemoVehicle[] = [
  {
    id: "v-demo-bike", ownerId: "u-seller", make: "Honda", model: "H'ness CB350", variant: "DLX Pro",
    year: 2021, regNo: "MH12CD4521", identifier: "ME4JC259E8T000123", fuel: "Petrol", transmission: "Manual",
    legacyCategory: "Motorcycle", color: "Pearl Night Star Black", owners: 2, location: "Pune", km: 23800,
    lastVerifiedKm: 21400, price: 198000, conditionScore: 0.78, tdid: "TD-2WMC001",
    description: "DEMO motorcycle. Petrol commuter with service invoices; one distance reading conflicts with an earlier invoice and is flagged for review.",
    condition: "Good", categoryId: "petrol_motorcycle",
    specs: { bike_type: "Cruiser", engine_cc: 348.36, engine_number: "JC25E9001234", transmission: "Manual", front_tyre: "Good", rear_tyre: "Worn", brake_condition: "Good" },
    docs: [
      { type: "rc_2w", name: "CB350_RC.pdf" },
      { type: "insurance_2w", name: "CB350_insurance_2024.pdf" },
      { type: "puc", name: "CB350_PUC_2024.pdf" },
      { type: "service_2w", name: "Honda_service_18000km.pdf" },
      { type: "service_2w", name: "Honda_service_21400km.pdf" },
      { type: "engine_chassis", name: "CB350_engine_chassis.pdf" },
      { type: "ownership", name: "CB350_form29_form30.pdf", status: "pending", reason: "Transfer document received; awaiting manual verification" },
    ],
    readings: [
      { date: "2022-03-14", km: 9200, source: "Authorised service invoice" },
      { date: "2023-06-02", km: 18000, source: "Authorised service invoice" },
      { date: "2024-02-19", km: 21400, source: "Authorised service invoice" },
      { date: "2025-01-11", km: 19750, source: "Seller-submitted dashboard photo", flagged: true, verified: false },
      { date: "2025-08-04", km: 23800, source: "Seller-submitted dashboard photo", isClaim: true, verified: false },
    ],
    findings: [
      { rule: "mileage.rollback", code: "ODOMETER_ROLLBACK", severity: "high", title: "Distance reading went backwards", explanation: "A 21,400 km invoice (2024-02-19) is followed by a 19,750 km dashboard reading (2025-01-11). The later reading is below the earlier verified value, which can indicate a rollback, a replaced instrument cluster or a data-entry error. This is a warning, not proof of fraud.", recommendation: "Request an authorised odometer/cluster replacement record and a fresh inspection reading before purchase.", points: 18 },
      { rule: "mileage.unverified_claim", code: "SELLER_CLAIM_UNVERIFIED", severity: "low", title: "Current distance is a seller claim", explanation: "23,800 km was submitted by the seller and is not corroborated by a service or inspection document.", recommendation: "Verify the current reading at inspection.", points: 4 },
    ],
    damages: [
      { component: "front_fairing", zone: "front", description: "Scuff on the right side of the headlamp cowl, seller-reported.", severity: "Minor", status: "seller_reported", source: "seller_submitted" },
      { component: "rear_tyre", zone: "rear", description: "Rear tyre tread near wear indicators, noted in the 2024 service invoice.", severity: "Minor", status: "verified", source: "service_invoice" },
    ],
    history: [
      { title: "First registration", date: "2021-07-02", km: 0, source: "Two-wheeler RC", status: "verified" },
      { title: "Authorised service — 9,200 km", date: "2022-03-14", km: 9200, source: "Service invoice", status: "verified" },
      { title: "Authorised service — 18,000 km", date: "2023-06-02", km: 18000, source: "Service invoice", status: "verified" },
      { title: "Ownership transfer", date: "2024-11-20", km: 21400, source: "Form 29/30", status: "pending" },
    ],
  },
  {
    id: "v-demo-scooter", ownerId: "u-seller", make: "Honda", model: "Activa 6G", variant: "DLX",
    year: 2020, regNo: "MH03GH7788", identifier: "ME4JF401H9T012345", fuel: "Petrol", transmission: "CVT",
    legacyCategory: "Scooter", color: "Rebel Red Metallic", owners: 1, location: "Mumbai", km: 16400,
    lastVerifiedKm: 16400, price: 82000, conditionScore: 0.86, tdid: "TD-2WSC002",
    description: "DEMO petrol scooter. RC, insurance, PUC and two service invoices are verified. No accident or inspection report has been supplied — coverage is incomplete, not a clean-history claim.",
    condition: "Good", categoryId: "petrol_scooter",
    specs: { bike_type: "Scooter", engine_cc: 109.51, engine_number: "JF40E1012345", transmission: "CVT", front_tyre: "Good", rear_tyre: "Good", brake_condition: "Good" },
    docs: [
      { type: "rc_2w", name: "Activa_RC.pdf" },
      { type: "insurance_2w", name: "Activa_insurance.pdf" },
      { type: "puc", name: "Activa_PUC.pdf" },
      { type: "service_2w", name: "Activa_service_8000km.pdf" },
      { type: "service_2w", name: "Activa_service_16400km.pdf" },
      { type: "engine_chassis", name: "Activa_engine_chassis.pdf" },
    ],
    readings: [
      { date: "2021-09-10", km: 8100, source: "Authorised service invoice" },
      { date: "2023-04-22", km: 16400, source: "Authorised service invoice" },
    ],
    findings: [
      { rule: "coverage.missing_inspection", code: "INSPECTION_NOT_PROVIDED", severity: "info", title: "No independent inspection report", explanation: "No inspection report or accident record is on file. Missing evidence is recorded as unverified coverage; it is not evidence that the scooter has never been damaged.", recommendation: "Commission an independent inspection before purchase.", points: 0 },
    ],
    damages: [],
    history: [
      { title: "First registration", date: "2020-08-18", km: 0, source: "Two-wheeler RC", status: "verified" },
      { title: "Service — 8,100 km", date: "2021-09-10", km: 8100, source: "Service invoice", status: "verified" },
      { title: "Service — 16,400 km", date: "2023-04-22", km: 16400, source: "Service invoice", status: "verified" },
    ],
  },
  {
    id: "v-demo-escooter", ownerId: "u-seller2", make: "Ola Electric", model: "S1 Pro", variant: "Gen 2",
    year: 2022, regNo: "MH04EV2201", identifier: "MD2DSB123K1A00421", fuel: "Electric", transmission: "Direct drive",
    legacyCategory: "Electric Scooter", color: "Porcelain White", owners: 1, location: "Bengaluru", km: 11200,
    lastVerifiedKm: 11200, price: 118000, conditionScore: 0.83, tdid: "TD-2WEV003",
    description: "DEMO electric scooter. Battery State of Health comes only from a battery health report; it is never treated as an odometer reading. No engine number, engine CC or PUC applies to this vehicle.",
    condition: "Good", categoryId: "electric_scooter",
    specs: { motor_type: "Hub motor", motor_number: "OLA-HUB-22-04421", battery_chemistry: "Lithium-ion", battery_capacity_kwh: 4, battery_serial: "OLA-BP-2201-88213", battery_soh: 87, charging_system: "Standard AC", charging_port_condition: "Good", battery_warranty: "Active", battery_replacement_history: "None declared", range_source: "Battery health report" },
    docs: [
      { type: "rc_2w", name: "S1Pro_RC.pdf" },
      { type: "insurance_2w", name: "S1Pro_insurance.pdf" },
      { type: "battery_warranty", name: "Ola_battery_warranty.pdf" },
      { type: "battery_health", name: "Ola_battery_health_2025.pdf" },
      { type: "motor_controller_repair", name: "Ola_controller_replacement.pdf" },
      { type: "service_2w", name: "Ola_service_11200km.pdf" },
      { type: "charging_service", name: "Ola_charging_port_check.pdf" },
      { type: "battery_replacement", name: "battery_replacement_invoice.pdf", status: "unavailable", reason: "No battery replacement invoice supplied — replacement history unverified" },
    ],
    readings: [
      { date: "2023-05-12", km: 4600, source: "Authorised service record" },
      { date: "2024-06-30", km: 8900, source: "Authorised service record" },
      { date: "2025-03-15", km: 11200, source: "Battery service record" },
    ],
    findings: [
      { rule: "battery.controller_repair", code: "MOTOR_CONTROLLER_REPAIRED", severity: "low", title: "Controller replacement on record", explanation: "An authorised service invoice records a controller replacement in 2024. This is a documented repair, not a fault prediction.", recommendation: "Ask for the post-repair road-test record.", points: 3 },
      { rule: "coverage.missing_replacement_invoice", code: "BATTERY_REPLACEMENT_UNVERIFIED", severity: "info", title: "Battery replacement history unverified", explanation: "No battery replacement invoice was supplied, so replacement history cannot be confirmed either way.", recommendation: "Request the battery pack invoice if replacement history matters to you.", points: 0 },
    ],
    damages: [
      { component: "side_panel_right", zone: "right", description: "Hairline scratch on the right side panel, seller-reported in the listing photographs.", severity: "Minor", status: "seller_reported", source: "seller_submitted" },
    ],
    battery: [
      { kind: "battery_health", soh: 87, capacity: 4, serial: "OLA-BP-2201-88213", date: "2025-03-15", doc: "Ola_battery_health_2025.pdf", notes: "Measured State of Health from the supplied battery health report. Not an odometer reading." },
      { kind: "battery_warranty", soh: null, capacity: 4, serial: "OLA-BP-2201-88213", date: "2022-09-01", doc: "Ola_battery_warranty.pdf", notes: "Warranty document states 8 years / 80,000 km pack coverage. Coverage terms are not independently confirmed." },
    ],
    history: [
      { title: "First registration", date: "2022-09-01", km: 0, source: "Two-wheeler RC", status: "verified" },
      { title: "Service — 4,600 km", date: "2023-05-12", km: 4600, source: "Authorised service record", status: "verified" },
      { title: "Controller replacement", date: "2024-06-30", km: 8900, source: "Motor/controller repair record", status: "verified" },
      { title: "Battery health report", date: "2025-03-15", km: 11200, source: "Battery health report", status: "verified" },
    ],
  },
  {
    id: "v-demo-ebike", ownerId: "u-seller2", make: "Revolt Motors", model: "RV400", variant: "BRZ",
    year: 2021, regNo: "MH05EV8812", identifier: "MD2DSA001K2B00987", fuel: "Electric", transmission: "Direct drive",
    legacyCategory: "Electric Motorcycle", color: "Cosmic Black", owners: 2, location: "Pune", km: 18600,
    lastVerifiedKm: 15200, price: 132000, conditionScore: 0.71, tdid: "TD-2WEV004",
    description: "DEMO electric motorcycle. A battery replacement invoice and two inconsistent distance records are on file. Battery State of Health is reported only where a health report exists.",
    condition: "Fair", categoryId: "electric_motorcycle",
    specs: { motor_type: "Mid-drive", motor_number: "RV400-MD-21-00987", battery_chemistry: "Lithium-ion", battery_capacity_kwh: 3.24, battery_serial: "RV-BP-2109-77120", charging_system: "Removable battery", charging_port_condition: "Good", battery_warranty: "Unknown", battery_replacement_history: "Replaced once", range_source: "Battery health report" },
    docs: [
      { type: "rc_2w", name: "RV400_RC.pdf" },
      { type: "insurance_2w", name: "RV400_insurance.pdf" },
      { type: "battery_replacement", name: "RV400_battery_replacement.pdf" },
      { type: "battery_health", name: "RV400_battery_health_2025.pdf" },
      { type: "service_2w", name: "RV400_service_income_12800km.pdf" },
      { type: "motor_controller_repair", name: "RV400_motor_service.pdf" },
      { type: "battery_warranty", name: "battery_warranty.pdf", status: "unavailable", reason: "No warranty document supplied" },
    ],
    readings: [
      { date: "2022-08-05", km: 6100, source: "Authorised service record" },
      { date: "2023-11-18", km: 12800, source: "Authorised service record" },
      { date: "2024-09-27", km: 15200, source: "Authorised service record" },
      { date: "2025-05-06", km: 14100, source: "Dashboard photograph", flagged: true, verified: false },
    ],
    findings: [
      { rule: "mileage.conflict", code: "DISTANCE_CONFLICT", severity: "medium", title: "Conflicting distance records", explanation: "A 15,200 km service record (2024-09-27) is followed by a 14,100 km dashboard photograph (2025-05-06). The dashboard reading is unverified and conflicts with the earlier service record.", recommendation: "Obtain an authorised reading and check for an instrument cluster or battery-management-system replacement.", points: 10 },
      { rule: "battery.replacement", code: "BATTERY_REPLACED", severity: "info", title: "Battery pack replaced once", explanation: "A battery replacement invoice is on file. This is a documented event, not a defect finding, but pack age differs from vehicle age.", recommendation: "Confirm the new pack's warranty and serial number match the invoice.", points: 0 },
    ],
    damages: [
      { component: "front_fairing", zone: "front", description: "Cracked lower fairing, inspector-verified at the 2025 check.", severity: "Moderate", status: "verified", source: "inspection_report" },
    ],
    battery: [
      { kind: "battery_health", soh: 91, capacity: 3.24, serial: "RV-BP-2409-11802", date: "2025-05-06", doc: "RV400_battery_health_2025.pdf", notes: "Post-replacement pack health from the supplied report." },
      { kind: "battery_replacement", soh: null, capacity: 3.24, serial: "RV-BP-2409-11802", date: "2024-09-20", doc: "RV400_battery_replacement.pdf", notes: "Replacement invoice with new pack serial. Original pack serial RV-BP-2109-77120.", },
    ],
    history: [
      { title: "First registration", date: "2021-10-04", km: 0, source: "Two-wheeler RC", status: "verified" },
      { title: "Service — 12,800 km", date: "2023-11-18", km: 12800, source: "Authorised service record", status: "verified" },
      { title: "Battery pack replacement", date: "2024-09-20", km: 15200, source: "Battery replacement invoice", status: "verified" },
      { title: "Inspection — 15,200 km", date: "2025-05-06", km: 15200, source: "Inspection report", status: "verified" },
    ],
  },
  {
    id: "v-demo-car", ownerId: "u-seller", make: "Hyundai", model: "i20", variant: "Asta (O)",
    year: 2020, regNo: "MH06PQ3344", identifier: "MA3FJE61S00123456", fuel: "Petrol", transmission: "Manual",
    legacyCategory: "Hatchback", color: "Fiery Red", owners: 1, location: "Mumbai", km: 38500,
    lastVerifiedKm: 38500, price: 745000, conditionScore: 0.88, tdid: "TD-4WPC005",
    description: "DEMO petrol car. Retains the original car workflow and the real sedan GLB reference asset. RC, insurance, PUC, service and an inspection report are verified.",
    condition: "Very good", categoryId: "passenger_car",
    specs: { engine_cc: 1197, engine_number: "G4LF20123456", transmission: "Manual", interior_condition: "Good", exterior_condition: "Good" },
    docs: [
      { type: "rc", name: "i20_RC.pdf" },
      { type: "insurance", name: "i20_insurance.pdf" },
      { type: "puc", name: "i20_PUC.pdf" },
      { type: "service", name: "i20_service_24000km.pdf" },
      { type: "service", name: "i20_service_38500km.pdf" },
      { type: "inspection", name: "i20_inspection_2025.pdf" },
      { type: "ownership", name: "i20_ownership.pdf" },
    ],
    readings: [
      { date: "2022-02-11", km: 24000, source: "Authorised service invoice" },
      { date: "2024-07-08", km: 38500, source: "Authorised service invoice" },
    ],
    findings: [],
    damages: [
      { component: "front_bumper", zone: "front", description: "Light scuff on the front bumper, inspector-verified.", severity: "Minor", status: "verified", source: "inspection_report" },
    ],
    history: [
      { title: "First registration", date: "2020-11-14", km: 0, source: "Registration Certificate", status: "verified" },
      { title: "Service — 24,000 km", date: "2022-02-11", km: 24000, source: "Service invoice", status: "verified" },
      { title: "Service — 38,500 km", date: "2024-07-08", km: 38500, source: "Service invoice", status: "verified" },
    ],
  },
  {
    id: "v-demo-evcar", ownerId: "u-seller2", make: "Tata", model: "Nexon EV Max", variant: "XZ+ Lux",
    year: 2022, regNo: "MH07EV9900", identifier: "MAT625289NPE54321", fuel: "Electric", transmission: "Automatic",
    legacyCategory: "Electric Car", color: "Daytona Grey", owners: 1, location: "Hyderabad", km: 27900,
    lastVerifiedKm: 27900, price: 1490000, conditionScore: 0.85, tdid: "TD-4WEV006",
    description: "DEMO electric car. VIN is still 17 characters; there is no engine number and no PUC requirement. Battery SOH comes from a battery health report and is never used as a distance reading.",
    condition: "Very good", categoryId: "electric_car",
    specs: { motor_type: "Hub motor", motor_number: "TZ180XS-2201-6634", battery_chemistry: "LFP", battery_capacity_kwh: 40.5, battery_serial: "TATA-BP-2206-44120", battery_soh: 94, charging_system: "Both", charging_port_condition: "Good", battery_warranty: "Active", battery_replacement_history: "None declared", range_source: "Battery health report", interior_condition: "Good", exterior_condition: "Good" },
    docs: [
      { type: "rc", name: "NexonEV_RC.pdf" },
      { type: "insurance", name: "NexonEV_insurance.pdf" },
      { type: "battery_warranty", name: "NexonEV_battery_warranty.pdf" },
      { type: "battery_health", name: "NexonEV_battery_health_2025.pdf" },
      { type: "service", name: "NexonEV_service_18000km.pdf" },
      { type: "service", name: "NexonEV_service_27900km.pdf" },
      { type: "inspection", name: "NexonEV_inspection_2025.pdf" },
      { type: "ownership", name: "NexonEV_ownership.pdf" },
    ],
    readings: [
      { date: "2023-08-19", km: 18000, source: "Authorised service record" },
      { date: "2025-01-24", km: 27900, source: "Battery service record" },
    ],
    findings: [
      { rule: "ev.model_asset", code: "GENERIC_3D_REFERENCE", severity: "info", title: "3D model is a generic sedan reference", explanation: "The available GLB is a generic four-wheeler body asset, not an exact Nexon EV Max model. It is labelled as a reference and component hotspots use the car component registry.", recommendation: "Do not use 3D geometry for panel-gap or dimensional assessment.", points: 0 },
    ],
    damages: [],
    battery: [
      { kind: "battery_health", soh: 94, capacity: 40.5, serial: "TATA-BP-2206-44120", date: "2025-01-24", doc: "NexonEV_battery_health_2025.pdf", notes: "Measured pack State of Health from the supplied report. Not an odometer reading." },
      { kind: "battery_warranty", soh: null, capacity: 40.5, serial: "TATA-BP-2206-44120", date: "2022-06-11", doc: "NexonEV_battery_warranty.pdf", notes: "Warranty document states 8 years / 160,000 km pack coverage." },
    ],
    history: [
      { title: "First registration", date: "2022-06-11", km: 0, source: "Registration Certificate", status: "verified" },
      { title: "Service — 18,000 km", date: "2023-08-19", km: 18000, source: "Authorised service record", status: "verified" },
      { title: "Battery health report", date: "2025-01-24", km: 27900, source: "Battery health report", status: "verified" },
    ],
  },
];

function sha(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Insert the six demo vehicles and their evidence, once. Guarded by primary key
 * so every restart is a no-op. Never updates or deletes existing rows.
 */
export function seedMultiCategoryDemo(conn: DatabaseSync): { seeded: number; skipped: number } {
  const marker = conn.prepare("SELECT id FROM vehicles WHERE id = ?").get(DEMO[0].id);
  if (marker) {
    // Still guarantee no demo row is left without specs/battery evidence after
    // an interrupted earlier seed, but never overwrite existing evidence.
    repairPartialSeed(conn);
    return { seeded: 0, skipped: DEMO.length };
  }

  const now = new Date().toISOString();
  const iv = conn.prepare(VEHICLE_INSERT_SQL);
  const ispec = conn.prepare("INSERT OR IGNORE INTO vehicle_specs VALUES (?,?,?,?,?,?)");
  const idoc = conn.prepare(`INSERT OR IGNORE INTO documents
    (id, vehicle_id, type, file_name, mime, size_bytes, status, status_reason, sha256, consent, version, supersedes_id, extracted, verified_at, uploaded_at, file_key, deleted_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const iml = conn.prepare("INSERT OR IGNORE INTO mileage_readings VALUES (?,?,?,?,?,?,?,?,?,?)");
  const ifn = conn.prepare("INSERT OR IGNORE INTO findings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const idm = conn.prepare(`INSERT OR IGNORE INTO damage_records
    (id, vehicle_id, zone_id, component_id, damage_type, description, severity, repair_status, repair_details, inspection_date, status, photo_keys, repair_invoice_doc_id, supersedes_id, created_by, created_at, position_source)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const ih = conn.prepare("INSERT OR IGNORE INTO history_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const il = conn.prepare("INSERT OR IGNORE INTO listings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const ip = conn.prepare("INSERT OR IGNORE INTO pricing VALUES (?,?,?,?,?,?,?,?)");
  const irun = conn.prepare("INSERT OR IGNORE INTO verification_runs VALUES (?,?,?,?,?,?)");
  const ires = conn.prepare("INSERT OR IGNORE INTO verification_results VALUES (?,?,?,?,?,?,?)");
  const its = conn.prepare("INSERT OR IGNORE INTO trust_scores VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const ibat = conn.prepare("INSERT OR IGNORE INTO battery_records VALUES (?,?,?,?,?,?,?,?,?,?,?)");
  const ichain = conn.prepare("INSERT OR IGNORE INTO chain_records VALUES (?,?,?,?,?,?,?,?)");
  const inode = conn.prepare("INSERT OR IGNORE INTO evidence_nodes VALUES (?,?,?,?,?,?,?,?,?,?)");
  const iedge = conn.prepare("INSERT OR IGNORE INTO evidence_edges VALUES (?,?,?,?,?,?)");

  let seeded = 0;
  for (const d of DEMO) {
    if (conn.prepare("SELECT id FROM vehicles WHERE id = ?").get(d.id)) continue;
    const created = isoFromYearsAgo(d.year);
    iv.run(
      d.id, d.ownerId, d.make, d.model, d.variant, d.year, d.regNo, d.identifier, d.fuel,
      d.transmission, d.legacyCategory, d.color, d.owners, d.location, d.km, d.lastVerifiedKm,
      d.price, "published", Math.round(d.price * 1.18), d.conditionScore, d.tdid, `qr-${d.id}`,
      d.description, d.condition, created, now, d.categoryId
    );
    ispec.run(d.id, d.categoryId, JSON.stringify(d.specs), CATEGORY_SPEC_VERSION, now, now);

    // Documents: verified ones carry a real hash + a provenance payload. A
    // "verified" status here means the demo evidence record exists; OCR
    // extraction is still recorded as extraction, never as proof of genuineness.
    const docIds = new Map<string, string>();
    d.docs.forEach((doc, i) => {
      const docId = `doc-${d.id}-${i}`;
      docIds.set(doc.name, docId);
      const status = doc.status ?? "verified";
      const extracted = JSON.stringify({
        demo: true,
        extractedFields: {},
        method: "seeded-evidence-record",
        disclaimer: "A stored document record is not proof that the underlying document is genuine. OCR extraction, when run, is evidence of text presence only.",
        provenance: { source: "TrustDrive multi-category demo seed", sha256: sha(`${d.id}:${doc.name}`), capturedAt: now },
      });
      idoc.run(
        docId, d.id, doc.type, doc.name, "application/pdf", 48000 + i * 137, status,
        doc.reason ?? null, sha(`${d.id}:${doc.name}`), 1, 1, null, extracted,
        status === "verified" ? now : null, now, null, null
      );
    });

    d.readings.forEach((r, i) => {
      iml.run(
        `ml-${d.id}-${i}`, d.id, r.date.slice(0, 4), r.km, r.source, r.date,
        r.flagged ? 1 : 0, r.verified === false ? 0 : 1, r.isClaim ? 1 : 0, null
      );
    });

    d.findings.forEach((f, i) => {
      ifn.run(
        `f-${d.id}-${i}`, d.id, f.rule, f.code, f.severity, f.title, f.explanation,
        f.recommendation, JSON.stringify({ demo: true, rule: f.rule, evidenceIds: [...docIds.values()] }),
        null, f.points, "open", now
      );
    });

    d.damages.forEach((dm, i) => {
      idm.run(
        `dm-${d.id}-${i}`, d.id, dm.zone, dm.component, "visible_damage", dm.description,
        dm.severity, dm.status === "verified" ? "inspected" : "unknown", null,
        d.history.length ? d.history[d.history.length - 1].date : now, dm.status, "[]", null,
        null, d.ownerId, now, dm.source
      );
    });

    d.history.forEach((h, i) => {
      ih.run(`h-${d.id}-${i}`, d.id, "service", h.date, h.km, h.title, h.title,
        h.source, null, h.status, null, d.ownerId, now);
    });

    for (const b of d.battery ?? []) {
      ibat.run(
        `bat-${d.id}-${b.kind}`, d.id, b.kind, b.soh, b.capacity, b.serial, b.date,
        docIds.get(b.doc) ?? null, "verified", b.notes, now
      );
    }

    il.run(
      `l-${d.id}`, d.id, "published", `${d.year} ${d.make} ${d.model} ${d.variant}`.trim(),
      d.description, d.condition, d.location, 0, 0, 0, null, now, created, now
    );
    ip.run(d.id, Math.round(d.price * 0.9), d.price, Math.round(d.price * 1.1), "Medium", 3, "comparable-listings-demo", now);

    const runId = `run-${d.id}`;
    irun.run(runId, d.id, "completed", now, now, JSON.stringify({
      demo: true, specVersion: CATEGORY_SPEC_VERSION, trustVersion: TRUST_VERSION,
      categoryId: d.categoryId, note: "Demo verification run. Checks below cite the evidence rows inserted with this vehicle.",
    }));
    const checks: [string, string, string][] = [
      ["identity_consistency", "pass", "Registration and primary identifier present and category-valid."],
      ["document_coverage", d.docs.some((x) => (x.status ?? "verified") !== "verified") ? "partial" : "pass", "Category-specific required document set checked; missing items are unverified coverage."],
      ["distance_consistency", d.findings.some((f) => f.code.includes("ODOMETER") || f.code.includes("DISTANCE")) ? "attention" : "pass", "Category mileage rules applied to stored readings."],
      ["battery_evidence", d.battery?.length ? "pass" : "not_applicable", "Evaluated only for electric profiles."],
      ["damage_inspection", d.damages.length ? "pass" : "unverified", "Component IDs come from the category component set; no structural claim is made from photographs."],
    ];
    checks.forEach(([key, status, detail], i) => {
      ires.run(`vr-${d.id}-${i}`, runId, d.id, key, status, JSON.stringify({ detail, demo: true }), JSON.stringify([...docIds.values()]));
    });

    // Versioned, category-aware trust snapshot. Score is a demo snapshot; the
    // live score is recomputed by the deterministic engine from the rows above.
    const weights = categoryMatrix().find((c) => c.id === d.categoryId);
    its.run(
      `ts-${d.id}`, d.id, 72, "Good", TRUST_VERSION, "category-weighted-evidence",
      JSON.stringify(weights ?? {}), JSON.stringify({ demo: true, categoryId: d.categoryId }),
      JSON.stringify([]), JSON.stringify(d.findings.map((f) => f.title)),
      JSON.stringify(d.docs.filter((x) => (x.status ?? "verified") !== "verified").map((x) => x.type)),
      "missing_evidence_is_unverified_coverage", 70, now, null
    );

    // Hash chain + evidence graph: every claim in the passport has a node.
    const GENESIS = "0".repeat(64);
    let prev = GENESIS;
    const payloads: { type: string; id: string; label: string }[] = [
      ...d.history.map((h, i) => ({ type: "history", id: `h-${d.id}-${i}`, label: h.title })),
      ...d.docs.map((doc, i) => ({ type: "document", id: `doc-${d.id}-${i}`, label: doc.name })),
      ...d.damages.map((_, i) => ({ type: "damage", id: `dm-${d.id}-${i}`, label: "Damage record" })),
    ];
    payloads.forEach((p, i) => {
      const payload = { entityType: p.type, entityId: p.id, demo: true };
      const recordHash = sha(`${prev}:${JSON.stringify(payload)}`);
      ichain.run(d.id, i + 1, p.type, p.id, JSON.stringify(payload), prev, recordHash, now);
      inode.run(`en-${p.id}`, d.id, p.type, p.id, p.label, "TrustDrive multi-category demo seed", "medium", 1, JSON.stringify(payload), now);
      if (i > 0) iedge.run(`ee-${p.id}`, d.id, `en-${payloads[0].id}`, "same_vehicle", `en-${p.id}`, now);
      prev = recordHash;
    });
    seeded += 1;
  }
  return { seeded, skipped: DEMO.length - seeded };
}

/** Fill in any demo evidence rows missing after an interrupted first seed. */
function repairPartialSeed(conn: DatabaseSync) {
  const now = new Date().toISOString();
  const ispec = conn.prepare("INSERT OR IGNORE INTO vehicle_specs VALUES (?,?,?,?,?,?)");
  for (const d of DEMO) {
    ispec.run(d.id, d.categoryId, JSON.stringify(d.specs), CATEGORY_SPEC_VERSION, now, now);
  }
}

function isoFromYearsAgo(year: number): string {
  const d = new Date();
  d.setUTCFullYear(year, 5, 15);
  d.setUTCHours(10, 0, 0, 0);
  return d.toISOString();
}

/** Human-readable demo inventory for docs/tests. */
export function demoVehicleInventory() {
  return DEMO.map((d) => ({
    id: d.id,
    categoryId: d.categoryId,
    label: `${d.year} ${d.make} ${d.model}`,
    regNo: d.regNo,
    identifier: d.identifier,
    requiredDocuments: documentsForCategory(d.categoryId).filter((x) => x.required).map((x) => x.id),
    documents: d.docs.length,
    findings: d.findings.length,
    batteryRecords: d.battery?.length ?? 0,
  }));
}

export function registeredCategoryIds(): string[] {
  return allCategories().map((c) => c.id);
}
