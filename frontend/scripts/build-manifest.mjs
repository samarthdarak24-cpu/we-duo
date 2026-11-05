/**
 * scripts/build-manifest.mjs — regenerate public/models/vehicles/model-manifest.json
 * from the shipped GLB and the component registry, so the manifest can never
 * drift from the asset it describes.
 *
 * Usage: node scripts/build-manifest.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const glbPath = path.resolve("public/models/vehicles/trustdrive-sedan.glb");
const outPath = path.resolve("public/models/vehicles/model-manifest.json");
const registry = await import(pathToFileURL(path.resolve("lib/vehicle-registry.ts")).href);

const buf = fs.readFileSync(glbPath);
let offset = 12;
let json = null;
while (offset + 8 <= buf.length) {
  const len = buf.readUInt32LE(offset);
  const type = buf.readUInt32LE(offset + 4);
  if (type === 0x4e4f534a) json = JSON.parse(buf.subarray(offset + 8, offset + 8 + len).toString("utf8"));
  offset += 8 + len;
}
if (!json) {
  console.error("no JSON chunk in", glbPath);
  process.exit(1);
}

const nodeNames = (json.nodes || []).map((n) => n.name).filter(Boolean);
const meshNames = (json.meshes || []).map((m) => m.name).filter(Boolean);
const named = new Set([...nodeNames, ...meshNames]);
const unclaimed = nodeNames.filter(
  (n) => !registry.VEHICLE_COMPONENT_REGISTRY.some((c) => c.primaryNode === n || c.associatedNodes.includes(n))
);

const manifest = {
  modelId: registry.MODEL_ASSET.id,
  modelVersion: "1.1.0",
  generatedAt: new Date().toISOString(),
  generatedBy: "scripts/build-manifest.mjs (measured from the shipped asset)",
  filePath: "public/models/vehicles/trustdrive-sedan.glb",
  publicUrl: registry.MODEL_ASSET.url,
  sha256: crypto.createHash("sha256").update(buf).digest("hex"),
  fileSizeBytes: buf.length,
  asset: {
    generator: registry.MODEL_ASSET.generator,
    nodeCount: (json.nodes || []).length,
    meshCount: (json.meshes || []).length,
    namedMeshCount: meshNames.length,
    materialCount: (json.materials || []).length,
    imageCount: (json.images || []).length,
    textureCount: (json.textures || []).length,
    animationCount: (json.animations || []).length,
    skinCount: (json.skins || []).length,
    extensionsUsed: json.extensionsUsed || [],
    extensionsRequired: json.extensionsRequired || [],
    requiresDraco: (json.extensionsRequired || []).includes("KHR_draco_mesh_compression"),
    requiresMeshopt: (json.extensionsRequired || []).includes("EXT_meshopt_compression"),
  },
  dimensionsMeters: registry.MODEL_ASSET.dimensionsMeters,
  bounds: registry.MODEL_ASSET.bounds,
  coordinateSystem: {
    up: "+Y",
    forward: "+Z",
    vehicleLeft: "+X",
    units: "metres",
    note: "Measured from the asset: the bonnet is at +Z 2.417 m and the rear valance at -Z 1.940 m.",
  },
  license: registry.MODEL_ASSET.license,
  licenseUrl: registry.MODEL_ASSET.licenseUrl,
  attribution: registry.MODEL_ASSET.attribution,
  licenseExclusions: registry.MODEL_ASSET.licenseExclusions,
  modifications: [
    "Khronos / 3D Commerce logo surfaces (`License Plate`, `InteriorSteeringEmblem`) are rendered with a neutral material because the asset licence excludes those trademarks.",
    "Primary and secondary body paint materials are overridden at runtime with a metallic silver automotive clearcoat so every TrustDrive vehicle reads as the same reference finish; panel gaps, glass, tyres and trim keep the asset materials.",
    "No geometry, texture or node was added to the asset. The GLB is served byte-for-byte as published.",
  ],
  supportedInteractions: [
    "360_orbit_rotation",
    "touch_pinch_zoom",
    "wheel_zoom",
    "component_raycaster_selection",
    "smooth_exploded_disassembly",
    "exploded_reassembly",
    "damage_hotspot_selection",
    "severity_filtering",
    "x_ray_ghosted_transparency",
    "camera_presets",
    "theater_and_native_fullscreen",
    "turntable_auto_rotate",
  ],
  components: registry.VEHICLE_COMPONENT_REGISTRY.map((c) => ({
    id: c.id,
    label: c.label,
    category: c.category,
    available: c.available,
    meshSeparable: c.meshSeparable,
    unavailableReason: c.unavailableReason,
    alternativeComponentId: c.alternativeComponentId,
    primaryNode: c.primaryNode,
    nodes: c.associatedNodes,
    explosionVector: c.explosionVector,
    hotspotAnchor: c.defaultHotspotAnchor,
    selectionBounds: c.selectionBounds,
    xrayRole: c.xrayRole,
    trademarked: c.trademarked === true,
    description: c.description,
  })),
  availability: registry.getComponentAvailabilityReport(),
  unmappedAssetNodes: unclaimed,
  integrity: {
    note: "The SHA-256 above proves the served file is the audited file. It says nothing about the authenticity of any document.",
  },
};

// Every node the registry claims must exist in the asset.
for (const c of manifest.components) {
  for (const n of [c.primaryNode, ...c.nodes].filter(Boolean)) {
    if (!named.has(n)) {
      console.error(`registry node missing from asset: ${c.id} -> ${n}`);
      process.exit(1);
    }
  }
}

fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(
  `wrote ${path.relative(process.cwd(), outPath)}  components=${manifest.components.length}  ` +
    `available=${manifest.availability.availableCount}  unmappedNodes=${unclaimed.length}  sha256=${manifest.sha256.slice(0, 16)}…`
);
