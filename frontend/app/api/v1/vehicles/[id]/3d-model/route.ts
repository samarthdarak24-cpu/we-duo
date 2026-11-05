import { NextResponse } from "next/server";
import { getVehicle } from "@/lib/server/db";
import { fail, ok, requireRole } from "@/lib/server/http";
import fs from "node:fs";
import path from "node:path";
import { getComponentAvailabilityReport, VEHICLE_COMPONENT_REGISTRY } from "@/lib/vehicle-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/vehicles/:id/3d-model
 * Returns the vehicle 3D model manifest, metadata, component availability, and asset URL.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = requireRole(req, "buyer", "seller", "admin");
  if (!guard.ok) return guard.response;

  const vehicle = getVehicle(params.id);
  if (!vehicle) {
    return fail(404, "NOT_FOUND", "Vehicle not found");
  }

  // Load model manifest
  let manifest = null;
  try {
    const manifestPath = path.join(process.cwd(), "public", "models", "vehicles", "model-manifest.json");
    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    }
  } catch (err) {
    console.warn("Could not read model manifest:", err);
  }

  const availability = getComponentAvailabilityReport();

  return ok({
    vehicleId: vehicle.id,
    vin: vehicle.vin,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    assetUrl: "/models/vehicles/trustdrive-sedan.glb",
    fallbackAssetUrl: "/models/car.glb",
    manifest,
    availability,
    componentCount: VEHICLE_COMPONENT_REGISTRY.length,
    license: manifest?.license ?? "Creative Commons Attribution 4.0 International (CC BY 4.0)",
    attribution: manifest?.attribution ?? "KhronosGroup / Eric Chadwick (DGG)",
  });
}
