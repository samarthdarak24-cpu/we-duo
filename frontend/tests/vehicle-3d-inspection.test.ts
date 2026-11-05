import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  getAllComponents,
  getAvailableComponents,
  getComponentById,
  getComponentByMeshName,
  getComponentAvailabilityReport,
  mapZoneToComponentId,
  VEHICLE_COMPONENT_REGISTRY,
} from "@/lib/vehicle-registry";
import { hotspotsFor, getDamageView } from "@/lib/server/data";

describe("Vehicle 3D Inspection System & Component Registry", () => {
  it("verifies the physical GLB asset exists and matches expected size", () => {
    const glbPath = path.join(process.cwd(), "public", "models", "vehicles", "trustdrive-sedan.glb");
    expect(fs.existsSync(glbPath)).toBe(true);
    const stat = fs.statSync(glbPath);
    expect(stat.size).toBe(11778688);
  });

  it("verifies the model manifest is valid and has correct license & metadata", () => {
    const manifestPath = path.join(process.cwd(), "public", "models", "vehicles", "model-manifest.json");
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    expect(manifest.modelId).toBe("trustdrive-sedan");
    expect(manifest.license).toContain("CC BY 4.0");
    expect(manifest.attribution.creator).toBe("Eric Chadwick");
    expect(manifest.attribution.organization).toContain("Darmstadt Graphics Group");
    expect(manifest.dimensionsMeters.length).toBeGreaterThan(4.0);
    expect(manifest.supportedInteractions).toContain("360_orbit_rotation");
    expect(manifest.supportedInteractions).toContain("smooth_exploded_disassembly");
    expect(manifest.supportedInteractions).toContain("x_ray_ghosted_transparency");
  });

  it("validates component registry mappings and availability report", () => {
    // The component list grows as more GLB meshes are measured, so assert the
    // invariants rather than a hardcoded total. The original 20 gained
    // chassis / interior / license_plate and later additions.
    const all = getAllComponents();
    expect(all.length).toBe(VEHICLE_COMPONENT_REGISTRY.length);
    expect(all.length).toBeGreaterThanOrEqual(20);
    expect(all.map((c) => c.id)).toEqual(
      expect.arrayContaining(["chassis", "interior", "license_plate"]),
    );

    const available = getAvailableComponents();
    expect(available.length).toBe(all.length - 2);

    const report = getComponentAvailabilityReport();
    expect(report.totalRegistered).toBe(all.length);
    expect(report.availableCount).toBe(available.length);
    expect(report.unavailableCount).toBe(2);

    // Verify unavailable components are documented
    const rearDoors = report.unavailableList;
    expect(rearDoors.some((d) => d.id === "rear_left_door")).toBe(true);
    expect(rearDoors.some((d) => d.id === "rear_right_door")).toBe(true);
    expect(rearDoors[0].reason).toMatch(/two-door coup[ée]/i);
  });

  it("accurately resolves GLTF mesh names to canonical component IDs", () => {
    expect(getComponentByMeshName("BodyHood")?.id).toBe("bonnet");
    expect(getComponentByMeshName("BodyDoorLColor1")?.id).toBe("front_left_door");
    expect(getComponentByMeshName("BodyDoorRColor1")?.id).toBe("front_right_door");
    expect(getComponentByMeshName("WheelFrontL")?.id).toBe("front_left_wheel");
    expect(getComponentByMeshName("WheelRearR")?.id).toBe("rear_right_wheel");
    expect(getComponentByMeshName("Engine")?.id).toBe("engine");
    expect(getComponentByMeshName("Axles")?.id).toBe("suspension");
    expect(getComponentByMeshName("BodyRoofPanel")?.id).toBe("roof");
    expect(getComponentByMeshName("BodyHeadlights")?.id).toBe("headlights");
    expect(getComponentByMeshName("BodyTaillights")?.id).toBe("taillights");
  });

  it("maps legacy zone IDs to canonical component IDs", () => {
    expect(mapZoneToComponentId("door_fl")).toBe("front_left_door");
    expect(mapZoneToComponentId("door_fr")).toBe("front_right_door");
    expect(mapZoneToComponentId("front_bumper")).toBe("front_bumper");
    expect(mapZoneToComponentId("bonnet")).toBe("bonnet");
  });

  it("links genuine database damage records into 3D hotspots", () => {
    // Test with seeded vehicle v-seller
    const hotspots = hotspotsFor("v-seller");
    expect(hotspots.length).toBe(VEHICLE_COMPONENT_REGISTRY.length);

    // Check front bumper damage
    const frontBumper = hotspots.find((h) => h.id === "front_bumper");
    expect(frontBumper).toBeDefined();
    expect(frontBumper?.damage?.length).toBeGreaterThan(0);
    expect(frontBumper?.damage?.[0].description).toBeDefined();

    // Check right front door damage
    const rightDoor = hotspots.find((h) => h.id === "front_right_door");
    expect(rightDoor).toBeDefined();
    expect(rightDoor?.damage?.length).toBeGreaterThan(0);
    expect(rightDoor?.damage?.[0].repairInvoiceDocId).toBe("v-seller-service");
  });

  it("resolves damage view zone labels correctly", () => {
    const damageView = getDamageView("v-seller");
    expect(damageView.length).toBeGreaterThan(0);
    const frontRecord = damageView.find((d) => d.zone_id === "front_bumper");
    expect(frontRecord?.zone).toContain("Front Bumper");
  });

  it("verifies explosion vectors are physically aligned", () => {
    const hood = getComponentById("bonnet");
    expect(hood?.explosionVector[1]).toBeGreaterThan(0); // Up
    expect(hood?.explosionVector[2]).toBeGreaterThan(0); // Forward

    const doorL = getComponentById("front_left_door");
    expect(doorL?.explosionVector[0]).toBeGreaterThan(0); // Outward Left

    const doorR = getComponentById("front_right_door");
    expect(doorR?.explosionVector[0]).toBeLessThan(0); // Outward Right

    const roof = getComponentById("roof");
    expect(roof?.explosionVector[1]).toBeGreaterThan(0); // Up
  });
});
