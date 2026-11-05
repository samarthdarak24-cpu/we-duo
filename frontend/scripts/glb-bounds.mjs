/**
 * scripts/glb-bounds.mjs — per-node world AABB for the vehicle GLB.
 * Reads accessor min/max (no vertex decode), composes parent translations/scales/rotations.
 * Usage: node scripts/glb-bounds.mjs [path] [--sort=z|height|name]
 */
import fs from "node:fs";

const file = process.argv[2] || "public/models/vehicles/trustdrive-sedan.glb";
const sortFlag = (process.argv.find((a) => a.startsWith("--sort=")) || "--sort=name").slice(7);

const buf = fs.readFileSync(file);
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));

const COMPS = new Set(["x", "y", "z", "w"]);
const numType = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array, 5122: Int16Array };

function mat4Identity() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }

function mat4Mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}

/** Column-major 4x4 from glTF TRS (quaternion xyzw). */
function nodeMatrix(n) {
  if (n.matrix) return n.matrix.slice();
  const t = n.translation || [0, 0, 0];
  const q = n.rotation || [0, 0, 0, 1];
  const s = n.scale || [1, 1, 1];
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const m = [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
  return m;
}

function applyAffine(m, p) {
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
  return [
    (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w,
    (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w,
    (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) / w,
  ];
}

const nodes = gltf.nodes || [];
const world = new Array(nodes.length).fill(null);
const childrenOf = new Map();
nodes.forEach((n, i) => { (n.children || []).forEach((c) => childrenOf.set(c, i)); });

function rootIndices() {
  const kids = new Set();
  nodes.forEach((n) => (n.children || []).forEach((c) => kids.add(c)));
  return nodes.map((_, i) => i).filter((i) => !kids.has(i));
}

function meshBounds(mi) {
  const mesh = gltf.meshes[mi];
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const prim of mesh.primitives) {
    const pos = gltf.accessors[prim.attributes.POSITION];
    if (!pos?.min || !pos?.max) continue;
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], pos.min[k]);
      max[k] = Math.max(max[k], pos.max[k]);
    }
  }
  if (!Number.isFinite(min[0])) return null;
  return { min, max };
}

const rows = [];
function walk(i, parent) {
  const n = nodes[i];
  const m = parent ? mat4Mul(parent, nodeMatrix(n)) : nodeMatrix(n);
  world[i] = m;
  if (n.mesh !== undefined) {
    const b = meshBounds(n.mesh);
    if (b) {
      let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) for (let z = 0; z < 2; z++) {
        const p = applyAffine(m, [x ? b.max[0] : b.min[0], y ? b.max[1] : b.min[1], z ? b.max[2] : b.min[2]]);
        for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
      }
      const name = n.name || gltf.meshes[n.mesh].name || `mesh#${n.mesh}`;
      rows.push({ name, parent: n.mesh !== undefined && parentOfName(i), lo, hi });
    }
  }
  (n.children || []).forEach((c) => walk(c, m));
}
function parentOfName(i) {
  const p = childrenOf.get(i);
  return p === undefined ? "(root)" : nodes[p].name || `(mesh ${nodes[p].mesh})`;
}
rootIndices().forEach((i) => walk(i, null));

const f = (v) => v.toFixed(3).padStart(7);
rows.sort((a, b) => {
  if (sortFlag === "z") return b.hi[2] - a.hi[2];
  if (sortFlag === "height") return b.hi[1] - a.hi[1];
  return a.name.localeCompare(b.name);
});
console.log(`nodes=${nodes.length} meshes=${rows.length}`);
const gmin = [0, 1, 2].map((k) => Math.min(...rows.map((r) => r.lo[k])));
const gmax = [0, 1, 2].map((k) => Math.max(...rows.map((r) => r.hi[k])));
console.log(`GLOBAL x[${f(gmin[0])} .. ${f(gmax[0])}] y[${f(gmin[1])} .. ${f(gmax[1])}] z[${f(gmin[2])} .. ${f(gmax[2])}]`);
console.log(`size = ${(gmax[0] - gmin[0]).toFixed(2)} x ${(gmax[1] - gmin[1]).toFixed(2)} x ${(gmax[2] - gmin[2]).toFixed(2)} m`);
console.log("name".padEnd(30), "parent".padEnd(24), "min(x,y,z)".padEnd(26), "max(x,y,z)");
for (const r of rows) {
  console.log(r.name.padEnd(30), String(r.parent).padEnd(24), `${f(r.lo[0])} ${f(r.lo[1])} ${f(r.lo[2])}`, `${f(r.hi[0])} ${f(r.hi[1])} ${f(r.hi[2])}`);
}
void COMPS; void numType;
