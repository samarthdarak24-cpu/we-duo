#!/usr/bin/env node
/**
 * scripts/build-vehicle-models.mjs
 * ---------------------------------------------------------------------------
 * TrustDrive ORIGINAL procedural 3D vehicle asset generator.
 *
 * OWNERSHIP / LICENCE
 *   Every GLB produced here is an ORIGINAL work created by this script.
 *   Creator : "TrustDrive (original procedural asset)"
 *   Source  : scripts/build-vehicle-models.mjs
 *   Licence : Original work — dedicated to TrustDrive (all rights reserved by
 *             the project owner).
 *   NO third-party model was downloaded, copied, bundled or relicensed to
 *   produce these files. No third-party licence is claimed or implied.
 *
 * HONESTY
 *   These are CATEGORY REPRESENTATIVES. They are not, and must never be
 *   presented as, a specific real make/model of vehicle.
 *
 * DETERMINISM
 *   Fixed seeds, no timestamps inside the binary, fixed iteration order and
 *   stable JSON key order -> two runs produce byte-identical GLB files.
 *   Set TRUSTDRIVE_ASSET_TIMESTAMP to pin the manifest timestamp too.
 *
 * GEOMETRY CONVENTIONS (measured convention shared with the sedan asset)
 *   +Y up, +Z forward (bonnet), +X vehicle-left. Units are METRES.
 *   Wheels rest exactly on y = 0.
 *
 * Usage:
 *   node scripts/build-vehicle-models.mjs                 # build everything
 *   node scripts/build-vehicle-models.mjs --list          # list the plan
 *   node scripts/build-vehicle-models.mjs --only=id,id    # build a subset
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const OUT_DIR = path.join(REPO, "frontend", "public", "models", "vehicles");
const MANIFEST_DIR = path.join(OUT_DIR, "manifests");
const CATEGORIES_PATH = path.join(REPO, "frontend", "lib", "vehicle-categories.json");

const GENERATOR = "TrustDrive build-vehicle-models.mjs v1.0.0 (original procedural asset)";

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — fixed seeds only.
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedFrom(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Minimal column-major 4x4 matrix helpers
// ---------------------------------------------------------------------------
const M = {
  t: (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1],
  rx: (a) => {
    const c = Math.cos(a), s = Math.sin(a);
    return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1];
  },
  ry: (a) => {
    const c = Math.cos(a), s = Math.sin(a);
    return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1];
  },
  rz: (a) => {
    const c = Math.cos(a), s = Math.sin(a);
    return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  },
  s: (x, y, z) => [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1],
};
function mm(...ms) {
  const out = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        ms[0][r] * ms[1][c * 4] +
        ms[0][4 + r] * ms[1][c * 4 + 1] +
        ms[0][8 + r] * ms[1][c * 4 + 2] +
        ms[0][12 + r] * ms[1][c * 4 + 3];
    }
  }
  return out;
}
function applyMat(m, v) {
  const w = m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15];
  return [
    (m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12]) / w,
    (m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13]) / w,
    (m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]) / w,
  ];
}
function applyDir(m, v) {
  const x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2];
  const y = m[1] * v[0] + m[5] * v[1] + m[9] * v[2];
  const z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2];
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

// ---------------------------------------------------------------------------
// Geometry primitives. Each returns { p:[x,y,z...], n:[x,y,z...], i:[...] }
// ---------------------------------------------------------------------------
function emptyGeo() {
  return { p: [], n: [], i: [] };
}
function geoBox(sx, sy, sz) {
  const g = emptyGeo();
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const faces = [
    { n: [0, 0, 1], v: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
    { n: [0, 0, -1], v: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
    { n: [1, 0, 0], v: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]] },
    { n: [-1, 0, 0], v: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]] },
    { n: [0, 1, 0], v: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]] },
    { n: [0, -1, 0], v: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]] },
  ];
  for (const f of faces) {
    const base = g.p.length / 3;
    for (const v of f.v) {
      g.p.push(v[0], v[1], v[2]);
      g.n.push(f.n[0], f.n[1], f.n[2]);
    }
    g.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return g;
}
function geoCylinder(rBottom, rTop, height, seg, capBottom = true, capTop = true) {
  const g = emptyGeo();
  const hh = height / 2;
  const ringB = [], ringT = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    ringB.push([rBottom * c, -hh, rBottom * s]);
    ringT.push([rTop * c, hh, rTop * s]);
  }
  const nrm = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    nrm.push([Math.cos(a), 0, Math.sin(a)]);
  }
  for (let i = 0; i < seg; i++) {
    const b0 = g.p.length / 3;
    const n0 = nrm[i], n1 = nrm[i + 1];
    g.p.push(...ringB[i], ...ringT[i], ...ringT[i + 1], ...ringB[i + 1]);
    g.n.push(...n0, ...n0, ...n1, ...n1);
    g.i.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
  }
  const cap = (ring, ny, reverse) => {
    const c = [0, ny * hh, 0];
    const base = g.p.length / 3;
    g.p.push(...c);
    g.n.push(0, ny, 0);
    for (let i = 0; i < seg; i++) {
      g.p.push(...ring[i]);
      g.n.push(0, ny, 0);
    }
    for (let i = 0; i < seg; i++) {
      const a = base + 1 + i;
      const b = base + 1 + ((i + 1) % seg);
      if (reverse) g.i.push(base, b, a);
      else g.i.push(base, a, b);
    }
  };
  if (capBottom) cap(ringB, -1, false);
  if (capTop) cap(ringT, 1, true);
  return g;
}
/** Torus whose ring lies in the Y-Z plane (axis = X). Used for tyres/arcs. */
function geoTorusX(R, r, segMaj, segMin, u0 = 0, u1 = Math.PI * 2) {
  const g = emptyGeo();
  const closed = Math.abs(u1 - u0 - Math.PI * 2) < 1e-6;
  const iMax = closed ? segMaj : segMaj;
  const rows = [];
  for (let i = 0; i <= iMax; i++) {
    const u = u0 + ((u1 - u0) * i) / segMaj;
    const row = [];
    for (let j = 0; j <= segMin; j++) {
      const v = (j / segMin) * Math.PI * 2;
      const rr = R + r * Math.cos(v);
      row.push({
        p: [r * Math.sin(v), rr * Math.cos(u), rr * Math.sin(u)],
        n: [Math.sin(v), Math.cos(v) * Math.cos(u), Math.cos(v) * Math.sin(u)],
      });
    }
    rows.push(row);
  }
  for (let i = 0; i < iMax; i++) {
    const base = g.p.length / 3;
    const A = rows[i], B = rows[i + 1];
    for (const q of [A[0], A[1], B[1], B[0]]) {
      g.p.push(q.p[0], q.p[1], q.p[2]);
      g.n.push(q.n[0], q.n[1], q.n[2]);
    }
    g.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return g;
}
/**
 * Extrude a side silhouette (polygon in the Z-Y plane) along X.
 * halfWidth may be a number or fn(z, y) -> half width in metres.
 */
function geoProfile(poly, halfWidth) {
  const g = emptyGeo();
  const w = typeof halfWidth === "function" ? halfWidth : () => halfWidth;
  let pts = poly.map((p) => [p[0], p[1]]);
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  if (area < 0) pts = pts.slice().reverse();

  const cz = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const n = pts.length;

  // front cap (+X)
  {
    const base = g.p.length / 3;
    const w0 = w(cz, cy);
    g.p.push(w0, cy, cz);
    g.n.push(1, 0, 0);
    for (const p of pts) {
      g.p.push(w(p[0], p[1]), p[1], p[0]);
      g.n.push(1, 0, 0);
    }
    for (let i = 0; i < n; i++) {
      const a = base + 1 + ((i + 1) % n);
      const b = base + 1 + i;
      g.i.push(base, a, b);
    }
  }
  // back cap (-X)
  {
    const base = g.p.length / 3;
    const w0 = w(cz, cy);
    g.p.push(-w0, cy, cz);
    g.n.push(-1, 0, 0);
    for (const p of pts) {
      g.p.push(-w(p[0], p[1]), p[1], p[0]);
      g.n.push(-1, 0, 0);
    }
    for (let i = 0; i < n; i++) {
      const a = base + 1 + i;
      const b = base + 1 + ((i + 1) % n);
      g.i.push(base, a, b);
    }
  }
  // side walls
  for (let i = 0; i < n; i++) {
    const p0 = pts[i], p1 = pts[(i + 1) % n];
    const dz = p1[0] - p0[0], dy = p1[1] - p0[1];
    const len = Math.hypot(dz, dy) || 1;
    const nrm = [0, dy / len, -dz / len];
    const base = g.p.length / 3;
    const w0 = w(p0[0], p0[1]), w1 = w(p1[0], p1[1]);
    g.p.push(w0, p0[1], p0[0], w1, p1[1], p1[0], -w1, p1[1], p1[0], -w0, p0[1], p0[0]);
    for (let k = 0; k < 4; k++) g.n.push(nrm[0], nrm[1], nrm[2]);
    g.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return g;
}
/** Transform a geo in place and return it. */
function xf(g, m) {
  for (let i = 0; i < g.p.length; i += 3) {
    const p = applyMat(m, [g.p[i], g.p[i + 1], g.p[i + 2]]);
    g.p[i] = p[0]; g.p[i + 1] = p[1]; g.p[i + 2] = p[2];
    const nn = applyDir(m, [g.n[i], g.n[i + 1], g.n[i + 2]]);
    g.n[i] = nn[0]; g.n[i + 1] = nn[1]; g.n[i + 2] = nn[2];
  }
  return g;
}
function mergeGeo(...list) {
  const g = emptyGeo();
  for (const src of list) {
    if (!src) continue;
    const base = g.p.length / 3;
    for (let i = 0; i < src.p.length; i++) g.p.push(src.p[i]);
    for (let i = 0; i < src.n.length; i++) g.n.push(src.n[i]);
    for (let i = 0; i < src.i.length; i++) g.i.push(src.i[i] + base);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Part helpers
// ---------------------------------------------------------------------------
const CAT = {
  exterior: "exterior_body",
  closure: "closure",
  lighting: "lighting",
  wheels: "wheels_brakes",
  powertrain: "powertrain",
  chassis: "chassis_structure",
  interior: "interior",
  glass: "glass",
  trim: "trim",
};

function part(id, label, category, xrayRole, paintRole, group, geo, anchorDir, opts = {}) {
  return {
    id,
    label,
    category,
    xrayRole,
    paintRole,
    group,
    geo,
    anchorDir: anchorDir || [0, 1, 0],
    node: opts.node || null,
    sharedMeshOf: opts.sharedMeshOf || null,
    unmapped: opts.unmapped || null,
    description: opts.description || "",
    unavailableReason: opts.unavailableReason || null,
  };
}

/** Axis-aligned box part. pos = centre, size = full extents. */
function boxPart(id, label, cat, xray, paint, group, mat, pos, size, anchorDir, opts = {}) {
  const g = xf(geoBox(size[0], size[1], size[2]), M.t(pos[0], pos[1], pos[2]));
  return part(id, label, cat, xray, paint, group, [{ g, mat }], anchorDir, opts);
}
/** Tube between two world points. */
function tubePart(id, label, cat, xray, paint, group, mat, from, to, r, anchorDir, opts = {}) {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  const len = Math.hypot(dx, dy, dz);
  const g = geoCylinder(r, r, len, opts.seg || 10, opts.cap !== false, opts.cap !== false);
  // orient +Y axis of the cylinder along (dx,dy,dz)
  const uy = [dx / len, dy / len, dz / len];
  let ref = Math.abs(uy[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  let ux = [
    ref[1] * uy[2] - ref[2] * uy[1],
    ref[2] * uy[0] - ref[0] * uy[2],
    ref[0] * uy[1] - ref[1] * uy[0],
  ];
  const ul = Math.hypot(...ux) || 1;
  ux = ux.map((v) => v / ul);
  const uz = [
    ux[1] * uy[2] - ux[2] * uy[1],
    ux[2] * uy[0] - ux[0] * uy[2],
    ux[0] * uy[1] - ux[1] * uy[0],
  ];
  const m = [
    ux[0], ux[1], ux[2], 0,
    uy[0], uy[1], uy[2], 0,
    uz[0], uz[1], uz[2], 0,
    (from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2, 1,
  ];
  xf(g, m);
  return part(id, label, cat, xray, paint, group, [{ g, mat }], anchorDir, opts);
}
/** Side-profile extrusion part. poly = [[z,y], ...] */
function profilePart(id, label, cat, xray, paint, group, mat, poly, halfWidth, anchorDir, opts = {}) {
  const g = geoProfile(poly, halfWidth);
  return part(id, label, cat, xray, paint, group, [{ g, mat }], anchorDir, opts);
}
/** Wheel: tyre torus + rim/hub cylinder, both around the X axis. */
function wheelGeo(cx, cy, cz, r, t, segMaj = 26, segMin = 9) {
  const tyre = geoTorusX(r - t, t, segMaj, segMin);
  xf(tyre, M.t(cx, cy, cz));
  const rimR = Math.max(0.04, (r - 2 * t) * 0.98);
  const rim = xf(geoCylinder(rimR, rimR, t * 1.8, 20), mm(M.t(cx, cy, cz), M.rz(Math.PI / 2)));
  const hub = xf(geoCylinder(rimR * 0.34, rimR * 0.34, t * 2.6, 12), mm(M.t(cx, cy, cz), M.rz(Math.PI / 2)));
  return { tyre, rim: mergeGeo(rim, hub) };
}
function wheelPart(id, label, group, mat, cx, cy, cz, r, t, anchorDir, opts = {}) {
  const w = wheelGeo(cx, cy, cz, r, t);
  return part(id, label, CAT.wheels, "mechanical", "none", group, [{ g: w.tyre, mat }], anchorDir, opts);
}
function rimPart(id, label, group, mat, cx, cy, cz, r, t, anchorDir, opts = {}) {
  const w = wheelGeo(cx, cy, cz, r, t);
  return part(id, label, CAT.wheels, "mechanical", "none", group, [{ g: w.rim, mat }], anchorDir, opts);
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
function materialSet(paintColour) {
  const list = [
    { name: "paint_primary", baseColorFactor: [...paintColour, 1], metallicFactor: 0.25, roughnessFactor: 0.34 },
    { name: "paint_secondary", baseColorFactor: [0.17, 0.18, 0.2, 1], metallicFactor: 0.3, roughnessFactor: 0.5 },
    { name: "paint_accent", baseColorFactor: [0.72, 0.56, 0.29, 1], metallicFactor: 0.85, roughnessFactor: 0.25 },
    { name: "rubber", baseColorFactor: [0.022, 0.022, 0.025, 1], metallicFactor: 0.0, roughnessFactor: 0.92 },
    { name: "metal_chrome", baseColorFactor: [0.82, 0.83, 0.85, 1], metallicFactor: 1.0, roughnessFactor: 0.2 },
    { name: "metal_dark", baseColorFactor: [0.26, 0.27, 0.29, 1], metallicFactor: 0.85, roughnessFactor: 0.45 },
    { name: "glass", baseColorFactor: [0.78, 0.85, 0.9, 0.3], metallicFactor: 0.0, roughnessFactor: 0.06, alphaMode: "BLEND", doubleSided: true },
    { name: "seat", baseColorFactor: [0.09, 0.09, 0.11, 1], metallicFactor: 0.0, roughnessFactor: 0.9 },
    { name: "lamp_white", baseColorFactor: [0.9, 0.9, 0.88, 1], metallicFactor: 0.0, roughnessFactor: 0.15, emissiveFactor: [1.0, 0.95, 0.82] },
    { name: "lamp_red", baseColorFactor: [0.55, 0.05, 0.04, 1], metallicFactor: 0.0, roughnessFactor: 0.2, emissiveFactor: [0.9, 0.08, 0.05] },
    { name: "lamp_amber", baseColorFactor: [0.7, 0.32, 0.03, 1], metallicFactor: 0.0, roughnessFactor: 0.25, emissiveFactor: [0.95, 0.45, 0.05] },
    { name: "battery_case", baseColorFactor: [0.07, 0.3, 0.24, 1], metallicFactor: 0.2, roughnessFactor: 0.55 },
    { name: "charge_port", baseColorFactor: [0.1, 0.11, 0.13, 1], metallicFactor: 0.3, roughnessFactor: 0.6 },
    { name: "panel_dark", baseColorFactor: [0.12, 0.13, 0.15, 1], metallicFactor: 0.05, roughnessFactor: 0.78 },
  ];
  const index = new Map();
  list.forEach((m, i) => index.set(m.name, i));
  return { list, index };
}

// ---------------------------------------------------------------------------
// Asset builders
// ---------------------------------------------------------------------------
const PAINTS = {
  petrol_motorcycle: [0.09, 0.14, 0.36],
  petrol_scooter: [0.72, 0.16, 0.13],
  electric_scooter: [0.1, 0.33, 0.42],
  electric_motorcycle: [0.11, 0.12, 0.14],
  moped: [0.24, 0.26, 0.3],
  auto_rickshaw: [0.86, 0.72, 0.09],
  passenger_three_wheeler: [0.1, 0.32, 0.55],
  cargo_three_wheeler: [0.62, 0.28, 0.08],
  electric_three_wheeler: [0.13, 0.36, 0.3],
  light_commercial: [0.82, 0.84, 0.86],
  truck: [0.16, 0.28, 0.52],
  bus: [0.74, 0.16, 0.15],
  electric_commercial: [0.15, 0.31, 0.4],
};

function buildPetrolMotorcycle() {
  const p = [];
  const A = 0.70; // half wheelbase
  const rf = 0.31, rr = 0.32;

  p.push(rimPart("front_wheel", "Front Wheel & Hub", "wheels", "metal_chrome", 0, rf, A, rf, 0.058, [0, 1, 0]));
  p.push(wheelPart("front_tyre", "Front Tyre", "wheels", "rubber", 0, rf, A, rf, 0.058, [0, 1, 0]));
  p.push(rimPart("rear_wheel", "Rear Wheel & Hub", "wheels", "metal_chrome", 0, rr, -A, rr, 0.06, [0, 1, 0]));
  p.push(wheelPart("rear_tyre", "Rear Tyre", "wheels", "rubber", 0, rr, -A, rr, 0.06, [0, 1, 0]));

  p.push(
    part("brake_front", "Front Brake Disc", CAT.wheels, "mechanical", "none", "wheels",
      [{ g: xf(geoCylinder(0.13, 0.13, 0.014, 20), mm(M.t(0.085, rf, A), M.rz(Math.PI / 2))), mat: "metal_chrome" }],
      [1, 0, 0])
  );
  p.push(
    part("brake_rear", "Rear Brake Disc", CAT.wheels, "mechanical", "none", "wheels",
      [{ g: xf(geoCylinder(0.11, 0.11, 0.012, 18), mm(M.t(-0.085, rr, -A), M.rz(Math.PI / 2))), mat: "metal_chrome" }],
      [-1, 0, 0])
  );

  // forks
  p.push(
    mergeGeoParts(
      tubePart("front_fork", "Front Forks", CAT.chassis, "structure", "none", "chassis", "metal_chrome",
        [-0.085, 0.88, 0.5], [-0.085, rf, A], 0.028, [0, 0.4, 1]),
      tubePart("front_fork", "Front Forks", CAT.chassis, "structure", "none", "chassis", "metal_chrome",
        [0.085, 0.88, 0.5], [0.085, rf, A], 0.028, [0, 0.4, 1])
    )
  );

  // swingarm + shock
  p.push(
    mergeGeoParts(
      tubePart("rear_suspension", "Rear Suspension & Swingarm", CAT.chassis, "mechanical", "none", "chassis", "metal_dark",
        [-0.09, 0.34, -0.12], [-0.1, rr, -A], 0.022, [0, 0.3, -1]),
      tubePart("rear_suspension", "Rear Suspension & Swingarm", CAT.chassis, "mechanical", "none", "chassis", "metal_dark",
        [0.09, 0.34, -0.12], [0.1, rr, -A], 0.022, [0, 0.3, -1]),
      tubePart("rear_suspension", "Rear Suspension & Swingarm", CAT.chassis, "mechanical", "none", "chassis", "metal_chrome",
        [0, 0.7, -0.28], [0, 0.44, -0.62], 0.03, [0, 0.6, -1])
    )
  );

  // frame
  const frameTubes = [
    [[0, 0.94, 0.46], [0, 0.72, 0.1], 0.024],
    [[0, 0.94, 0.46], [0, 0.74, -0.28], 0.024],
    [[-0.05, 0.36, 0.2], [-0.05, 0.34, -0.2], 0.022],
    [[0.05, 0.36, 0.2], [0.05, 0.34, -0.2], 0.022],
    [[-0.05, 0.74, -0.22], [-0.06, 0.8, -0.74], 0.018],
    [[0.05, 0.74, -0.22], [0.06, 0.8, -0.74], 0.018],
    [[0, 0.72, 0.1], [0, 0.36, 0.2], 0.02],
  ];
  const frameGeos = frameTubes.map(([f, t, r]) =>
    tubePart("chassis_frame", "Chassis Frame", CAT.chassis, "structure", "none", "chassis", "metal_dark", f, t, r, [0, 1, 0])
  );
  p.push(mergeGeoParts(...frameGeos));

  // engine
  p.push(
    part("engine", "Engine Block", CAT.powertrain, "mechanical", "none", "powertrain",
      [
        { g: xf(geoBox(0.3, 0.3, 0.42), M.t(0, 0.55, 0.02)), mat: "metal_dark" },
        { g: xf(geoCylinder(0.11, 0.11, 0.26, 16), mm(M.t(0, 0.72, 0.06), M.rz(Math.PI / 2))), mat: "metal_dark" },
        { g: xf(geoCylinder(0.085, 0.085, 0.2, 14), mm(M.t(0, 0.42, -0.12), M.rz(Math.PI / 2))), mat: "metal_chrome" },
      ],
      [0, 0.2, 1])
  );

  // fuel tank
  p.push(
    profilePart("fuel_tank", "Fuel Tank", CAT.exterior, "exterior", "primary", "body", "paint_primary",
      [[0.3, 0.72], [0.44, 0.86], [0.36, 1.02], [0.1, 1.07], [-0.12, 0.97], [-0.1, 0.78]],
      (z, y) => 0.155 - 0.03 * Math.max(0, y - 0.9),
      [0, 1, 0])
  );

  // seat
  p.push(
    profilePart("seat", "Rider & Pillion Seat", CAT.interior, "interior", "none", "body", "seat",
      [[-0.08, 0.78], [-0.3, 0.87], [-0.62, 0.85], [-0.66, 0.74], [-0.3, 0.7], [-0.1, 0.72]],
      0.115,
      [0, 1, 0])
  );

  // tail panel
  p.push(
    profilePart("rear_body_panel", "Rear Body / Tail Panel", CAT.exterior, "exterior", "primary", "body", "paint_primary",
      [[-0.56, 0.76], [-0.9, 0.79], [-0.96, 0.64], [-0.58, 0.58]], 0.1, [0, 0.4, -1])
  );

  // front fairing
  p.push(
    profilePart("front_fairing", "Front Fairing / Cowl", CAT.exterior, "exterior", "primary", "body", "paint_primary",
      [[0.34, 0.78], [0.56, 0.86], [0.58, 1.0], [0.4, 1.03], [0.3, 0.92]], 0.13, [0, 0.5, 1])
  );

  // handlebar
  p.push(
    mergeGeoParts(
      tubePart("handlebar", "Handlebar & Controls", CAT.exterior, "exterior", "secondary", "controls", "metal_chrome",
        [-0.34, 1.02, 0.46], [0.34, 1.02, 0.46], 0.016, [0, 1, 0]),
      tubePart("handlebar", "Handlebar & Controls", CAT.exterior, "exterior", "secondary", "controls", "metal_chrome",
        [0, 0.92, 0.46], [0, 1.02, 0.46], 0.022, [0, 1, 0]),
      tubePart("handlebar", "Handlebar & Controls", CAT.exterior, "exterior", "secondary", "controls", "rubber",
        [-0.34, 1.02, 0.46], [-0.22, 1.02, 0.46], 0.023, [0, 1, 0]),
      tubePart("handlebar", "Handlebar & Controls", CAT.exterior, "exterior", "secondary", "controls", "rubber",
        [0.34, 1.02, 0.46], [0.22, 1.02, 0.46], 0.023, [0, 1, 0])
    )
  );

  // headlight
  p.push(
    part("headlight", "Headlamp", CAT.lighting, "exterior", "none", "lighting",
      [{ g: xf(geoCylinder(0.095, 0.085, 0.1, 18), mm(M.t(0, 0.88, 0.72), M.rx(Math.PI / 2))), mat: "lamp_white" }],
      [0, 0.3, 1])
  );
  p.push(
    boxPart("tail_light", "Tail Lamp", CAT.lighting, "exterior", "none", "lighting", "lamp_red",
      [0, 0.8, -0.95], [0.13, 0.06, 0.03], [0, 0.3, -1])
  );

  // mirrors
  p.push(
    mergeGeoParts(
      tubePart("mirror_left", "Left Mirror", CAT.exterior, "exterior", "secondary", "controls", "metal_dark",
        [0.1, 1.03, 0.44], [0.26, 1.05, 0.4], 0.012, [1, 0.4, 0]),
      boxPart("mirror_left", "Left Mirror", CAT.exterior, "exterior", "secondary", "controls", "paint_secondary",
        [0.3, 1.06, 0.4], [0.05, 0.1, 0.03], [1, 0.4, 0])
    )
  );
  p.push(
    mergeGeoParts(
      tubePart("mirror_right", "Right Mirror", CAT.exterior, "exterior", "secondary", "controls", "metal_dark",
        [-0.1, 1.03, 0.44], [-0.26, 1.05, 0.4], 0.012, [-1, 0.4, 0]),
      boxPart("mirror_right", "Right Mirror", CAT.exterior, "exterior", "secondary", "controls", "paint_secondary",
        [-0.3, 1.06, 0.4], [0.05, 0.1, 0.03], [-1, 0.4, 0])
    )
  );

  // exhaust
  p.push(
    mergeGeoParts(
      tubePart("exhaust", "Exhaust & Muffler", CAT.powertrain, "mechanical", "none", "powertrain", "metal_chrome",
        [-0.14, 0.42, 0.06], [-0.18, 0.34, -0.4], 0.022, [-1, 0, -1]),
      part("exhaust", "Exhaust & Muffler", CAT.powertrain, "mechanical", "none", "powertrain",
        [{ g: xf(geoCylinder(0.055, 0.055, 0.36, 14), mm(M.t(-0.19, 0.34, -0.58), M.rx(Math.PI / 2))), mat: "metal_chrome" }],
        [-1, 0, -1])
    )
  );

  return { parts: p };
}

function mergeGeoParts(...parts) {
  const geos = [];
  let template = null;
  for (const pt of parts) {
    if (!template) template = pt;
    for (const sub of pt.geo) geos.push(sub);
  }
  const out = part(
    template.id, template.label, template.category, template.xrayRole, template.paintRole,
    template.group, geos, template.anchorDir,
    { description: template.description, node: template.node }
  );
  return out;
}

// --- shared two-wheeler scooter builder -----------------------------------
function buildScooterLike(cfg) {
  const p = [];
  const A = cfg.halfWheelbase;
  const r = cfg.wheelR;
  const t = cfg.tyreT;

  p.push(rimPart("front_wheel", "Front Wheel & Hub", "wheels", "metal_chrome", 0, r, A, r, t, [0, 1, 0]));
  p.push(wheelPart("front_tyre", "Front Tyre", "wheels", "rubber", 0, r, A, r, t, [0, 1, 0]));
  p.push(rimPart("rear_wheel", "Rear Wheel & Hub", "wheels", "metal_chrome", 0, r, -A, r, t, [0, 1, 0]));
  p.push(wheelPart("rear_tyre", "Rear Tyre", "wheels", "rubber", 0, r, -A, r, t, [0, 1, 0]));

  // leg shield / apron
  p.push(
    profilePart("front_apron", "Front Apron / Leg Shield", CAT.exterior, "exterior", "primary", "body", "paint_primary",
      [[0.52, 0.3], [0.63, 0.62], [0.56, 0.92], [0.4, 1.03], [0.26, 0.97], [0.35, 0.66], [0.37, 0.3]],
      (z, y) => 0.28 - 0.09 * Math.max(0, y - 0.45) / 0.6,
      [0, 0.5, 1])
  );

  // footboard
  p.push(
    boxPart("footboard", "Footboard", CAT.exterior, "exterior", "primary", "body", "paint_secondary",
      [0, 0.28, 0.02], [0.44, 0.06, 0.62], [0, 1, 0])
  );

  // side panels
  p.push(
    boxPart("side_panel_left", "Left Side Panel", CAT.exterior, "exterior", "primary", "body", "paint_primary",
      [0.275, 0.45, 0.1], [0.05, 0.28, 0.56], [1, 0.2, 0])
  );
  p.push(
    boxPart("side_panel_right", "Right Side Panel", CAT.exterior, "exterior", "primary", "body", "paint_primary",
      [-0.275, 0.45, 0.1], [0.05, 0.28, 0.56], [-1, 0.2, 0])
  );

  // rear body
  p.push(
    profilePart("rear_body", "Rear Body / Engine Cowl", CAT.exterior, "exterior", "primary", "body", "paint_primary",
      [[-0.18, 0.3], [-0.95, 0.34], [-1.0, 0.72], [-0.72, 0.9], [-0.2, 0.8]],
      (z, y) => 0.27 - 0.03 * Math.max(0, y - 0.5),
      [0, 0.4, -1])
  );

  // seat
  p.push(
    profilePart("seat", "Seat", CAT.interior, "interior", "none", "body", "seat",
      [[-0.24, 0.8], [-0.42, 0.92], [-0.86, 0.9], [-0.9, 0.78], [-0.4, 0.76]], 0.16, [0, 1, 0])
  );

  // storage box
  p.push(
    boxPart("storage_box", "Storage Box", CAT.interior, "interior", "none", "body", "panel_dark",
      [0, 0.72, -0.55], [0.28, 0.16, 0.36], [0, 1, -0.6])
  );

  // mudguards (arcs over the wheels)
  p.push(
    part("front_mudguard", "Front Mudguard", CAT.exterior, "exterior", "primary", "body",
      [{ g: xf(geoTorusX(r + 0.055, 0.028, 18, 8, -1.25, 1.25), M.t(0, r, A)), mat: "paint_primary" }],
      [0, 1, 0.6])
  );
  p.push(
    part("rear_mudguard", "Rear Mudguard", CAT.exterior, "exterior", "primary", "body",
      [{ g: xf(geoTorusX(r + 0.055, 0.028, 18, 8, -1.25, 1.25), M.t(0, r, -A)), mat: "paint_primary" }],
      [0, 1, -0.6])
  );

  // handlebar
  p.push(
    mergeGeoParts(
      tubePart("handlebar", "Handlebar & Controls", CAT.exterior, "exterior", "secondary", "controls", "metal_chrome",
        [-0.33, 1.06, 0.44], [0.33, 1.06, 0.44], 0.015, [0, 1, 0]),
      tubePart("handlebar", "Handlebar & Controls", CAT.exterior, "exterior", "secondary", "controls", "rubber",
        [-0.33, 1.06, 0.44], [-0.22, 1.06, 0.44], 0.022, [0, 1, 0]),
      tubePart("handlebar", "Handlebar & Controls", CAT.exterior, "exterior", "secondary", "controls", "rubber",
        [0.33, 1.06, 0.44], [0.22, 1.06, 0.44], 0.022, [0, 1, 0])
    )
  );

  // headlight + tail lamp
  p.push(
    part("headlight", "Headlamp", CAT.lighting, "exterior", "none", "lighting",
      [{ g: xf(geoCylinder(0.085, 0.075, 0.09, 16), mm(M.t(0, 0.98, 0.6), M.rx(Math.PI / 2))), mat: "lamp_white" }],
      [0, 0.3, 1])
  );
  p.push(
    boxPart("tail_light", "Tail Lamp", CAT.lighting, "exterior", "none", "lighting", "lamp_red",
      [0, 0.82, -0.99], [0.11, 0.06, 0.03], [0, 0.3, -1])
  );

  // suspension
  p.push(
    tubePart("suspension_front", "Front Suspension", CAT.chassis, "mechanical", "none", "chassis", "metal_chrome",
      [0, 0.92, 0.5], [0, r, A], 0.026, [0, 0.4, 1])
  );
  p.push(
    tubePart("suspension_rear", "Rear Suspension", CAT.chassis, "mechanical", "none", "chassis", "metal_chrome",
      [0, 0.58, -0.38], [0, 0.32, -0.6], 0.03, [0, 0.5, -1])
  );

  if (cfg.petrol) {
    p.push(
      part("engine", "Engine Unit", CAT.powertrain, "mechanical", "none", "powertrain",
        [
          { g: xf(geoBox(0.26, 0.3, 0.3), M.t(0, 0.46, -0.6)), mat: "metal_dark" },
          { g: xf(geoCylinder(0.1, 0.1, 0.22, 14), mm(M.t(0, 0.44, -0.38), M.rx(Math.PI / 2))), mat: "metal_dark" },
        ],
        [0, 0, -1])
    );
    p.push(
      mergeGeoParts(
        tubePart("exhaust", "Exhaust & Muffler", CAT.powertrain, "mechanical", "none", "powertrain", "metal_chrome",
          [-0.12, 0.33, -0.62], [-0.15, 0.3, -0.95], 0.02, [-1, 0, -1]),
        part("exhaust", "Exhaust & Muffler", CAT.powertrain, "mechanical", "none", "powertrain",
          [{ g: xf(geoCylinder(0.05, 0.05, 0.24, 14), mm(M.t(-0.16, 0.3, -0.86), M.rx(Math.PI / 2))), mat: "metal_chrome" }],
          [-1, 0, -1])
      )
    );
  } else {
    // electric: hub motor + battery + charging + enclosures
    p.push(
      part("motor_housing", "Rear Hub Motor", CAT.powertrain, "mechanical", "none", "powertrain",
        [{ g: xf(geoCylinder(0.1, 0.1, 0.17, 18), mm(M.t(0, r, -A), M.rz(Math.PI / 2))), mat: "metal_dark" }],
        [0, 0, -1])
    );
    p.push(
      boxPart("battery_compartment", "Battery Pack (under floorboard)", CAT.powertrain, "mechanical", "none", "powertrain",
        "battery_case", [0, 0.17, 0.02], [0.34, 0.13, 0.52], [0, -0.6, 0])
    );
    p.push(
      boxPart("controller_enclosure", "Controller Enclosure", CAT.powertrain, "mechanical", "none", "powertrain",
        "metal_dark", [0, 0.4, 0.36], [0.2, 0.16, 0.24], [0, 0.4, 0.8])
    );
    p.push(
      boxPart("wiring_enclosure", "Wiring Enclosure", CAT.powertrain, "mechanical", "none", "powertrain",
        "panel_dark", [0, 0.54, -0.42], [0.12, 0.09, 0.16], [0, 0.6, -0.8])
    );
    p.push(
      part("charging_port", "Charging Port", CAT.powertrain, "exterior", "none", "powertrain",
        [{ g: xf(geoCylinder(0.045, 0.045, 0.06, 14), mm(M.t(0.24, 0.62, -0.72), M.rz(Math.PI / 2))), mat: "charge_port" }],
        [1, 0.3, -0.6])
    );
  }

  if (cfg.pedals) {
    p.push(
      part("pedals", "Pedal Crank & Pedals", CAT.powertrain, "mechanical", "none", "powertrain",
        [
          { g: xf(geoCylinder(0.012, 0.012, 0.16, 8), mm(M.t(0.1, 0.16, 0.02), M.rz(Math.PI / 2))), mat: "metal_dark" },
          { g: xf(geoBox(0.08, 0.02, 0.05), M.t(0.17, 0.16, 0.02)), mat: "metal_dark" },
          { g: xf(geoCylinder(0.012, 0.012, 0.16, 8), mm(M.t(-0.1, 0.16, 0.02), M.rz(Math.PI / 2))), mat: "metal_dark" },
          { g: xf(geoBox(0.08, 0.02, 0.05), M.t(-0.17, 0.16, 0.02)), mat: "metal_dark" },
        ],
        [1, -0.3, 0], { unmapped: "The scooter/moped component set in vehicle-categories.json has no `pedals` id. Add `pedals` to the set to bind pedal damage records." })
    );
  }

  return { parts: p };
}

function buildElectricMotorcycle() {
  const p = [];
  const A = 0.70;
  const rf = 0.31, rr = 0.32;

  p.push(rimPart("front_wheel", "Front Wheel & Hub", "wheels", "metal_chrome", 0, rf, A, rf, 0.058, [0, 1, 0]));
  p.push(wheelPart("front_tyre", "Front Tyre", "wheels", "rubber", 0, rf, A, rf, 0.058, [0, 1, 0]));
  p.push(rimPart("rear_wheel", "Rear Wheel & Hub", "wheels", "metal_chrome", 0, rr, -A, rr, 0.06, [0, 1, 0]));
  p.push(wheelPart("rear_tyre", "Rear Tyre", "wheels", "rubber", 0, rr, -A, rr, 0.06, [0, 1, 0]));

  p.push(
    tubePart("front_fork", "Front Forks", CAT.chassis, "structure", "none", "chassis", "metal_chrome",
      [-0.085, 0.88, 0.5], [-0.085, rf, A], 0.028, [0, 0.4, 1])
  );
  p.push(
    mergeGeoParts(
      tubePart("front_fork", "Front Forks", CAT.chassis, "structure", "none", "chassis", "metal_chrome",
        [0.085, 0.88, 0.5], [0.085, rf, A], 0.028, [0, 0.4, 1])
    )
  );
  p.push(
    mergeGeoParts(
      tubePart("rear_suspension", "Rear Suspension & Swingarm", CAT.chassis, "mechanical", "none", "chassis", "metal_dark",
        [-0.09, 0.34, -0.12], [-0.1, rr, -A], 0.022, [0, 0.3, -1]),
      tubePart("rear_suspension", "Rear Suspension & Swingarm", CAT.chassis, "mechanical", "none", "chassis", "metal_dark",
        [0.09, 0.34, -0.12], [0.1, rr, -A], 0.022, [0, 0.3, -1]),
      tubePart("rear_suspension", "Rear Suspension & Swingarm", CAT.chassis, "mechanical", "none", "chassis", "metal_chrome",
        [0, 0.7, -0.28], [0, 0.44, -0.62], 0.03, [0, 0.6, -1])
    )
  );

  const frameGeos = [
    [[0, 0.94, 0.46], [0, 0.72, 0.1], 0.024],
    [[0, 0.94, 0.46], [0, 0.74, -0.28], 0.024],
    [[-0.05, 0.36, 0.2], [-0.05, 0.34, -0.2], 0.022],
    [[0.05, 0.36, 0.2], [0.05, 0.34, -0.2], 0.022],
    [[-0.05, 0.74, -0.22], [-0.06, 0.8, -0.74], 0.018],
    [[0.05, 0.74, -0.22], [0.06, 0.8, -0.74], 0.018],
  ].map(([f, t, r]) =>
    tubePart("chassis_frame", "Chassis Frame", CAT.chassis, "structure", "none", "chassis", "metal_dark", f, t, r, [0, 1, 0])
  );
  p.push(mergeGeoParts(...frameGeos));

  // battery pack under the seat
  p.push(
    boxPart("battery_pack", "Battery Pack", CAT.powertrain, "mechanical", "none", "powertrain", "battery_case",
      [0, 0.6, -0.3], [0.24, 0.24, 0.44], [0, -0.3, -1])
  );
  p.push(
    part("motor_housing", "Motor & Reduction Housing", CAT.powertrain, "mechanical", "none", "powertrain",
      [{ g: xf(geoCylinder(0.14, 0.14, 0.22, 18), mm(M.t(0, rr, -A), M.rz(Math.PI / 2))), mat: "metal_dark" }],
      [0, 0, -1])
  );
  p.push(
    boxPart("controller_enclosure", "Controller Enclosure", CAT.powertrain, "mechanical", "none", "powertrain", "metal_dark",
      [0, 0.45, 0.18], [0.18, 0.16, 0.22], [0, 0.4, 0.9])
  );
  p.push(
    boxPart("wiring_enclosure", "Wiring Enclosure", CAT.powertrain, "mechanical", "none", "powertrain", "panel_dark",
      [0, 0.58, -0.05], [0.1, 0.08, 0.14], [0, 0.6, -0.9])
  );
  p.push(
    part("charging_port", "DC Charging Port", CAT.powertrain, "exterior", "none", "powertrain",
      [{ g: xf(geoCylinder(0.045, 0.045, 0.05, 14), mm(M.t(0.13, 0.82, -0.55), M.rz(Math.PI / 2))), mat: "charge_port" }],
      [1, 0.4, -0.8])
  );

  p.push(
    profilePart("front_fairing", "Front Fairing / Cowl", CAT.exterior, "exterior", "primary", "body", "paint_primary",
      [[0.34, 0.78], [0.56, 0.86], [0.58, 1.0], [0.4, 1.03], [0.3, 0.92]], 0.13, [0, 0.5, 1])
  );
  p.push(
    profilePart("rear_body_panel", "Rear Body / Tail Panel", CAT.exterior, "exterior", "primary", "body", "paint_primary",
      [[-0.56, 0.76], [-0.9, 0.79], [-0.96, 0.64], [-0.58, 0.58]], 0.1, [0, 0.4, -1])
  );
  p.push(
    profilePart("seat", "Rider & Pillion Seat", CAT.interior, "interior", "none", "body", "seat",
      [[-0.08, 0.78], [-0.3, 0.87], [-0.62, 0.85], [-0.66, 0.74], [-0.3, 0.7], [-0.1, 0.72]], 0.115, [0, 1, 0])
  );
  p.push(
    mergeGeoParts(
      tubePart("handlebar", "Handlebar & Controls", CAT.exterior, "exterior", "secondary", "controls", "metal_chrome",
        [-0.34, 1.02, 0.46], [0.34, 1.02, 0.46], 0.016, [0, 1, 0]),
      tubePart("handlebar", "Handlebar & Controls", CAT.exterior, "exterior", "secondary", "controls", "metal_chrome",
        [0, 0.92, 0.46], [0, 1.02, 0.46], 0.022, [0, 1, 0])
    )
  );
  p.push(
    part("headlight", "Headlamp", CAT.lighting, "exterior", "none", "lighting",
      [{ g: xf(geoCylinder(0.095, 0.085, 0.1, 18), mm(M.t(0, 0.88, 0.72), M.rx(Math.PI / 2))), mat: "lamp_white" }],
      [0, 0.3, 1])
  );
  p.push(
    boxPart("tail_light", "Tail Lamp", CAT.lighting, "exterior", "none", "lighting", "lamp_red",
      [0, 0.8, -0.95], [0.13, 0.06, 0.03], [0, 0.3, -1])
  );
  p.push(
    mergeGeoParts(
      tubePart("mirror_left", "Left Mirror", CAT.exterior, "exterior", "secondary", "controls", "metal_dark",
        [0.1, 1.03, 0.44], [0.26, 1.05, 0.4], 0.012, [1, 0.4, 0]),
      boxPart("mirror_left", "Left Mirror", CAT.exterior, "exterior", "secondary", "controls", "paint_secondary",
        [0.3, 1.06, 0.4], [0.05, 0.1, 0.03], [1, 0.4, 0])
    )
  );
  p.push(
    mergeGeoParts(
      tubePart("mirror_right", "Right Mirror", CAT.exterior, "exterior", "secondary", "controls", "metal_dark",
        [-0.1, 1.03, 0.44], [-0.26, 1.05, 0.4], 0.012, [-1, 0.4, 0]),
      boxPart("mirror_right", "Right Mirror", CAT.exterior, "exterior", "secondary", "controls", "paint_secondary",
        [-0.3, 1.06, 0.4], [0.05, 0.1, 0.03], [-1, 0.4, 0])
    )
  );
  return { parts: p };
}

function buildThreeWheeler(cfg) {
  const p = [];
  const rf = 0.225, rr = 0.235;
  const zf = cfg.frontZ;
  const zr = cfg.rearZ;
  const track = cfg.track;

  p.push(rimPart("front_wheel", "Front Wheel & Hub", "wheels", "metal_chrome", 0, rf, zf, rf, 0.05, [0, 1, 0]));
  p.push(wheelPart("front_tyre", "Front Tyre", "wheels", "rubber", 0, rf, zf, rf, 0.05, [0, 1, 0]));
  p.push(rimPart("rear_left_wheel", "Rear Left Wheel & Hub", "wheels", "metal_chrome", track, rr, zr, rr, 0.05, [1, 0.3, 0]));
  p.push(rimPart("rear_right_wheel", "Rear Right Wheel & Hub", "wheels", "metal_chrome", -track, rr, zr, rr, 0.05, [-1, 0.3, 0]));
  p.push(
    part("rear_tyre", "Rear Tyres (left & right)", CAT.wheels, "mechanical", "none", "wheels",
      [
        { g: xf(geoTorusX(rr - 0.05, 0.05, 24, 9), M.t(track, rr, zr)), mat: "rubber" },
        { g: xf(geoTorusX(rr - 0.05, 0.05, 24, 9), M.t(-track, rr, zr)), mat: "rubber" },
      ],
      [1, 0.3, 0])
  );

  // chassis
  p.push(
    mergeGeoParts(
      tubePart("chassis_frame", "Chassis Frame", CAT.chassis, "structure", "none", "chassis", "metal_dark",
        [-0.4, 0.32, zf + 0.1], [-0.4, 0.32, zr - 0.2], 0.035, [0, -1, 0]),
      tubePart("chassis_frame", "Chassis Frame", CAT.chassis, "structure", "none", "chassis", "metal_dark",
        [0.4, 0.32, zf + 0.1], [0.4, 0.32, zr - 0.2], 0.035, [0, -1, 0]),
      tubePart("chassis_frame", "Chassis Frame", CAT.chassis, "structure", "none", "chassis", "metal_dark",
        [-0.4, 0.32, zf + 0.05], [0.4, 0.32, zf + 0.05], 0.03, [0, -1, 0]),
      tubePart("chassis_frame", "Chassis Frame", CAT.chassis, "structure", "none", "chassis", "metal_dark",
        [-0.4, 0.32, zr], [0.4, 0.32, zr], 0.03, [0, -1, 0])
    )
  );

  // front cowl over the single front wheel
  p.push(
    profilePart("front_apron", "Front Apron / Cowl", CAT.exterior, "exterior", "primary", "body", "paint_primary",
      [[zf - 0.05, 0.3], [zf + 0.28, 0.34], [zf + 0.34, 0.7], [zf + 0.1, 0.82], [zf - 0.12, 0.62]],
      (z) => 0.26,
      [0, 0.4, 1])
  );

  // floor / rear body
  p.push(
    boxPart("rear_body", "Rear Body Panel", CAT.exterior, "exterior", "primary", "body", "paint_primary",
      [0, 0.6, zr - 0.22], [1.24, 0.5, 0.06], [0, 0.3, -1])
  );

  // side panels
  const panelH = cfg.closedSides ? 0.72 : 0.32;
  p.push(
    boxPart("side_panel_left", "Left Side Panel", CAT.exterior, "exterior", "primary", "body", "paint_primary",
      [0.62, 0.36 + panelH / 2, zf - 0.55], [0.06, panelH, 1.35], [1, 0.2, 0])
  );
  p.push(
    boxPart("side_panel_right", "Right Side Panel", CAT.exterior, "exterior", "secondary", "body", "paint_primary",
      [-0.62, 0.36 + panelH / 2, zf - 0.55], [0.06, panelH, 1.35], [-1, 0.2, 0])
  );

  // roof + canopy (shared mesh: the canopy visor is part of the roof shell)
  const roofZ = cfg.roofZ;
  const roofGeos = [
    { g: xf(geoBox(1.34, 0.06, roofZ[1] - roofZ[0]), M.t(0, 1.72, (roofZ[0] + roofZ[1]) / 2)), mat: "paint_primary" },
    { g: xf(geoBox(1.3, 0.05, 0.16), M.t(0, 1.66, roofZ[1] + 0.14)), mat: "paint_primary" },
  ];
  p.push(
    part("roof", "Roof Panel", CAT.exterior, "exterior", "primary", "body", roofGeos, [0, 1, 0])
  );
  p.push(
    part("canopy", "Canopy / Visor", CAT.exterior, "exterior", "secondary", "body", roofGeos, [0, 0.6, 1],
      { node: "roof", sharedMeshOf: "roof", description: "The canopy visor is modelled as part of the roof shell mesh, so it cannot be detached on its own." })
  );

  // windshield
  p.push(
    part("windshield", "Windscreen", CAT.glass, "glass", "none", "body",
      [{ g: xf(geoBox(1.06, 0.6, 0.04), mm(M.t(0, 1.3, zf - 0.12), M.rx(-0.18))), mat: "glass" }],
      [0, 0.5, 1])
  );

  // pillars
  p.push(
    mergeGeoParts(
      tubePart("roof", "Roof Panel", CAT.exterior, "exterior", "primary", "body", "metal_dark",
        [0.62, 0.72, zf - 0.1], [0.62, 1.7, zf - 0.1], 0.028, [1, 0.2, 0]),
      tubePart("roof", "Roof Panel", CAT.exterior, "exterior", "primary", "body", "metal_dark",
        [-0.62, 0.72, zf - 0.1], [-0.62, 1.7, zf - 0.1], 0.028, [-1, 0.2, 0]),
      tubePart("roof", "Roof Panel", CAT.exterior, "exterior", "primary", "body", "metal_dark",
        [0.62, 1.7, zf - 0.1], [-0.62, 1.7, zf - 0.1], 0.026, [0, 1, 0])
    )
  );

  // seat
  p.push(
    boxPart("seat", "Bench Seat", CAT.interior, "interior", "none", "interior", "seat",
      [0, 0.68, zf - 0.62], [1.0, 0.12, 0.62], [0, 1, 0])
  );
  p.push(
    boxPart("seat", "Bench Seat", CAT.interior, "interior", "none", "interior", "seat",
      [0, 0.92, zf - 0.92], [1.0, 0.5, 0.1], [0, 0.4, -1])
  );

  // handlebar
  p.push(
    mergeGeoParts(
      tubePart("handlebar", "Handlebar & Controls", CAT.exterior, "exterior", "secondary", "controls", "metal_chrome",
        [-0.35, 1.08, zf - 0.18], [0.35, 1.08, zf - 0.18], 0.016, [0, 1, 0]),
      tubePart("handlebar", "Handlebar & Controls", CAT.exterior, "exterior", "secondary", "controls", "metal_dark",
        [0, 0.9, zf - 0.18], [0, 1.08, zf - 0.18], 0.022, [0, 1, 0])
    )
  );

  p.push(
    part("headlight", "Headlamp", CAT.lighting, "exterior", "none", "lighting",
      [{ g: xf(geoCylinder(0.085, 0.075, 0.09, 16), mm(M.t(0, 0.72, zf + 0.32), M.rx(Math.PI / 2))), mat: "lamp_white" }],
      [0, 0.3, 1])
  );
  p.push(
    boxPart("tail_light", "Tail Lamp", CAT.lighting, "exterior", "none", "lighting", "lamp_red",
      [0.42, 0.95, zr - 0.26], [0.12, 0.1, 0.04], [0.6, 0.3, -1])
  );
  p.push(
    boxPart("tail_light", "Tail Lamp", CAT.lighting, "exterior", "none", "lighting", "lamp_red",
      [-0.42, 0.95, zr - 0.26], [0.12, 0.1, 0.04], [-0.6, 0.3, -1])
  );

  p.push(
    part("brake_front", "Front Brake Disc", CAT.wheels, "mechanical", "none", "wheels",
      [{ g: xf(geoCylinder(0.12, 0.12, 0.014, 18), mm(M.t(0.08, rf, zf), M.rz(Math.PI / 2))), mat: "metal_chrome" }],
      [1, 0, 0])
  );
  p.push(
    part("brake_rear", "Rear Brake Drums", CAT.wheels, "mechanical", "none", "wheels",
      [{ g: xf(geoCylinder(0.1, 0.1, 0.02, 16), mm(M.t(track - 0.08, rr, zr), M.rz(Math.PI / 2))), mat: "metal_dark" }],
      [1, 0, 0])
  );

  if (cfg.petrol) {
    p.push(
      part("engine", "Engine Unit", CAT.powertrain, "mechanical", "none", "powertrain",
        [{ g: xf(geoBox(0.36, 0.36, 0.42), M.t(0, 0.5, zf - 0.18)), mat: "metal_dark" }],
        [0, 0, 1])
    );
    p.push(
      mergeGeoParts(
        tubePart("exhaust", "Exhaust & Muffler", CAT.powertrain, "mechanical", "none", "powertrain", "metal_chrome",
          [-0.2, 0.4, zf - 0.3], [-0.24, 0.34, zr + 0.1], 0.024, [-1, 0, -1]),
        part("exhaust", "Exhaust & Muffler", CAT.powertrain, "mechanical", "none", "powertrain",
          [{ g: xf(geoCylinder(0.06, 0.06, 0.4, 14), mm(M.t(-0.25, 0.33, zr - 0.1), M.rx(Math.PI / 2))), mat: "metal_chrome" }],
          [-1, 0, -1])
      )
    );
  } else {
    p.push(
      boxPart("battery_compartment", "Battery Pack", CAT.powertrain, "mechanical", "none", "powertrain", "battery_case",
        [0, 0.2, zf - 0.45], [0.86, 0.2, 0.62], [0, -0.6, 0])
    );
    p.push(
      part("motor_housing", "Motor & Reduction Housing", CAT.powertrain, "mechanical", "none", "powertrain",
        [{ g: xf(geoCylinder(0.13, 0.13, 0.18, 16), mm(M.t(0, 0.42, zf - 0.22), M.rz(Math.PI / 2))), mat: "metal_dark" }],
        [0, 0.2, 0.8])
    );
    p.push(
      boxPart("controller_enclosure", "Controller Enclosure", CAT.powertrain, "mechanical", "none", "powertrain", "metal_dark",
        [0, 0.44, zf - 0.05], [0.24, 0.18, 0.26], [0, 0.4, 0.8])
    );
    p.push(
      boxPart("wiring_enclosure", "Wiring Enclosure", CAT.powertrain, "mechanical", "none", "powertrain", "panel_dark",
        [0, 0.4, zf - 0.62], [0.14, 0.1, 0.18], [0, 0.5, -0.9])
    );
    p.push(
      part("charging_port", "Charging Port", CAT.powertrain, "exterior", "none", "powertrain",
        [{ g: xf(geoCylinder(0.05, 0.05, 0.06, 14), mm(M.t(0.3, 0.66, zf - 0.3), M.rz(Math.PI / 2))), mat: "charge_port" }],
        [1, 0.3, 0])
    );
  }

  if (cfg.cargo) {
    // open cargo bed with side walls and a tailgate
    p.push(
      boxPart("cargo_box", "Cargo Bed Floor", CAT.exterior, "exterior", "secondary", "body", "panel_dark",
        [0, 0.62, zr + 0.42], [1.24, 0.06, 1.1], [0, 1, 0])
    );
    p.push(
      boxPart("cargo_box", "Cargo Bed Side Wall (left)", CAT.exterior, "exterior", "secondary", "body", "paint_primary",
        [0.64, 0.9, zr + 0.42], [0.05, 0.52, 1.1], [1, 0.2, 0])
    );
    p.push(
      boxPart("cargo_box", "Cargo Bed Side Wall (right)", CAT.exterior, "exterior", "secondary", "body", "paint_primary",
        [-0.64, 0.9, zr + 0.42], [0.05, 0.52, 1.1], [-1, 0.2, 0])
    );
    p.push(
      boxPart("cargo_box", "Cargo Tailgate", CAT.exterior, "exterior", "secondary", "body", "paint_primary",
        [0, 0.9, zr - 0.13], [1.24, 0.52, 0.05], [0, 0.3, -1])
    );
  }

  return { parts: p };
}

function buildCommercialLike(cfg) {
  const p = [];
  const frontZ = cfg.frontZ;
  const rearZ = cfg.rearZ;
  const wheelR = cfg.wheelR;
  const track = cfg.track;
  const halfW = cfg.halfWidth;
  const frameY = cfg.frameY;
  const floorY = cfg.floorY;

  // chassis rails
  p.push(
    mergeGeoParts(
      tubePart("chassis_frame", "Chassis Frame Rails", CAT.chassis, "structure", "none", "chassis", "metal_dark",
        [-halfW * 0.62, frameY, frontZ - 0.3], [-halfW * 0.62, frameY, rearZ + 0.3], 0.055, [0, -1, 0]),
      tubePart("chassis_frame", "Chassis Frame Rails", CAT.chassis, "structure", "none", "chassis", "metal_dark",
        [halfW * 0.62, frameY, frontZ - 0.3], [halfW * 0.62, frameY, rearZ + 0.3], 0.055, [0, -1, 0]),
      tubePart("chassis_frame", "Chassis Frame Rails", CAT.chassis, "structure", "none", "chassis", "metal_dark",
        [-halfW * 0.62, frameY, frontZ - 0.25], [halfW * 0.62, frameY, frontZ - 0.25], 0.045, [0, -1, 0]),
      tubePart("chassis_frame", "Chassis Frame Rails", CAT.chassis, "structure", "none", "chassis", "metal_dark",
        [-halfW * 0.62, frameY, rearZ + 0.25], [halfW * 0.62, frameY, rearZ + 0.25], 0.045, [0, -1, 0])
    )
  );

  // cabin
  p.push(
    profilePart("cabin", "Cabin", CAT.exterior, "exterior", "primary", "body", "paint_primary",
      cfg.cabinPoly,
      (z, y) => (cfg.cabinHalfWidth ? cfg.cabinHalfWidth : halfW),
      [0, 0.4, 1])
  );

  // windshield
  p.push(
    part("windshield", "Windscreen", CAT.glass, "glass", "none", "body",
      [{ g: xf(geoBox(cfg.windWidth, cfg.windHeight, 0.05), mm(M.t(0, cfg.windY, cfg.windZ), M.rx(cfg.windTilt))), mat: "glass" }],
      [0, 0.4, 1])
  );

  // side windows for the bus
  for (const w of cfg.sideWindows || []) {
    p.push(
      part(w.id, w.label, CAT.glass, "glass", "none", "body",
        [{ g: xf(geoBox(0.04, w.h, w.l), M.t(w.x, w.y, w.z)), mat: "glass" }],
        w.anchor, { unmapped: w.unmapped || null })
    );
  }

  // cargo body / load body
  if (cfg.cargoBody) {
    const cb = cfg.cargoBody;
    p.push(
      boxPart("cargo_body", "Cargo Body", CAT.exterior, "exterior", "primary", "body", "paint_primary",
        [0, cb.y, cb.z], [halfW * 2, cb.h, cb.l], [0, 0.4, 0])
    );
    p.push(
      boxPart("load_body", "Load Floor", CAT.exterior, "exterior", "secondary", "body", "panel_dark",
        [0, floorY, cb.z], [halfW * 2 - 0.12, 0.06, cb.l - 0.12], [0, 1, 0],
        { sharedMeshOf: "cargo_body", description: "The load floor is modelled inside the cargo-body shell mesh and therefore cannot be detached on its own." })
    );
    p.push(
      boxPart("cargo_door", "Rear Cargo Doors", CAT.exterior, "exterior", "secondary", "body", "paint_secondary",
        [0, cb.y - 0.06, cb.z - cb.l / 2 - 0.03], [halfW * 2 - 0.14, cb.h - 0.14, 0.05], [0, 0.3, -1])
    );
  }

  // bumpers
  p.push(
    boxPart("front_bumper", "Front Bumper", CAT.exterior, "exterior", "secondary", "body", "paint_secondary",
      [0, cfg.bumperY, frontZ + 0.02], [halfW * 2, 0.3, 0.16], [0, 0.2, 1])
  );
  p.push(
    boxPart("rear_bumper", "Rear Bumper", CAT.exterior, "exterior", "secondary", "body", "paint_secondary",
      [0, cfg.bumperY, rearZ - 0.02], [halfW * 2, 0.3, 0.16], [0, 0.2, -1])
  );

  // wheels (tyre + rim in one mesh — the commercial set has no tyre ids)
  const wheels = [
    ["front_left_wheel", "Front Left Wheel", track, frontZ, 1],
    ["front_right_wheel", "Front Right Wheel", -track, frontZ, -1],
    ["rear_left_wheel", "Rear Left Wheel", track, rearZ, 1],
    ["rear_right_wheel", "Rear Right Wheel", -track, rearZ, -1],
  ];
  for (const [id, label, x, z, side] of wheels) {
    const dual = cfg.dualRear && z === rearZ;
    const w = wheelGeo(x, wheelR, z, wheelR, cfg.tyreT);
    const geos = [{ g: w.tyre, mat: "rubber" }, { g: w.rim, mat: "metal_dark" }];
    if (dual) {
      const w2 = wheelGeo(x + side * 0.26, wheelR, z, wheelR, cfg.tyreT);
      geos.push({ g: w2.tyre, mat: "rubber" });
      geos.push({ g: w2.rim, mat: "metal_dark" });
    }
    p.push(part(id, label, CAT.wheels, "mechanical", "none", "wheels", geos, [side, 0.2, 0]));
  }

  // axles
  p.push(
    part("front_axle", "Front Axle", CAT.chassis, "mechanical", "none", "chassis",
      [{ g: xf(geoCylinder(0.05, 0.05, track * 2, 12), mm(M.t(0, wheelR, frontZ), M.rz(Math.PI / 2))), mat: "metal_dark" }],
      [0, -1, 0])
  );
  p.push(
    part("rear_axle", "Rear Axle", CAT.chassis, "mechanical", "none", "chassis",
      [{ g: xf(geoCylinder(0.06, 0.06, track * 2, 12), mm(M.t(0, wheelR, rearZ), M.rz(Math.PI / 2))), mat: "metal_dark" }],
      [0, -1, 0])
  );

  // suspension
  p.push(
    mergeGeoParts(
      boxPart("suspension_front", "Front Suspension", CAT.chassis, "mechanical", "none", "chassis", "metal_dark",
        [track - 0.1, wheelR + 0.16, frontZ], [0.1, 0.22, 0.7], [1, 0.3, 0]),
      boxPart("suspension_front", "Front Suspension", CAT.chassis, "mechanical", "none", "chassis", "metal_dark",
        [-track + 0.1, wheelR + 0.16, frontZ], [0.1, 0.22, 0.7], [-1, 0.3, 0])
    )
  );
  p.push(
    mergeGeoParts(
      boxPart("suspension_rear", "Rear Suspension", CAT.chassis, "mechanical", "none", "chassis", "metal_dark",
        [track - 0.1, wheelR + 0.14, rearZ], [0.1, 0.2, 0.8], [1, 0.3, 0]),
      boxPart("suspension_rear", "Rear Suspension", CAT.chassis, "mechanical", "none", "chassis", "metal_dark",
        [-track + 0.1, wheelR + 0.14, rearZ], [0.1, 0.2, 0.8], [-1, 0.3, 0])
    )
  );

  // lights
  for (const side of [1, -1]) {
    p.push(
      part("headlights", "Headlamp Assemblies", CAT.lighting, "exterior", "none", "lighting",
        [{ g: xf(geoCylinder(0.1, 0.09, 0.1, 16), mm(M.t(side * halfW * 0.68, cfg.lampY, frontZ + 0.02), M.rx(Math.PI / 2))), mat: "lamp_white" }],
        [side, 0.3, 1])
    );
    p.push(
      part("taillights", "Tail Lamps", CAT.lighting, "exterior", "none", "lighting",
        [{ g: xf(geoBox(0.14, 0.3, 0.06), M.t(side * halfW * 0.7, cfg.lampY, rearZ - 0.02)), mat: "lamp_red" }],
        [side, 0.3, -1])
    );
    p.push(
      mergeGeoParts(
        tubePart("mirrors", "Exterior Mirrors", CAT.exterior, "exterior", "secondary", "body", "metal_dark",
          [side * (halfW - 0.02), cfg.mirrorY, cfg.mirrorZ], [side * (halfW + 0.22), cfg.mirrorY, cfg.mirrorZ], 0.02, [side, 0.3, 0]),
        boxPart("mirrors", "Exterior Mirrors", CAT.exterior, "exterior", "secondary", "body", "paint_secondary",
          [side * (halfW + 0.26), cfg.mirrorY, cfg.mirrorZ], [0.06, 0.3, 0.16], [side, 0.3, 0])
      )
    );
  }

  // number plate
  p.push(
    boxPart("number_plate", "Front Number Plate", CAT.trim, "exterior", "none", "body", "paint_accent",
      [0, cfg.bumperY + 0.02, frontZ + 0.11], [0.52, 0.16, 0.03], [0, 0.2, 1])
  );
  p.push(
    boxPart("number_plate", "Rear Number Plate", CAT.trim, "exterior", "none", "body", "paint_accent",
      [0, cfg.bumperY + 0.02, rearZ - 0.11], [0.52, 0.16, 0.03], [0, 0.2, -1])
  );

  if (cfg.petrol) {
    p.push(
      part("engine", "Engine Unit", CAT.powertrain, "mechanical", "none", "powertrain",
        [{ g: xf(geoBox(0.66, 0.5, 0.6), M.t(0, frameY + 0.16, frontZ - 0.25)), mat: "metal_dark" }],
        [0, 0.2, 1])
    );
    p.push(
      part("fuel_tank", "Fuel Tank", CAT.powertrain, "mechanical", "none", "powertrain",
        [{ g: xf(geoCylinder(0.22, 0.22, 0.52, 16), mm(M.t(halfW * 0.62, frameY - 0.12, frontZ - 0.95), M.rx(Math.PI / 2))), mat: "metal_dark" }],
        [1, 0, 0])
    );
    p.push(
      mergeGeoParts(
        tubePart("exhaust", "Exhaust System", CAT.powertrain, "mechanical", "none", "powertrain", "metal_chrome",
          [-halfW * 0.45, frameY - 0.05, frontZ - 0.35], [-halfW * 0.5, frameY - 0.14, rearZ + 0.3], 0.035, [-1, -0.2, -1]),
        part("exhaust", "Exhaust System", CAT.powertrain, "mechanical", "none", "powertrain",
          [{ g: xf(geoCylinder(0.075, 0.075, 0.4, 14), mm(M.t(-halfW * 0.5, frameY - 0.14, rearZ + 0.15), M.rx(Math.PI / 2))), mat: "metal_chrome" }],
          [-1, -0.2, -1])
      )
    );
  } else {
    p.push(
      boxPart("battery_pack", "Battery Pack", CAT.powertrain, "mechanical", "none", "powertrain", "battery_case",
        [0, frameY - 0.18, (frontZ + rearZ) / 2], [halfW * 1.25, 0.3, Math.abs(rearZ - frontZ) * 0.5], [0, -1, 0])
    );
    p.push(
      part("motor_housing", "Motor & Reduction Unit", CAT.powertrain, "mechanical", "none", "powertrain",
        [{ g: xf(geoCylinder(0.16, 0.16, 0.4, 16), mm(M.t(0, wheelR, rearZ), M.rz(Math.PI / 2))), mat: "metal_dark" }],
        [0, 0, -1])
    );
    p.push(
      boxPart("controller_enclosure", "Controller Enclosure", CAT.powertrain, "mechanical", "none", "powertrain", "metal_dark",
        [halfW * 0.55, frameY + 0.02, frontZ - 0.7], [0.3, 0.22, 0.34], [1, 0.2, 0])
    );
    p.push(
      boxPart("wiring_enclosure", "Wiring Enclosure", CAT.powertrain, "mechanical", "none", "powertrain", "panel_dark",
        [-halfW * 0.55, frameY + 0.02, frontZ - 0.7], [0.2, 0.16, 0.26], [-1, 0.2, 0])
    );
    p.push(
      part("charging_port", "Charging Port", CAT.powertrain, "exterior", "none", "powertrain",
        [{ g: xf(geoCylinder(0.06, 0.06, 0.07, 14), mm(M.t(halfW * 0.72, cfg.lampY + 0.25, frontZ - 0.1), M.rz(Math.PI / 2))), mat: "charge_port" }],
        [1, 0.4, 0.8])
    );
  }

  return { parts: p };
}

// ---------------------------------------------------------------------------
// Asset plan
// ---------------------------------------------------------------------------
const ASSETS = [
  {
    id: "petrol_motorcycle",
    category: "two_wheeler",
    componentSet: "motorcycle",
    kind: "Category representative petrol motorcycle (standard 150-200 cc class).",
    build: buildPetrolMotorcycle,
    wheelMeshes: ["front_tyre", "rear_tyre"],
    wheelCount: 2,
    wheelbase: 1.4,
  },
  {
    id: "petrol_scooter",
    category: "two_wheeler",
    componentSet: "scooter",
    kind: "Category representative step-through petrol scooter.",
    build: () => buildScooterLike({ halfWheelbase: 0.63, wheelR: 0.215, tyreT: 0.05, petrol: true }),
    wheelMeshes: ["front_tyre", "rear_tyre"],
    wheelCount: 2,
    wheelbase: 1.26,
  },
  {
    id: "electric_scooter",
    category: "two_wheeler",
    componentSet: "electric_scooter",
    kind: "Category representative electric scooter with a visible battery pack.",
    build: () => buildScooterLike({ halfWheelbase: 0.63, wheelR: 0.215, tyreT: 0.05, petrol: false }),
    wheelMeshes: ["front_tyre", "rear_tyre"],
    wheelCount: 2,
    wheelbase: 1.26,
  },
  {
    id: "electric_motorcycle",
    category: "two_wheeler",
    componentSet: "electric_motorcycle",
    kind: "Category representative electric motorcycle with a visible battery pack.",
    build: buildElectricMotorcycle,
    wheelMeshes: ["front_tyre", "rear_tyre"],
    wheelCount: 2,
    wheelbase: 1.4,
  },
  {
    id: "moped",
    category: "two_wheeler",
    componentSet: "scooter",
    kind: "Category representative small-engine moped (pedal frame, small wheels, low seat).",
    build: () => buildScooterLike({ halfWheelbase: 0.58, wheelR: 0.2, tyreT: 0.05, petrol: true, pedals: true }),
    wheelMeshes: ["front_tyre", "rear_tyre"],
    wheelCount: 2,
    wheelbase: 1.16,
  },
  {
    id: "auto_rickshaw",
    category: "three_wheeler",
    componentSet: "three_wheeler",
    kind: "Category representative auto-rickshaw (single front wheel, open-sided passenger cabin).",
    build: () =>
      buildThreeWheeler({
        frontZ: 0.95, rearZ: -0.78, track: 0.56, closedSides: false, petrol: true,
        roofZ: [0.62, -0.92],
      }),
    wheelMeshes: ["front_tyre", "rear_tyre"],
    wheelCount: 3,
    wheelbase: 1.73,
  },
  {
    id: "passenger_three_wheeler",
    category: "three_wheeler",
    componentSet: "three_wheeler",
    kind: "Category representative passenger three-wheeler with an enclosed cabin.",
    build: () =>
      buildThreeWheeler({
        frontZ: 0.9, rearZ: -0.86, track: 0.58, closedSides: true, petrol: true,
        roofZ: [0.62, -1.0],
      }),
    wheelMeshes: ["front_tyre", "rear_tyre"],
    wheelCount: 3,
    wheelbase: 1.76,
  },
  {
    id: "cargo_three_wheeler",
    category: "three_wheeler",
    componentSet: "three_wheeler",
    kind: "Category representative cargo three-wheeler with an open load bed.",
    build: () =>
      buildThreeWheeler({
        frontZ: 0.92, rearZ: -0.84, track: 0.56, closedSides: false, petrol: true, cargo: true,
        roofZ: [0.55, 0.15],
      }),
    wheelMeshes: ["front_tyre", "rear_tyre"],
    wheelCount: 3,
    wheelbase: 1.76,
  },
  {
    id: "electric_three_wheeler",
    category: "three_wheeler",
    componentSet: "electric_three_wheeler",
    kind: "Category representative electric three-wheeler with a visible battery pack.",
    build: () =>
      buildThreeWheeler({
        frontZ: 0.95, rearZ: -0.78, track: 0.56, closedSides: true, petrol: false,
        roofZ: [0.62, -0.92],
      }),
    wheelMeshes: ["front_tyre", "rear_tyre"],
    wheelCount: 3,
    wheelbase: 1.73,
  },
  {
    id: "light_commercial",
    category: "commercial",
    componentSet: "commercial",
    kind: "Category representative light commercial vehicle (LCV panel van).",
    build: () =>
      buildCommercialLike({
        frontZ: 2.0, rearZ: -2.6, wheelR: 0.33, tyreT: 0.07, track: 0.78, halfWidth: 0.88,
        frameY: 0.46, floorY: 0.62, petrol: true, dualRear: false,
        cabinPoly: [[1.98, 0.5], [2.05, 1.4], [1.75, 1.95], [0.35, 1.98], [0.3, 0.55]],
        windWidth: 1.5, windHeight: 0.62, windY: 1.42, windZ: 1.93, windTilt: -0.22,
        bumperY: 0.5, lampY: 0.8, mirrorY: 1.5, mirrorZ: 1.75,
        cargoBody: { y: 1.28, z: -1.1, l: 2.7, h: 1.32 },
      }),
    wheelMeshes: ["front_left_wheel", "front_right_wheel", "rear_left_wheel", "rear_right_wheel"],
    wheelCount: 4,
    wheelbase: 4.6,
  },
  {
    id: "truck",
    category: "commercial",
    componentSet: "commercial",
    kind: "Category representative rigid truck (cab + cargo body).",
    build: () =>
      buildCommercialLike({
        frontZ: 2.6, rearZ: -3.6, wheelR: 0.5, tyreT: 0.1, track: 1.0, halfWidth: 1.22,
        frameY: 0.78, floorY: 1.0, petrol: true, dualRear: true,
        cabinPoly: [[2.55, 0.85], [2.6, 2.1], [2.25, 2.72], [0.95, 2.75], [0.9, 0.9]],
        windWidth: 1.7, windHeight: 0.78, windY: 1.92, windZ: 2.46, windTilt: -0.2,
        bumperY: 0.85, lampY: 1.15, mirrorY: 2.0, mirrorZ: 2.35,
        cargoBody: { y: 1.85, z: -1.35, l: 4.3, h: 1.95 },
      }),
    wheelMeshes: ["front_left_wheel", "front_right_wheel", "rear_left_wheel", "rear_right_wheel"],
    wheelCount: 6,
    wheelbase: 6.2,
  },
  {
    id: "bus",
    category: "commercial",
    componentSet: "commercial",
    kind: "Category representative passenger bus.",
    build: () =>
      buildCommercialLike({
        frontZ: 4.3, rearZ: -4.7, wheelR: 0.5, tyreT: 0.1, track: 1.05, halfWidth: 1.26,
        frameY: 0.72, floorY: 0.95, petrol: true, dualRear: true,
        cabinPoly: [[4.35, 0.8], [4.4, 2.55], [4.1, 3.05], [-4.6, 3.05], [-4.65, 0.85]],
        windWidth: 1.9, windHeight: 0.95, windY: 2.05, windZ: 4.2, windTilt: -0.18,
        bumperY: 0.8, lampY: 1.05, mirrorY: 2.3, mirrorZ: 4.0,
        cargoBody: null,
        sideWindows: [
          { id: "side_window_left", label: "Left Side Glazing", x: 1.27, y: 2.1, z: 0.2, h: 0.85, l: 7.6, anchor: [1, 0.3, 0],
            unmapped: "The commercial component set in vehicle-categories.json has no side-window id. Add `side_window_left` / `side_window_right` to bind glazing damage records." },
          { id: "side_window_right", label: "Right Side Glazing", x: -1.27, y: 2.1, z: 0.2, h: 0.85, l: 7.6, anchor: [-1, 0.3, 0],
            unmapped: "The commercial component set in vehicle-categories.json has no side-window id. Add `side_window_left` / `side_window_right` to bind glazing damage records." },
        ],
      }),
    wheelMeshes: ["front_left_wheel", "front_right_wheel", "rear_left_wheel", "rear_right_wheel"],
    wheelCount: 6,
    wheelbase: 9.0,
  },
  {
    id: "electric_commercial",
    category: "commercial",
    componentSet: "commercial_electric",
    kind: "Category representative electric commercial van with a visible battery pack.",
    build: () =>
      buildCommercialLike({
        frontZ: 2.1, rearZ: -2.7, wheelR: 0.34, tyreT: 0.07, track: 0.8, halfWidth: 0.9,
        frameY: 0.48, floorY: 0.64, petrol: false, dualRear: false,
        cabinPoly: [[2.08, 0.52], [2.15, 1.45], [1.85, 2.0], [0.35, 2.02], [0.3, 0.57]],
        windWidth: 1.54, windHeight: 0.64, windY: 1.46, windZ: 2.03, windTilt: -0.22,
        bumperY: 0.52, lampY: 0.82, mirrorY: 1.55, mirrorZ: 1.85,
        cargoBody: { y: 1.32, z: -1.15, l: 2.8, h: 1.32 },
      }),
    wheelMeshes: ["front_left_wheel", "front_right_wheel", "rear_left_wheel", "rear_right_wheel"],
    wheelCount: 4,
    wheelbase: 4.8,
  },
];

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------
function geoBounds(geos) {
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const sub of geos) {
    for (let i = 0; i < sub.g.p.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = sub.g.p[i + k];
        if (v < min[k]) min[k] = v;
        if (v > max[k]) max[k] = v;
      }
    }
  }
  return { min, max };
}
function anchorFor(geos, dir) {
  const b = geoBounds(geos);
  const c = [
    (b.min[0] + b.max[0]) / 2,
    (b.min[1] + b.max[1]) / 2,
    (b.min[2] + b.max[2]) / 2,
  ];
  let best = null;
  let bestScore = -Infinity;
  for (const sub of geos) {
    const g = sub.g;
    for (let t = 0; t < g.i.length; t += 3) {
      const ia = g.i[t], ib = g.i[t + 1], ic = g.i[t + 2];
      const cx = (g.p[ia * 3] + g.p[ib * 3] + g.p[ic * 3]) / 3;
      const cy = (g.p[ia * 3 + 1] + g.p[ib * 3 + 1] + g.p[ic * 3 + 1]) / 3;
      const cz = (g.p[ia * 3 + 2] + g.p[ib * 3 + 2] + g.p[ic * 3 + 2]) / 3;
      const score = (cx - c[0]) * dir[0] + (cy - c[1]) * dir[1] + (cz - c[2]) * dir[2];
      if (score > bestScore) {
        bestScore = score;
        best = [cx, cy, cz];
      }
    }
  }
  if (!best) return c.map((v) => round(v, 4));
  return best.map((v) => round(v, 4));
}
function round(v, d) {
  const f = Math.pow(10, d);
  return Math.round(v * f) / f;
}

// ---------------------------------------------------------------------------
// GLB writer
// ---------------------------------------------------------------------------
function buildGlb(parts, materials, matIndex) {
  const buffers = [];
  let byteLength = 0;
  const align4 = (n) => (n + 3) & ~3;

  const gltf = {
    asset: {
      version: "2.0",
      generator: GENERATOR,
      copyright: "Original work — dedicated to TrustDrive. No third-party model was used.",
    },
    scene: 0,
    scenes: [{ name: "Scene", nodes: [] }],
    nodes: [],
    meshes: [],
    materials: [],
    accessors: [],
    bufferViews: [],
    buffers: [{ byteLength: 0 }],
  };

  const pushBufferView = (data, target) => {
    const pad = align4(byteLength) - byteLength;
    if (pad > 0) {
      buffers.push(Buffer.alloc(pad));
      byteLength += pad;
    }
    const offset = byteLength;
    buffers.push(data);
    byteLength += data.length;
    gltf.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length, target });
    return gltf.bufferViews.length - 1;
  };

  const groupOrder = [];
  const groupIndex = new Map();
  const ensureGroup = (name) => {
    if (!groupIndex.has(name)) {
      groupIndex.set(name, groupOrder.length);
      groupOrder.push(name);
    }
    return groupIndex.get(name);
  };

  // root node
  const rootIndex = gltf.nodes.length;
  gltf.nodes.push({ name: "Vehicle", children: [] });
  gltf.scenes[0].nodes.push(rootIndex);

  const groupNodes = new Map();

  const meshForPart = (pt) => {
    const primitives = [];
    for (const sub of pt.geo) {
      const g = sub.g;
      if (!g) {
        console.error("BAD PART", pt.id, JSON.stringify(sub).slice(0, 200));
        process.exit(9);
      }
      const pos = Buffer.from(new Float32Array(g.p).buffer);
      const nrm = Buffer.from(new Float32Array(g.n).buffer);
      const idxCount = g.i.length;
      const use32 = g.p.length / 3 > 65535;
      const idx = use32
        ? Buffer.from(new Uint32Array(g.i).buffer)
        : Buffer.from(new Uint16Array(g.i).buffer);

      let min = [Infinity, Infinity, Infinity];
      let max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < g.p.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          const v = g.p[i + k];
          if (v < min[k]) min[k] = v;
          if (v > max[k]) max[k] = v;
        }
      }
      const posView = pushBufferView(pos, 34962);
      const nrmView = pushBufferView(nrm, 34962);
      const idxView = pushBufferView(idx, 34963);
      const posAcc = gltf.accessors.length;
      gltf.accessors.push({
        bufferView: posView,
        componentType: 5126,
        count: g.p.length / 3,
        type: "VEC3",
        min: min.map((v) => round(v, 5)),
        max: max.map((v) => round(v, 5)),
      });
      const nrmAcc = gltf.accessors.length;
      gltf.accessors.push({ bufferView: nrmView, componentType: 5126, count: g.p.length / 3, type: "VEC3" });
      const idxAcc = gltf.accessors.length;
      gltf.accessors.push({
        bufferView: idxView,
        componentType: use32 ? 5125 : 5123,
        count: idxCount,
        type: "SCALAR",
      });
      primitives.push({
        attributes: { POSITION: posAcc, NORMAL: nrmAcc },
        indices: idxAcc,
        material: matIndex.get(sub.mat),
        mode: 4,
      });
    }
    gltf.meshes.push({ name: pt.node || pt.id, primitives });
    return gltf.meshes.length - 1;
  };

  const nodeNameToIndex = new Map();

  // Group the parts by their GLB node name so that several primitives of the
  // same component (e.g. the two tail lamps) end up in ONE node/mesh. Parts
  // flagged `sharedMeshOf` do not emit geometry of their own — their geometry
  // already lives in the node they share.
  const groups = new Map();
  const order = [];
  for (const pt of parts) {
    const nodeName = pt.node || pt.id;
    if (!groups.has(nodeName)) {
      groups.set(nodeName, { nodeName, group: pt.group, geos: [], first: pt });
      order.push(nodeName);
    }
    const g = groups.get(nodeName);
    if (!pt.sharedMeshOf) g.geos.push(...pt.geo);
  }

  for (const nodeName of order) {
    const g = groups.get(nodeName);
    const meshIdx = meshForPart({ id: nodeName, node: nodeName, geo: g.geos });
    const gi = ensureGroup(g.group);
    if (!groupNodes.has(gi)) {
      const gIdx = gltf.nodes.length;
      gltf.nodes.push({ name: `Group_${groupOrder[gi]}`, children: [] });
      gltf.nodes[rootIndex].children.push(gIdx);
      groupNodes.set(gi, gIdx);
    }
    const nIdx = gltf.nodes.length;
    gltf.nodes.push({ name: nodeName, mesh: meshIdx });
    gltf.nodes[groupNodes.get(gi)].children.push(nIdx);
    nodeNameToIndex.set(nodeName, nIdx);
  }

  // materials
  gltf.materials = materials.map((m) => {
    const out = {
      name: m.name,
      pbrMetallicRoughness: {
        baseColorFactor: m.baseColorFactor,
        metallicFactor: m.metallicFactor ?? 1,
        roughnessFactor: m.roughnessFactor ?? 1,
      },
    };
    if (m.emissiveFactor) out.emissiveFactor = m.emissiveFactor;
    if (m.alphaMode) out.alphaMode = m.alphaMode;
    if (m.doubleSided) out.doubleSided = true;
    return out;
  });

  // assemble binary
  const bin = Buffer.concat(buffers);
  const padBin = align4(bin.length) - bin.length;
  const binFinal = padBin > 0 ? Buffer.concat([bin, Buffer.alloc(padBin)]) : bin;
  gltf.buffers[0].byteLength = binFinal.length;

  const jsonText = JSON.stringify(gltf);
  const jsonBuf = Buffer.from(jsonText, "utf8");
  const padJson = align4(jsonBuf.length) - jsonBuf.length;
  const jsonFinal = padJson > 0 ? Buffer.concat([jsonBuf, Buffer.alloc(padJson, 0x20)]) : jsonBuf;

  const total = 12 + 8 + jsonFinal.length + 8 + binFinal.length;
  const out = Buffer.alloc(total);
  let o = 0;
  out.writeUInt32LE(0x46546c67, o); o += 4; // 'glTF'
  out.writeUInt32LE(2, o); o += 4;
  out.writeUInt32LE(total, o); o += 4;
  out.writeUInt32LE(jsonFinal.length, o); o += 4;
  out.writeUInt32LE(0x4e4f534a, o); o += 4; // 'JSON'
  jsonFinal.copy(out, o); o += jsonFinal.length;
  out.writeUInt32LE(binFinal.length, o); o += 4;
  out.writeUInt32LE(0x004e4942, o); o += 4; // 'BIN'
  binFinal.copy(out, o);
  return out;
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------
const LICENSE_TEXT = "Original work — dedicated to TrustDrive (all rights reserved by the project owner)";
const SUPPORTED_INTERACTIONS = [
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
];

function componentCategoryFallback(id) {
  if (/tyre|wheel|brake/.test(id)) return CAT.wheels;
  if (/headlight|taillight|tail_light|headlights|taillights/.test(id)) return CAT.lighting;
  if (/engine|motor|battery|exhaust|charging|controller|wiring|fuel_tank/.test(id)) return CAT.powertrain;
  if (/chassis|axle|suspension|fork|frame/.test(id)) return CAT.chassis;
  if (/seat|saddle/.test(id)) return CAT.interior;
  if (/glass|windshield|windscreen|window/.test(id)) return CAT.glass;
  if (/plate/.test(id)) return CAT.trim;
  return CAT.exterior;
}

function buildManifest(assetDef, parts, glbBuffer, materials, matIndex, componentSetIds, timestamp) {
  const sha = crypto.createHash("sha256").update(glbBuffer).digest("hex");

  // group parts by component id
  const byId = new Map();
  const unmapped = [];
  for (const pt of parts) {
    if (pt.unmapped) {
      unmapped.push({ node: pt.id, reason: pt.unmapped });
      continue;
    }
    if (!byId.has(pt.id)) byId.set(pt.id, []);
    byId.get(pt.id).push(pt);
  }

  const allGeos = parts.filter((p) => !p.unmapped).flatMap((p) => p.geo);
  const assetBounds = geoBounds(allGeos);
  const assetCentre = [
    (assetBounds.min[0] + assetBounds.max[0]) / 2,
    (assetBounds.min[1] + assetBounds.max[1]) / 2,
    (assetBounds.min[2] + assetBounds.max[2]) / 2,
  ];

  const components = [];
  for (const id of componentSetIds) {
    const group = byId.get(id);
    if (!group || group.length === 0) {
      components.push({
        id,
        label: id,
        category: componentCategoryFallback(id),
        available: false,
        meshSeparable: false,
        primaryNode: null,
        nodes: [],
        explosionVector: [0, 0, 0],
        hotspotAnchor: [
          round(assetCentre[0], 4),
          round(assetCentre[1], 4),
          round(assetCentre[2], 4),
        ],
        selectionBounds: {
          min: { x: round(assetCentre[0], 4), y: round(assetCentre[1], 4), z: round(assetCentre[2], 4) },
          max: { x: round(assetCentre[0], 4), y: round(assetCentre[1], 4), z: round(assetCentre[2], 4) },
        },
        xrayRole: "exterior",
        paintRole: "none",
        trademarked: false,
        description: "",
        unavailableReason: `Not present on the ${assetDef.id} category representative.`,
      });
      continue;
    }
    const geos = group.flatMap((p) => p.geo);
    const b = geoBounds(geos);
    const centre = [
      (b.min[0] + b.max[0]) / 2,
      (b.min[1] + b.max[1]) / 2,
      (b.min[2] + b.max[2]) / 2,
    ];
    const nodes = [];
    for (const p of group) {
      const nm = p.node || p.id;
      if (!nodes.includes(nm)) nodes.push(nm);
    }
    const shared = group.find((p) => p.sharedMeshOf);
    const meshSeparable = !shared;

    // explosion vector derived from the measured position of the component
    let ev = [0, 0, 0];
    if (meshSeparable) {
      const dx = centre[0] - assetCentre[0];
      const dy = (centre[1] - assetCentre[1]) * 0.5;
      const dz = centre[2] - assetCentre[2];
      const len = Math.hypot(dx, dy, dz);
      if (len > 1e-3) {
        ev = [round((dx / len) * 0.5, 4), round((dy / len) * 0.5, 4), round((dz / len) * 0.5, 4)];
      } else {
        ev = [0, 0.5, 0];
      }
    }

    const anchorDir = group[0].anchorDir || [0, 1, 0];
    const anchor = anchorFor(geos, anchorDir);
    const label = group[0].label;

    components.push({
      id,
      label,
      category: group[0].category,
      available: true,
      meshSeparable,
      primaryNode: nodes[0],
      nodes,
      explosionVector: ev,
      hotspotAnchor: anchor,
      selectionBounds: {
        min: { x: round(b.min[0], 4), y: round(b.min[1], 4), z: round(b.min[2], 4) },
        max: { x: round(b.max[0], 4), y: round(b.max[1], 4), z: round(b.max[2], 4) },
      },
      xrayRole: group[0].xrayRole,
      paintRole: group[0].paintRole,
      trademarked: false,
      description: group.map((p) => p.description).filter(Boolean).join(" ") || `${label} of the ${assetDef.id} category representative.`,
    });
  }

  const availableList = components.filter((c) => c.available);
  const unavailableList = components.filter((c) => !c.available);
  const nonSeparableList = components.filter((c) => c.available && !c.meshSeparable);

  const nodeNames = [];
  for (const p of parts) nodeNames.push(p.node || p.id);

  const manifest = {
    modelId: assetDef.id,
    modelVersion: "1.0.0",
    generatedAt: timestamp,
    generatedBy: "scripts/build-vehicle-models.mjs (original procedural generator; measured from the generated geometry)",
    filePath: `public/models/vehicles/${assetDef.id}.glb`,
    publicUrl: `/models/vehicles/${assetDef.id}.glb`,
    sha256: sha,
    fileSizeBytes: glbBuffer.length,
    asset: {
      generator: GENERATOR,
      assetKind: "original procedural category representative",
      category: assetDef.category,
      componentSet: assetDef.componentSet,
      vehicleClass: assetDef.category,
      wheelCount: assetDef.wheelCount,
      wheelbaseMeters: assetDef.wheelbase,
      nodeCount: 0, // filled below
      meshCount: 0,
      namedMeshCount: 0,
      materialCount: materials.length,
      imageCount: 0,
      textureCount: 0,
      animationCount: 0,
      skinCount: 0,
      extensionsUsed: [],
      extensionsRequired: [],
      requiresDraco: false,
      requiresMeshopt: false,
    },
    dimensionsMeters: {
      length: round(assetBounds.max[2] - assetBounds.min[2], 3),
      width: round(assetBounds.max[0] - assetBounds.min[0], 3),
      height: round(assetBounds.max[1] - assetBounds.min[1], 3),
    },
    bounds: {
      min: {
        x: round(assetBounds.min[0], 4),
        y: round(assetBounds.min[1], 4),
        z: round(assetBounds.min[2], 4),
      },
      max: {
        x: round(assetBounds.max[0], 4),
        y: round(assetBounds.max[1], 4),
        z: round(assetBounds.max[2], 4),
      },
    },
    coordinateSystem: {
      up: "+Y",
      forward: "+Z",
      vehicleLeft: "+X",
      units: "metres",
      note: `Measured from the generated asset: front is at +Z ${round(assetBounds.max[2], 3)} m and the rear at -Z ${round(assetBounds.min[2], 3)} m. Wheels rest exactly on y = 0.`,
    },
    license: LICENSE_TEXT,
    licenseUrl: null,
    attribution: {
      creator: "TrustDrive (original procedural asset)",
      organization: "TrustDrive",
      copyrightHolder: "TrustDrive project owner",
      year: "2026",
      source: "scripts/build-vehicle-models.mjs",
    },
    licenseExclusions:
      "None. The asset contains no third-party geometry, texture, logo or trademark. It is an original category representative and must never be presented as a specific real make/model.",
    modifications: [
      "None. The GLB is served byte-for-byte as generated by scripts/build-vehicle-models.mjs.",
    ],
    supportedInteractions: SUPPORTED_INTERACTIONS,
    components,
    availability: {
      totalRegistered: components.length,
      availableCount: availableList.length,
      unavailableCount: unavailableList.length,
      nonSeparableCount: nonSeparableList.length,
      availableList: availableList.map((c) => ({
        id: c.id,
        label: c.label,
        primaryNode: c.primaryNode,
        nodeCount: c.nodes.length,
        separable: c.meshSeparable,
      })),
      unavailableList: unavailableList.map((c) => ({
        id: c.id,
        label: c.label,
        reason: c.unavailableReason,
        alternativeId: null,
      })),
      nonSeparableList: nonSeparableList.map((c) => ({
        id: c.id,
        label: c.label,
        sharesNodeWith: c.primaryNode,
      })),
    },
    unmappedAssetNodes: unmapped.map((u) => ({ node: u.node, reason: u.reason })),
    integrity: {
      note: "The SHA-256 above proves the served file is the audited file. It says nothing about the authenticity of any document.",
    },
  };
  return manifest;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("usage: node scripts/build-vehicle-models.mjs [--list] [--only=id1,id2]");
    return;
  }
  const categories = JSON.parse(fs.readFileSync(CATEGORIES_PATH, "utf8"));
  const componentSets = categories.componentSets || {};

  if (args.includes("--list")) {
    console.log("TrustDrive procedural vehicle assets:");
    for (const a of ASSETS) {
      console.log(`  ${a.id.padEnd(24)} ${a.componentSet.padEnd(22)} ${a.wheelCount} wheels · ${a.wheelbase} m wheelbase`);
    }
    return;
  }

  const onlyArg = args.find((a) => a.startsWith("--only="));
  const only = onlyArg ? onlyArg.slice(7).split(",").map((s) => s.trim()).filter(Boolean) : null;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(MANIFEST_DIR, { recursive: true });

  const timestamp =
    process.env.TRUSTDRIVE_ASSET_TIMESTAMP || new Date().toISOString();

  const results = [];
  for (const def of ASSETS) {
    if (only && !only.includes(def.id)) continue;
    const setIds = componentSets[def.componentSet]?.components;
    if (!setIds) {
      console.error(`! ${def.id}: unknown component set "${def.componentSet}"`);
      process.exitCode = 1;
      continue;
    }
    const rand = mulberry32(seedFrom(def.id));
    void rand; // deterministic seed reserved for future detail variation
    const { parts } = def.build();
    const mats = materialSet(PAINTS[def.id] || [0.6, 0.6, 0.6]);
    const matIndex = mats.index;

    // sanity: every component id of the set must be present in the geometry
    const present = new Set(parts.filter((p) => !p.unmapped).map((p) => p.id));
    const missing = setIds.filter((id) => !present.has(id));
    if (missing.length) {
      console.error(`! ${def.id}: component set ids without geometry: ${missing.join(", ")}`);
      process.exitCode = 1;
    }

    const glb = buildGlb(parts, mats.list, matIndex);
    const manifest = buildManifest(def, parts, glb, mats.list, matIndex, setIds, timestamp);

    // node/mesh counts measured from the generated GLB
    const glbJson = JSON.parse(
      glb.subarray(20, 20 + glb.readUInt32LE(12)).toString("utf8")
    );
    manifest.asset.nodeCount = glbJson.nodes.length;
    manifest.asset.meshCount = glbJson.meshes.length;
    manifest.asset.namedMeshCount = glbJson.meshes.filter((m) => m.name).length;

    const glbPath = path.join(OUT_DIR, `${def.id}.glb`);
    fs.writeFileSync(glbPath, glb);
    const manifestPath = path.join(MANIFEST_DIR, `${def.id}.json`);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

    results.push({
      id: def.id,
      file: path.relative(REPO, glbPath),
      bytes: glb.length,
      sha256: manifest.sha256,
      dims: manifest.dimensionsMeters,
      nodes: manifest.asset.nodeCount,
      meshes: manifest.asset.meshCount,
      components: manifest.components.length,
      available: manifest.availability.availableCount,
    });
  }

  console.log(`TrustDrive procedural vehicle assets — ${results.length} built\n`);
  console.log(
    "asset".padEnd(24),
    "bytes".padStart(9),
    "nodes".padStart(6),
    "meshes".padStart(7),
    "cmp".padStart(4),
    "L x W x H (m)".padStart(20),
    "  sha256"
  );
  for (const r of results) {
    console.log(
      r.id.padEnd(24),
      String(r.bytes).padStart(9),
      String(r.nodes).padStart(6),
      String(r.meshes).padStart(7),
      String(r.components).padStart(4),
      `${r.dims.length} x ${r.dims.width} x ${r.dims.height}`.padStart(20),
      "  " + r.sha256.slice(0, 16) + "…"
    );
  }
}

main();
