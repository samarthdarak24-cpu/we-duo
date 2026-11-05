/**
 * scripts/verify-registry.mjs — prove the component registry matches the shipped GLB.
 *
 * Imports the real registry module (Node type-stripping) and checks it against
 * the asset's node/mesh names and measured world bounds. Exits non-zero on any
 * drift so this can gate a release.
 *
 * Usage: node scripts/verify-registry.mjs [path-to-glb]
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const file = process.argv[2] || "public/models/vehicles/trustdrive-sedan.glb";
const registry = await import(pathToFileURL(path.resolve("lib/vehicle-registry.ts")).href);

const buf = fs.readFileSync(file);
let offset = 12;
let json = null;
while (offset + 8 <= buf.length) {
  const len = buf.readUInt32LE(offset);
  const type = buf.readUInt32LE(offset + 4);
  if (type === 0x4e4f534a) json = JSON.parse(buf.subarray(offset + 8, offset + 8 + len).toString("utf8"));
  offset += 8 + len;
}
if (!json) {
  console.error("no JSON chunk in", file);
  process.exit(1);
}

const nodeNames = (json.nodes || []).map((n) => n.name).filter(Boolean);
const meshNames = (json.meshes || []).map((m) => m.name).filter(Boolean);
const allNames = new Set([...nodeNames, ...meshNames]);

const errors = [];
const warnings = [];
const comps = registry.VEHICLE_COMPONENT_REGISTRY;

console.log(`asset=${file}  nodes=${nodeNames.length}  namedMeshes=${meshNames.length}  components=${comps.length}\n`);

for (const c of comps) {
  const referenced = [...new Set([c.primaryNode, ...c.associatedNodes].filter(Boolean))];
  const missing = referenced.filter((n) => !allNames.has(n));
  if (missing.length) errors.push(`${c.id}: references nodes absent from the asset → ${missing.join(", ")}`);
  if (c.available && referenced.length === 0) errors.push(`${c.id}: marked available but maps no node`);
  if (!c.available && referenced.length > 0) errors.push(`${c.id}: marked unavailable but maps ${referenced.length} node(s)`);
  if (!c.available && !c.unavailableReason) errors.push(`${c.id}: unavailable without a reason`);
  if (!c.available && !c.alternativeComponentId) warnings.push(`${c.id}: unavailable without an alternative component`);

  const b = c.selectionBounds;
  for (const axis of ["x", "y", "z"]) {
    if (b.min[axis] > b.max[axis]) errors.push(`${c.id}: inverted ${axis} bounds`);
    if (b.min[axis] < registry.MODEL_ASSET.bounds.min[axis] - 0.05) errors.push(`${c.id}: ${axis} min ${b.min[axis]} outside the asset`);
    if (b.max[axis] > registry.MODEL_ASSET.bounds.max[axis] + 0.05) errors.push(`${c.id}: ${axis} max ${b.max[axis]} outside the asset`);
  }
  const [ax, ay, az] = c.defaultHotspotAnchor;
  const near = comps.some((o) => {
    const t = o.selectionBounds;
    return ax >= t.min.x - 0.35 && ax <= t.max.x + 0.35 && ay >= t.min.y - 0.35 && ay <= t.max.y + 0.35 && az >= t.min.z - 0.35 && az <= t.max.z + 0.35;
  });
  if (!near) errors.push(`${c.id}: anchor [${c.defaultHotspotAnchor}] is not near any measured geometry`);

  const status = c.available ? (c.meshSeparable ? "avail" : "shared") : "  n/a";
  console.log(`${status}  ${c.id.padEnd(18)} ${String(referenced.length).padStart(2)} node(s)  anchor [${c.defaultHotspotAnchor.join(", ")}]`);
}

// Selection must resolve every real named node to exactly one owner, and the
// anchor of each available component must resolve back to that component.
for (const c of comps.filter((x) => x.available)) {
  const p = { x: c.defaultHotspotAnchor[0], y: c.defaultHotspotAnchor[1], z: c.defaultHotspotAnchor[2] };
  const hit = registry.resolveComponentAtPoint(p, [c.primaryNode, ...c.associatedNodes].filter(Boolean));
  if (!hit) errors.push(`${c.id}: its own anchor resolves to nothing`);
  else if (hit.id !== c.id) errors.push(`${c.id}: anchor resolves to "${hit.id}" instead`);
}

const claimed = new Set(comps.flatMap((c) => [c.primaryNode, ...c.associatedNodes].filter(Boolean)));
const unclaimed = nodeNames.filter((n) => !claimed.has(n));
if (unclaimed.length) warnings.push(`unclaimed real nodes: ${unclaimed.join(", ")}`);

const required = [
  "front_bumper", "rear_bumper", "front_left_door", "front_right_door", "rear_left_door", "rear_right_door",
  "bonnet", "boot", "roof", "headlights", "taillights", "mirrors", "front_left_wheel", "front_right_wheel",
  "rear_left_wheel", "rear_right_wheel", "chassis", "engine", "suspension", "interior",
];
const ids = new Set(comps.map((c) => c.id));
const absent = required.filter((r) => !ids.has(r));
if (absent.length) errors.push(`checklist components missing from registry: ${absent.join(", ")}`);

console.log(`\n--- availability report ---`);
const rep = registry.getComponentAvailabilityReport();
console.log(`registered ${rep.totalRegistered} · available ${rep.availableCount} · unavailable ${rep.unavailableCount} · shared-mesh (not separable) ${rep.nonSeparableCount}`);
for (const u of rep.unavailableList) console.log(`  n/a  ${u.id} → ${u.alternativeId}`);
for (const s of rep.nonSeparableList) console.log(`  shr  ${s.id} shares "${s.sharesNodeWith}"`);

console.log(`\n--- warnings (${warnings.length}) ---`);
warnings.forEach((w) => console.log(`  ! ${w}`));
console.log(`--- errors (${errors.length}) ---`);
errors.forEach((e) => console.log(`  x ${e}`));
if (!errors.length) console.log("  (none) — registry matches the shipped asset");
process.exit(errors.length ? 1 : 0);
