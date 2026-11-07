/**
 * TrustDrive multi-category engine — the ONLY category rule source for Next.js.
 *
 * The canonical data lives in `./vehicle-categories.json` and is read by the
 * Python service too (`backend/app/categories.py`). Nothing in the UI, API or
 * verification engine should hardcode "car", "VIN 17 chars", "engine number" or
 * a damage component set again: ask this module instead.
 *
 * Design contract (AGENTS.md §2, newdesign §8):
 *  - one shared verification engine, category profiles only supply rules;
 *  - identifier validation is category-specific;
 *  - electric vehicles never require petrol-only fields;
 *  - unavailable 3D/CV capabilities are reported, never fabricated.
 */
import spec from "./vehicle-categories.json";

export type VehicleClass = "two_wheeler" | "three_wheeler" | "four_wheeler" | "commercial";
export type Powertrain = "petrol" | "diesel" | "cng" | "hybrid" | "electric";

export interface FieldDef {
  label: string;
  type: "text" | "number" | "select" | "textarea";
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  column: "reg_no" | "vin" | "make" | "model" | "variant" | "year" | "color" | "location" | "ownership_count" | "asking_price" | "transmission" | "km_claimed" | "specs";
}

export interface FieldGroup {
  id: string;
  label: string;
  fields: (FieldDef & { name: string })[];
}

export interface CategoryProfile {
  id: string;
  label: string;
  shortLabel: string;
  class: VehicleClass;
  type: string;
  powertrain: Powertrain;
  priority: number;
  status: "implemented" | "planned";
  legacyCategories: string[];
  identity: {
    primaryField: string;
    primaryLabel: string;
    primaryPattern: string;
    primaryExample: string;
    primaryNote: string;
    vinApplicable: boolean;
    engineNumberRequired: boolean;
    engineNumberLabel?: string;
    engineNumberPattern?: string;
    motorNumberLabel?: string;
    motorNumberPattern?: string;
  };
  fieldGroups?: { id: string; label: string; fields: string[] }[];
  documents?: string[];
  requiredDocuments?: string[];
  mileage?: {
    label: string;
    unit: string;
    annualPlausibleMin: number;
    annualPlausibleMax: number;
    dailyMaxKm: number;
    rollbackToleranceKm: number;
    sohIsOdometer: boolean;
    sohNote?: string;
    sources: string[];
  };
  damage?: { componentSet: string; detector: string };
  model3d?: { asset: string; interactionsAvailable: boolean; note?: string };
  trust?: { version: string; weights: Record<string, number> };
  agentNodes?: string[];
  labels?: { primaryIdentifier: string; odometer: string; propulsion: string; puc: string };
}

interface Spec {
  version: string;
  jurisdictions: Record<string, { label: string; registrationPattern: string; registrationExample: string; note: string }>;
  defaultJurisdiction: string;
  classes: { id: string; label: string; wheels: number | null }[];
  powertrains: { id: Powertrain; label: string; hasEngine: boolean; hasBatteryPack: boolean; pucApplicable: boolean }[];
  fieldCatalog: Record<string, FieldDef>;
  documentCatalog: Record<string, { label: string; appliesTo: string }>;
  componentSets: Record<string, { label: string; source: string; visualAsset: string; components: string[] }>;
  damageDetectors: Record<string, { status: string; engine: string | null; weights: string | null; classes: string[]; note: string }>;
  modelAssets: Record<string, { assetId: string | null; url: string | null; fallbackUrl: string | null; manifest: string | null; license: string | null; status: string; class: string | null; note: string }>;
  ocrFields: string[];
  trustVersion: string;
  categories: CategoryProfile[];
  plannedCategories: CategoryProfile[];
}

const SPEC = spec as unknown as Spec;

export const CATEGORY_SPEC_VERSION = SPEC.version;
export const TRUST_VERSION = SPEC.trustVersion;
export const DEFAULT_CATEGORY_ID = "passenger_car";

export function allCategories(): CategoryProfile[] {
  return SPEC.categories;
}
export function implementedCategories(): CategoryProfile[] {
  return SPEC.categories.filter((c) => c.status === "implemented");
}
export function plannedCategories(): CategoryProfile[] {
  return SPEC.plannedCategories;
}
export function classLabel(id: string): string {
  return SPEC.classes.find((c) => c.id === id)?.label ?? id;
}
export function classes(): Spec["classes"] {
  return SPEC.classes;
}
export function powertrains(): Spec["powertrains"] {
  return SPEC.powertrains;
}
export function documentLabel(type: string): string {
  return SPEC.documentCatalog[type]?.label ?? type;
}
export function ocrFields(): string[] {
  return SPEC.ocrFields;
}

export function getCategory(id: string | null | undefined): CategoryProfile | undefined {
  if (!id) return undefined;
  return SPEC.categories.find((c) => c.id === id);
}

/** Map a combustion profile onto its electric counterpart (legacy rows only). */
function electricVariant(id: string): string {
  return ({ petrol_motorcycle: "electric_motorcycle", petrol_scooter: "electric_scooter", passenger_car: "electric_car" } as Record<string, string>)[id] ?? id;
}

/**
 * Accept new ids, human labels and legacy free-text `vehicles.category` values.
 * Legacy rows store body style and fuel separately, so `fuel` must be honoured:
 * "Sedan" + "Electric" resolves to `electric_car`. An explicit new category id
 * is authoritative and is never remapped. Mirrors `backend/app/categories.py`.
 */
export function resolveCategoryId(raw: string | null | undefined, fuel?: string | null): string {
  return matchCategoryId(raw, fuel) ?? DEFAULT_CATEGORY_ID;
}

/**
 * STRICT resolver for API and registration boundaries. An unknown label
 * returns `undefined` instead of silently applying passenger-car rules, so a
 * typo can never register a scooter with a car form/validator/3D asset.
 * Mirrors `backend/app/categories.py::match_category_id`.
 */
export function matchCategoryId(raw: string | null | undefined, fuel?: string | null): string | undefined {
  if (!raw) return undefined;
  const exact = SPEC.categories.find((c) => c.id === raw);
  if (exact) return exact.id;
  const norm = raw.trim().toLowerCase().replace(/[_\s-]+/g, " ");
  if (!norm) return undefined;
  const byLabel = SPEC.categories.find(
    (c) => c.label.toLowerCase() === norm || c.shortLabel.toLowerCase() === norm || c.type.replace(/_/g, " ") === norm
  );
  let id = byLabel?.id;
  if (!id) {
    const legacy = SPEC.categories.find((c) => (c.legacyCategories ?? []).some((l) => l.toLowerCase() === norm));
    id = legacy?.id;
  }
  if (!id) {
    if (/bike|motorcycle|superbike/i.test(raw)) id = "petrol_motorcycle";
    else if (/scooter/i.test(raw)) id = "petrol_scooter";
    else if (/car|sedan|suv|hatchback|muv|coupe/i.test(raw)) id = "passenger_car";
  }
  if (!id || !getCategory(id)) return undefined;
  return String(fuel ?? "").toLowerCase().includes("electric") ? electricVariant(id) : id;
}

/**
 * Resolve the category of an existing DB row. `vehicle_category_id` is the
 * authoritative column added by the multi-category migration; legacy rows fall
 * back to their free-text `category` plus `fuel` so all 69 existing car records
 * keep their behaviour without being rewritten.
 */
export function categoryForVehicle(row: { vehicle_category_id?: string | null; category?: string | null; fuel?: string | null }): CategoryProfile {
  if (row.vehicle_category_id) {
    const c = getCategory(row.vehicle_category_id);
    if (c) return c;
  }
  return getCategory(resolveCategoryId(row.category, row.fuel)) ?? getCategory(DEFAULT_CATEGORY_ID)!;
}

export function categoryLabel(id: string | null | undefined): string {
  return getCategory(id)?.label ?? "Passenger car";
}

export function normalizeReg(value: string): string {
  return String(value ?? "").toUpperCase().replace(/[\s-]/g, "");
}
export function normalizeIdentifier(value: string): string {
  return String(value ?? "").toUpperCase().replace(/[\s-]/g, "");
}

export function registrationPattern(jurisdiction = SPEC.defaultJurisdiction): RegExp {
  return new RegExp(SPEC.jurisdictions[jurisdiction]?.registrationPattern ?? SPEC.jurisdictions.IN.registrationPattern);
}

/** Category-aware identity validation. Never applies the 17-char VIN rule to a two-wheeler. */
export function validateIdentity(
  categoryId: string,
  input: { regNo?: string; primaryIdentifier?: string; engineNumber?: string; motorNumber?: string },
  jurisdiction = SPEC.defaultJurisdiction
): { ok: boolean; errors: string[]; normalized: { reg: string; identifier: string } } {
  const cat = getCategory(categoryId) ?? getCategory(DEFAULT_CATEGORY_ID)!;
  const errors: string[] = [];
  const reg = normalizeReg(input.regNo ?? "");
  const identifier = normalizeIdentifier(input.primaryIdentifier ?? "");
  const j = SPEC.jurisdictions[jurisdiction] ?? SPEC.jurisdictions.IN;

  if (!reg) errors.push("Registration number is required.");
  else if (!new RegExp(j.registrationPattern).test(reg)) errors.push(`Registration must look like ${j.registrationExample}.`);

  if (!identifier) errors.push(`${cat.identity.primaryLabel} is required.`);
  else if (!new RegExp(cat.identity.primaryPattern).test(identifier)) {
    errors.push(
      cat.identity.vinApplicable
        ? "VIN must be 17 characters and must not contain I, O or Q."
        : `${cat.identity.primaryLabel} must be 8-22 letters/digits. The 17-character car VIN rule does not apply to two-wheelers.`
    );
  }

  const pt = SPEC.powertrains.find((p) => p.id === cat.powertrain);
  if (pt?.hasEngine && input.engineNumber && cat.identity.engineNumberPattern) {
    if (!new RegExp(cat.identity.engineNumberPattern).test(normalizeIdentifier(input.engineNumber))) {
      errors.push("Engine number has an unexpected format.");
    }
  }
  if (!pt?.hasEngine && input.motorNumber && cat.identity.motorNumberPattern) {
    if (!new RegExp(cat.identity.motorNumberPattern).test(normalizeIdentifier(input.motorNumber))) {
      errors.push("Motor number has an unexpected format.");
    }
  }
  return { ok: errors.length === 0, errors, normalized: { reg, identifier } };
}

/** Legacy helper kept for existing callers. Car-only by definition. */
export function isValidVin(value: string | null | undefined): boolean {
  const cat = getCategory("passenger_car")!;
  return !!value && new RegExp(cat.identity.primaryPattern).test(normalizeIdentifier(value));
}
export function isValidReg(value: string): boolean {
  return new RegExp(SPEC.jurisdictions.IN.registrationPattern).test(normalizeReg(value));
}

export function fieldsForCategory(categoryId: string): FieldGroup[] {
  const cat = getCategory(categoryId) ?? getCategory(DEFAULT_CATEGORY_ID)!;
  return (cat.fieldGroups ?? []).map((g) => ({
    id: g.id,
    label: g.label,
    fields: g.fields
      .map((name) => {
        const base = SPEC.fieldCatalog[name];
        if (!base) return null;
        const f: FieldDef & { name: string } = { ...base, name };
        if (name === "primary_identifier") {
          f.label = cat.identity.primaryLabel;
          f.placeholder = cat.identity.primaryExample;
          f.help = cat.identity.primaryNote;
        }
        const pt = SPEC.powertrains.find((p) => p.id === cat.powertrain);
        if (name === "odometer_km") f.label = `${cat.labels?.odometer ?? "Odometer"} reading (${cat.mileage?.unit ?? "km"})`;
        if (name === "engine_number" && !pt?.hasEngine) return null; // never ask an EV for an engine number
        if (name === "motor_number" && pt?.hasEngine) return null;
        if (name === "engine_cc" && !pt?.hasEngine) return null;
        if (name === "transmission" && !pt?.hasEngine && cat.class === "two_wheeler") return null;
        return f;
      })
      .filter((f): f is FieldDef & { name: string } => f !== null),
  }));
}

export function requiredFieldNames(categoryId: string): string[] {
  return fieldsForCategory(categoryId)
    .flatMap((g) => g.fields)
    .filter((f) => f.required)
    .map((f) => f.name);
}

export function documentsForCategory(categoryId: string): { id: string; label: string; required: boolean }[] {
  const cat = getCategory(categoryId) ?? getCategory(DEFAULT_CATEGORY_ID)!;
  return (cat.documents ?? []).map((id) => ({
    id,
    label: SPEC.documentCatalog[id]?.label ?? id,
    required: (cat.requiredDocuments ?? []).includes(id),
  }));
}

export function isAllowedDocument(categoryId: string, type: string): boolean {
  return documentsForCategory(categoryId).some((d) => d.id === type) || documentsForCategory(DEFAULT_CATEGORY_ID).some((d) => d.id === type);
}

export function componentsForCategory(categoryId: string): { id: string; set: string; label: string; source: string; visualAsset: string } {
  const cat = getCategory(categoryId) ?? getCategory(DEFAULT_CATEGORY_ID)!;
  const setId = cat.damage?.componentSet ?? "car";
  const set = SPEC.componentSets[setId] ?? SPEC.componentSets.car;
  return { id: setId, set: setId, label: set.label, source: set.source, visualAsset: set.visualAsset };
}

export function componentIdsForCategory(categoryId: string): string[] {
  const setId = componentsForCategory(categoryId).id;
  return SPEC.componentSets[setId]?.components ?? [];
}

export function damageDetectorForCategory(categoryId: string): Spec["damageDetectors"][string] {
  const cat = getCategory(categoryId) ?? getCategory(DEFAULT_CATEGORY_ID)!;
  return SPEC.damageDetectors[cat.damage?.detector ?? "car"] ?? SPEC.damageDetectors.two_wheeler;
}

export function modelAssetForCategory(categoryId: string): Spec["modelAssets"][string] & { categoryId: string; interactionsAvailable: boolean; note: string } {
  const cat = getCategory(categoryId) ?? getCategory(DEFAULT_CATEGORY_ID)!;
  const asset = SPEC.modelAssets[cat.model3d?.asset ?? "labelled_schematic"] ?? SPEC.modelAssets.labelled_schematic;
  return {
    ...asset,
    categoryId: cat.id,
    interactionsAvailable: !!cat.model3d?.interactionsAvailable,
    note: cat.model3d?.note ?? asset.note,
  };
}

export function mileageRulesForCategory(categoryId: string): NonNullable<CategoryProfile["mileage"]> {
  const cat = getCategory(categoryId) ?? getCategory(DEFAULT_CATEGORY_ID)!;
  return cat.mileage ?? getCategory(DEFAULT_CATEGORY_ID)!.mileage!;
}

export function trustWeightsForCategory(categoryId: string): { version: string; weights: Record<string, number> } {
  const cat = getCategory(categoryId) ?? getCategory(DEFAULT_CATEGORY_ID)!;
  return cat.trust ?? { version: TRUST_VERSION, weights: {} };
}

export function agentNodesForCategory(categoryId: string): string[] {
  const cat = getCategory(categoryId) ?? getCategory(DEFAULT_CATEGORY_ID)!;
  return cat.agentNodes ?? [];
}

export function labelsForCategory(categoryId: string): NonNullable<CategoryProfile["labels"]> {
  const cat = getCategory(categoryId) ?? getCategory(DEFAULT_CATEGORY_ID)!;
  return cat.labels ?? { primaryIdentifier: "VIN", odometer: "Odometer", propulsion: "Engine", puc: "PUC certificate" };
}

export function isElectric(categoryId: string): boolean {
  return getCategory(categoryId)?.powertrain === "electric";
}
export function hasEngine(categoryId: string): boolean {
  const p = getCategory(categoryId)?.powertrain;
  return !!SPEC.powertrains.find((x) => x.id === p)?.hasEngine;
}
export function pucApplicable(categoryId: string): boolean {
  const cat = getCategory(categoryId);
  if (!cat) return true;
  return documentsForCategory(cat.id).some((d) => d.id === "puc");
}

/** Feature matrix used by the API and the category documentation. */
export function categoryMatrix() {
  return SPEC.categories.map((c) => ({
    id: c.id,
    label: c.label,
    class: c.class,
    classLabel: classLabel(c.class),
    powertrain: c.powertrain,
    status: c.status,
    priority: c.priority,
    primaryIdentifier: c.identity.primaryLabel,
    primaryPattern: c.identity.primaryPattern,
    engineNumberRequired: c.identity.engineNumberRequired,
    puc: pucApplicable(c.id),
    documents: (c.documents ?? []).length,
    components: SPEC.componentSets[c.damage?.componentSet ?? "car"]?.components.length ?? 0,
    visual3d: modelAssetForCategory(c.id).status,
    detector: damageDetectorForCategory(c.id).status,
    trustVersion: c.trust?.version ?? TRUST_VERSION,
    agentNodes: (c.agentNodes ?? []).length,
  }));
}
