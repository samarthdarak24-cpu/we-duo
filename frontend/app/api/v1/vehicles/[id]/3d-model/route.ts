import { getAllListings, getVehicle } from "@/lib/server/db";
import { fail, getAuth, ok, requireRole } from "@/lib/server/http";
import { getComponentAvailabilityReport, VEHICLE_COMPONENT_REGISTRY } from "@/lib/vehicle-registry";
import {
  categoryForVehicle,
  componentIdsForCategory,
  labelsForCategory,
  modelAssetForCategory,
} from "@/lib/vehicle-categories";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readManifest(): Record<string, unknown> | null {
  try {
    const p = path.join(process.cwd(), "public", "models", "vehicles", "model-manifest.json");
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
  } catch (err) {
    console.warn("Could not read model manifest:", err);
    return null;
  }
}

function attributionText(manifest: Record<string, unknown> | null): string {
  const a = manifest?.attribution as
    | { creator?: string; organization?: string; copyrightHolder?: string; source?: string }
    | undefined;
  if (!a) return "KhronosGroup / Eric Chadwick (DGG)";
  return [a.creator, a.organization ?? a.copyrightHolder, a.source].filter(Boolean).join(" · ");
}

/**
 * GET /api/v1/vehicles/:id/3d-model
 *
 * Category-aware asset resolution. Car profiles keep the existing licensed
 * sedan GLB and its measured 24-component registry (QA22 baseline). Two-wheeler
 * and other profiles with NO licensed GLB receive `assetUrl: null`, an explicit
 * `unavailable` status, disabled interactions and a labelled schematic.
 * A car model is NEVER returned for a scooter, and a missing GLB is never
 * silently replaced by a primitive stand-in presented as a real asset.
 *
 * Anonymous callers only reach published vehicles and receive geometry metadata
 * alone — no VIN, registration or component availability records.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const auth = getAuth(req);
  let visibility: "authenticated" | "public-summary" = "authenticated";

  if (!auth) {
    const guard = requireRole(req, "buyer", "seller", "admin");
    if (!guard.ok) {
      const listing = getAllListings().find(
        (l) => l.vehicle_id === params.id && l.status === "published"
      );
      if (!listing) return fail(404, "NOT_FOUND", "Vehicle not found");
      visibility = "public-summary";
    }
  }

  const vehicle = getVehicle(params.id);
  if (!vehicle) return fail(404, "NOT_FOUND", "Vehicle not found");

  const category = categoryForVehicle(vehicle);
  const asset = modelAssetForCategory(category.id);
  const carAsset = asset.status === "available" && !!asset.url;
  const components = carAsset ? VEHICLE_COMPONENT_REGISTRY.map((c) => c.id) : componentIdsForCategory(category.id);

  // The sedan manifest/license describes ONLY the car GLB. Attaching it to a
  // two-wheeler schematic would be false attribution.
  const manifest = carAsset ? readManifest() : null;
  const license = carAsset
    ? typeof manifest?.license === "string"
      ? manifest.license
      : "Creative Commons Attribution 4.0 International (CC BY 4.0)"
    : null;

  const geometry = {
    vehicleId: vehicle.id,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    categoryId: category.id,
    categoryLabel: category.label,
    categoryClass: category.class,
    componentLabels: labelsForCategory(category.id),
    assetUrl: carAsset ? asset.url : null,
    fallbackAssetUrl: carAsset ? asset.fallbackUrl : null,
    assetId: asset.assetId,
    assetStatus: asset.status,
    interactionsAvailable: carAsset && asset.interactionsAvailable,
    assetScope: carAsset ? "generic-reference" : "labelled-schematic",
    vehicleSpecific: false,
    visibility,
    manifest,
    license,
    licenseUrl: carAsset ? manifest?.licenseUrl ?? null : null,
    licenseExclusions: carAsset ? manifest?.licenseExclusions ?? null : null,
    attribution: carAsset ? attributionText(manifest) : null,
    componentCount: components.length,
    componentIds: components,
    note: carAsset
      ? "Reference geometry: the damage hotspots and records shown alongside it are real database rows for this vehicle; the 3D body is a generic sedan model, not a scan of this exact car."
      : `No licensed 3D model exists for ${category.label}. A clearly labelled ${category.label} schematic is shown instead. Component hotspots and raycast interactions are unavailable, and no car GLB is substituted.`,
    rule: carAsset
      ? "Category-matched car GLB. Every hotspot maps to a component id in damage_records."
      : "Unavailable 3D asset. The viewer must display the labelled category schematic and disable interactions; it must never load the sedan GLB.",
  };

  if (visibility === "public-summary") return ok(geometry);

  return ok({
    ...geometry,
    vin: vehicle.vin,
    availability: carAsset ? getComponentAvailabilityReport() : { status: "unavailable", reason: "No category-matched 3D asset." },
  });
}
