// Read-only glTF/GLB inspector: prints the asset block, node/mesh/material names
// and the scene bounding structure so a model can be verified before it is used.
import fs from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/inspect-glb.mjs <file.glb>");
  process.exit(1);
}
const buf = fs.readFileSync(file);
const magic = buf.readUInt32LE(0);
const version = buf.readUInt32LE(4);
const length = buf.readUInt32LE(8);
let offset = 12;
let json = null;
let binLength = 0;
while (offset + 8 <= buf.length) {
  const chunkLength = buf.readUInt32LE(offset);
  const chunkType = buf.readUInt32LE(offset + 4);
  const body = buf.subarray(offset + 8, offset + 8 + chunkLength);
  if (chunkType === 0x4e4f534a) json = JSON.parse(body.toString("utf8"));
  else if (chunkType === 0x004e4942) binLength = chunkLength;
  offset += 8 + chunkLength;
}
if (!json) {
  console.error("no JSON chunk");
  process.exit(1);
}
console.log(`magic=${magic === 0x46546c67 ? "glTF" : "0x" + magic.toString(16)} version=${version} bytes=${length} bin=${binLength}`);
console.log("asset:", JSON.stringify(json.asset));
console.log("generator:", json.asset?.generator ?? "n/a");
console.log("extensionsUsed:", JSON.stringify(json.extensionsUsed ?? []));
console.log("extensionsRequired:", JSON.stringify(json.extensionsRequired ?? []));
console.log(`scenes=${(json.scenes ?? []).length} nodes=${(json.nodes ?? []).length} meshes=${(json.meshes ?? []).length} materials=${(json.materials ?? []).length} images=${(json.images ?? []).length} textures=${(json.textures ?? []).length} animations=${(json.animations ?? []).length} skins=${(json.skins ?? []).length}`);
console.log("scene roots:", JSON.stringify((json.scenes ?? []).map((s) => ({ name: s.name, nodes: s.nodes }))));

const meshNames = (json.meshes ?? []).map((m, i) => `${i}:${m.name ?? "(unnamed)"}[${(m.primitives ?? []).length} prim]`);
console.log("\nMESHES:\n" + meshNames.join("\n"));

const matNames = (json.materials ?? []).map((m, i) => `${i}:${m.name ?? "(unnamed)"} pbrMetallicRoughness{base=${m.pbrMetallicRoughness?.baseColorFactor ?? "tex"} metallic=${m.pbrMetallicRoughness?.metallicFactor ?? 1}} alphaMode=${m.alphaMode ?? "OPAQUE"}`);
console.log("\nMATERIALS:\n" + matNames.join("\n"));

// Print the node tree (name -> mesh index) to depth 4.
const nodes = json.nodes ?? [];
const walk = (idx, depth, out) => {
  const n = nodes[idx];
  if (!n) return;
  out.push(`${"  ".repeat(depth)}- #${idx} ${n.name ?? "(unnamed)"}${n.mesh !== undefined ? ` mesh=${n.mesh}` : ""}${n.children ? ` children=${n.children.length}` : ""}${n.translation ? ` t=${JSON.stringify(n.translation.map((v) => +v.toFixed(2)))}` : ""}${n.scale ? ` s=${JSON.stringify(n.scale.map((v) => +v.toFixed(3)))}` : ""}`);
  if (depth < 3) (n.children ?? []).forEach((c) => walk(c, depth + 1, out));
};
for (const scene of json.scenes ?? []) {
  const out = [`SCENE ${scene.name ?? "(unnamed)"}`];
  (scene.nodes ?? []).forEach((n) => walk(n, 0, out));
  console.log("\n" + out.join("\n"));
}
if (json.scene === undefined && !(json.scenes ?? []).length) console.log("\nNO SCENES");
