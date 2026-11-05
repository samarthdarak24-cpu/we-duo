/**
 * TrustDrive 3D Vehicle Component Registry
 *
 * Every node name, bounding region and anchor in this file was measured from the
 * shipped asset (`public/models/vehicles/trustdrive-sedan.glb`) with
 * `scripts/glb-bounds.mjs`; nothing is asserted from memory. Re-run
 * `scripts/verify-registry.mjs` after editing to keep the registry and the asset
 * provably in sync.
 *
 * Asset coordinate frame (measured): +Y up, +Z forward (bonnet), +X vehicle-left.
 * Units are metres; the asset is 4.357 x 1.308 x 4.357 m at rest.
 */

export type ComponentCategory =
  | "exterior_body"
  | "closure"
  | "lighting"
  | "wheels_brakes"
  | "powertrain"
  | "chassis_structure"
  | "interior"
  | "glass"
  | "trim";

/** How a component is rendered in X-Ray mode. */
export type XrayRole =
  | "exterior" // ghosted so internals can be seen through it
  | "glass" // ghosted
  | "mechanical" // kept solid — real internal hardware
  | "structure" // kept solid — real safety structure
  | "interior"; // kept solid — real cabin content

export interface Point {
  x: number;
  y: number;
  z: number;
}

export interface SelectionBounds {
  min: Point;
  max: Point;
}

export interface VehicleComponentDef {
  id: string;
  label: string;
  category: ComponentCategory;
  available: boolean;
  unavailableReason?: string;
  alternativeComponentId?: string;
  /** Node whose transform drives the exploded position of this component. */
  primaryNode?: string;
  /** Real node/mesh names in the GLB that belong to this component. */
  associatedNodes: string[];
  /** Displacement at exploded = 1.0. Zero when the mesh is not separable. */
  explosionVector: [number, number, number];
  /** Asset-space surface anchor used when a damage record has no stored position. */
  defaultHotspotAnchor: [number, number, number];
  /** Asset-space region used to disambiguate shared meshes on click. */
  selectionBounds: SelectionBounds;
  /**
   * False when the component's geometry is part of a larger mesh that also
   * carries another component — it can then be selected and highlighted but
   * cannot be disassembled on its own.
   */
  meshSeparable: boolean;
  xrayRole: XrayRole;
  /** True when the surface carries a logo the asset licence excludes. */
  trademarked?: boolean;
  /** Paint finish applied to this component in Normal/Damage modes. */
  paintRole?: "primary" | "secondary" | "none";
  description: string;
}

/** Measured from the asset header and geometry (see scripts/inspect-glb.mjs). */
export const MODEL_ASSET = {
  id: "trustdrive-sedan",
  url: "/models/vehicles/trustdrive-sedan.glb",
  bytes: 11778688,
  generator: "Created by RapidPipeline 3D Processor v7.1.0 | rapidpipeline.com",
  nodeCount: 101,
  meshCount: 97,
  materialCount: 29,
  imageCount: 14,
  animationCount: 0,
  license: "Creative Commons Attribution 4.0 International (CC BY 4.0)",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/legalcode",
  attribution: {
    creator: "Eric Chadwick",
    organization: "Darmstadt Graphics Group GmbH (DGG)",
    copyrightHolder: "Khronos Group Inc.",
    year: "2024",
    source: "KhronosGroup/glTF-Sample-Assets — Models/CarConcept",
  },
  /** The asset ships Khronos / 3D Commerce artwork on two surfaces. CC BY 4.0
   *  covers the model, but its trademark notice excludes the logos, so those
   *  materials are replaced at runtime and never presented as a real plate. */
  licenseExclusions:
    "LicenseRef-LegalMark-Khronos: the Khronos and 3D Commerce logos on `License Plate` and `InteriorSteeringEmblem` are trademarks and are excluded from the CC BY 4.0 grant. TrustDrive substitutes a neutral material for both at runtime.",
  dimensionsMeters: { length: 4.357, width: 2.728, height: 1.308 },
  bounds: {
    min: { x: -1.369, y: -0.159, z: -1.94 },
    max: { x: 1.359, y: 1.149, z: 2.417 },
  },
} as const;

const box = (
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number
): SelectionBounds => ({
  min: { x: x0, y: y0, z: z0 },
  max: { x: x1, y: y1, z: z1 },
});

export const VEHICLE_COMPONENT_REGISTRY: VehicleComponentDef[] = [
  {
    id: "bonnet",
    label: "Bonnet / Engine Hood",
    category: "closure",
    available: true,
    primaryNode: "BodyHood",
    associatedNodes: [
      "BodyHood",
      "BodyHoodInterior01",
      "BodyHoodInterior02",
      "BodyHoodTopgrill",
      "BodyHoodUnder",
    ],
    explosionVector: [0, 0.85, 0.55],
    defaultHotspotAnchor: [0, 0.9, 1.78],
    selectionBounds: box(-1.106, 1.106, 0.129, 0.877, 1.168, 2.417),
    meshSeparable: true,
    xrayRole: "exterior",
    paintRole: "primary",
    description:
      "Hinged front hood assembly. In this asset the hood node also parents the headlight and top-grille meshes, so those lift with it during disassembly.",
  },
  {
    id: "front_bumper",
    label: "Front Bumper & Lower Fascia",
    category: "exterior_body",
    available: true,
    primaryNode: "BodyPanelsColor2",
    associatedNodes: ["BodyPanelsColor2"],
    explosionVector: [0, 0, 0],
    defaultHotspotAnchor: [0, 0.4, 2.44],
    selectionBounds: box(-1.111, 1.111, 0.108, 0.6, 1.6, 2.42),
    meshSeparable: false,
    xrayRole: "exterior",
    paintRole: "secondary",
    description:
      "Front lower fascia. The asset models the secondary-colour panels as one continuous mesh running the length of the car, so the front section is selected by position but cannot be detached separately.",
  },
  {
    id: "rear_bumper",
    label: "Rear Bumper & Lower Valance",
    category: "exterior_body",
    available: true,
    primaryNode: "BodyRearPanelsColor1",
    associatedNodes: ["BodyRearPanelsColor1"],
    explosionVector: [0, 0, 0],
    defaultHotspotAnchor: [0, 0.5, -1.93],
    selectionBounds: box(-1.118, 1.118, 0.347, 0.9, -1.95, -1.5),
    meshSeparable: false,
    xrayRole: "exterior",
    paintRole: "primary",
    description:
      "Rear lower valance. It shares the rear-panel mesh with the hatch, tail-light and rear-glass group, so it moves with that assembly rather than on its own.",
  },
  {
    id: "boot",
    label: "Boot Lid / Rear Hatch",
    category: "closure",
    available: true,
    primaryNode: "BodyRearPanelsColor1",
    associatedNodes: ["InteriorRearHatch"],
    explosionVector: [0, 0.75, -0.45],
    defaultHotspotAnchor: [0, 1.14, -1.05],
    selectionBounds: box(-0.899, 0.899, 1.09, 1.15, -1.624, -0.429),
    meshSeparable: true,
    xrayRole: "exterior",
    paintRole: "primary",
    description:
      "Liftback hatch. The asset exposes it as `InteriorRearHatch` parented by the rear panel group; lifting that group opens the hatch together with the tail-lights and rear glass.",
  },
  {
    id: "roof",
    label: "Roof Panel & Pillars",
    category: "exterior_body",
    available: true,
    primaryNode: "BodyRoofPanel",
    associatedNodes: ["BodyRoofPanel", "BodyPillars"],
    explosionVector: [0, 0.95, 0],
    defaultHotspotAnchor: [0, 1.17, -0.08],
    selectionBounds: box(-1.107, 1.107, 1.05, 1.149, -0.472, 1.401),
    meshSeparable: true,
    xrayRole: "exterior",
    paintRole: "primary",
    description:
      "Roof panel and the greenhouse pillar frame (`BodyPillars`) that carries the side glass openings.",
  },
  {
    id: "mirrors",
    label: "Exterior Door Mirrors",
    category: "exterior_body",
    available: true,
    primaryNode: "BodyDoorLMirror",
    associatedNodes: [
      "BodyDoorLMirror",
      "BodyDoorLMirrorColor1",
      "BodyDoorLMirrorColor2",
      "BodyDoorRMirror",
      "BodyDoorRMirrorColor1",
      "BodyDoorRMirrorColor2",
    ],
    explosionVector: [0, 0, 0],
    defaultHotspotAnchor: [1.18, 0.95, 0.43],
    selectionBounds: box(-1.169, 1.169, 0.873, 1.014, 0.259, 0.597),
    meshSeparable: false,
    xrayRole: "exterior",
    paintRole: "secondary",
    description:
      "Both mirror housings. They are parented inside their door groups, so they travel with the door when it is opened in the exploded view.",
  },
  {
    id: "front_left_door",
    label: "Front Left Door Assembly",
    category: "closure",
    available: true,
    primaryNode: "BodyDoorLColor1",
    associatedNodes: [
      "BodyDoorLColor1",
      "BodyDoorLColor2",
      "BodyDoorLHandle01",
      "BodyDoorLHandle02",
      "BodyDoorLWindow",
      "BodyDoorLWindowGasket",
      "InteriorDoorL01",
      "InteriorDoorL02",
      "InteriorDoorL03",
      "InteriorDoorL04",
      "InteriorDoorL05",
      "InteriorDoorL06",
    ],
    explosionVector: [0.85, 0.05, 0.05],
    defaultHotspotAnchor: [1.13, 0.62, 0.16],
    selectionBounds: box(0.735, 1.11, 0.155, 1.115, -0.675, 0.994),
    meshSeparable: true,
    xrayRole: "exterior",
    paintRole: "primary",
    description:
      "Left-side door shell with its inner trim, handle, window and glass run channel. The `BodyDoorLColor1` node carries the hinge pivot at [1.09, -1, 0.64], which is what the exploded view swings.",
  },
  {
    id: "front_right_door",
    label: "Front Right Door Assembly",
    category: "closure",
    available: true,
    primaryNode: "BodyDoorRColor1",
    associatedNodes: [
      "BodyDoorRColor1",
      "BodyDoorRColor2",
      "BodyDoorRHandle01",
      "BodyDoorRHandle02",
      "BodyDoorRWindow",
      "BodyDoorRWindowGasket",
      "InteriorDoorR01",
      "InteriorDoorR02",
      "InteriorDoorR03",
      "InteriorDoorR04",
      "InteriorDoorR05",
      "InteriorDoorR06",
    ],
    explosionVector: [-0.85, 0.05, 0.05],
    defaultHotspotAnchor: [-1.13, 0.62, 0.16],
    selectionBounds: box(-1.11, -0.735, 0.155, 1.115, -0.675, 0.994),
    meshSeparable: true,
    xrayRole: "exterior",
    paintRole: "primary",
    description:
      "Right-side door shell with inner trim, handle, window and glass run channel, hinged on the `BodyDoorRColor1` pivot at [-1.09, -1, 0.64].",
  },
  {
    id: "rear_left_door",
    label: "Rear Left Door",
    category: "closure",
    available: false,
    unavailableReason:
      "The reference asset is a two-door coupé: `inspect-glb.mjs` finds only BodyDoorLColor1 and BodyDoorRColor1, with no rear door mesh on either side. Rear-left access is the quarter glass and rear panel.",
    alternativeComponentId: "rear_glass",
    associatedNodes: [],
    explosionVector: [0, 0, 0],
    defaultHotspotAnchor: [0.95, 1.0, -0.85],
    selectionBounds: box(0.923, 1.114, 0.958, 1.11, -1.147, -0.476),
    meshSeparable: false,
    xrayRole: "exterior",
    paintRole: "none",
    description:
      "Not present on this body style. Damage reported here is stored against the rear-left quarter region and shown without a 3D marker.",
  },
  {
    id: "rear_right_door",
    label: "Rear Right Door",
    category: "closure",
    available: false,
    unavailableReason:
      "The reference asset is a two-door coupé: `inspect-glb.mjs` finds only BodyDoorLColor1 and BodyDoorRColor1, with no rear door mesh on either side. Rear-right access is the quarter glass and rear panel.",
    alternativeComponentId: "rear_glass",
    associatedNodes: [],
    explosionVector: [0, 0, 0],
    defaultHotspotAnchor: [-0.95, 1.0, -0.85],
    selectionBounds: box(-1.114, -0.923, 0.958, 1.11, -1.147, -0.476),
    meshSeparable: false,
    xrayRole: "exterior",
    paintRole: "none",
    description:
      "Not present on this body style. Damage reported here is stored against the rear-right quarter region and shown without a 3D marker.",
  },
  {
    id: "windshield",
    label: "Windscreen & Wipers",
    category: "glass",
    available: true,
    primaryNode: "BodyWindshield",
    associatedNodes: [
      "BodyWindshield",
      "BodyWindshieldGasket",
      "BodyWindshieldWipers",
      "BodyWindshieldWipersBase",
    ],
    explosionVector: [0, 0.4, 0.35],
    defaultHotspotAnchor: [0, 1.02, 1.1],
    selectionBounds: box(-0.879, 0.879, 0.759, 1.126, 0.069, 1.715),
    meshSeparable: true,
    xrayRole: "glass",
    paintRole: "none",
    description:
      "Laminated front glass with its rubber run channel and both wiper blades at the scuttle.",
  },
  {
    id: "rear_glass",
    label: "Rear Screen & Quarter Glass",
    category: "glass",
    available: true,
    primaryNode: "BodyRearwindow",
    associatedNodes: ["BodyRearwindow", "BodyWindowsRearSides"],
    explosionVector: [0, 0, 0],
    defaultHotspotAnchor: [0, 1.05, -0.95],
    selectionBounds: box(-0.923, 0.923, 0.95, 1.09, -1.629, -0.432),
    meshSeparable: false,
    xrayRole: "glass",
    paintRole: "none",
    description:
      "Rear screen plus the fixed side quarter lights. Both are parented to the rear hatch group and open with it.",
  },
  {
    id: "front_left_wheel",
    label: "Front Left Wheel & Brakes",
    category: "wheels_brakes",
    available: true,
    primaryNode: "WheelFrontL",
    associatedNodes: [
      "WheelFrontL",
      "WheelFrontLRim",
      "WheelFrontLBrakeDisc",
      "WheelFrontLBrakePad",
    ],
    explosionVector: [0.7, 0, 0],
    defaultHotspotAnchor: [1.38, 0.38, 1.48],
    selectionBounds: box(0.592, 1.359, -0.141, 0.927, 0.944, 2.024),
    meshSeparable: true,
    xrayRole: "mechanical",
    paintRole: "none",
    description:
      "Tyre, rim, ventilated disc and pad on the `WheelFrontL` node. The tyre itself is an unnamed two-primitive mesh, so it is resolved through its parent node.",
  },
  {
    id: "front_right_wheel",
    label: "Front Right Wheel & Brakes",
    category: "wheels_brakes",
    available: true,
    primaryNode: "WheelFrontR",
    associatedNodes: [
      "WheelFrontR",
      "WheelFrontRRim",
      "WheelFrontRBrakeDisc",
      "WheelFrontRBrakePad",
    ],
    explosionVector: [-0.7, 0, 0],
    defaultHotspotAnchor: [-1.38, 0.38, 1.48],
    selectionBounds: box(-1.369, -0.584, -0.159, 0.927, 0.944, 2.024),
    meshSeparable: true,
    xrayRole: "mechanical",
    paintRole: "none",
    description:
      "Tyre, rim, ventilated disc and pad on the `WheelFrontR` node, resolved through its parent when the unnamed tyre mesh is clicked.",
  },
  {
    id: "rear_left_wheel",
    label: "Rear Left Wheel & Brakes",
    category: "wheels_brakes",
    available: true,
    primaryNode: "WheelRearL",
    associatedNodes: [
      "WheelRearL",
      "WheelRearLRim",
      "WheelRearLBrakeDisc",
      "WheelRearLBrakePad",
    ],
    explosionVector: [0.7, 0, 0],
    defaultHotspotAnchor: [1.14, 0.38, -1.31],
    selectionBounds: box(0.843, 1.127, -0.108, 0.876, -1.806, -0.822),
    meshSeparable: true,
    xrayRole: "mechanical",
    paintRole: "none",
    description:
      "Rear-left tyre, rim, disc and pad on the `WheelRearL` node.",
  },
  {
    id: "rear_right_wheel",
    label: "Rear Right Wheel & Brakes",
    category: "wheels_brakes",
    available: true,
    primaryNode: "WheelRearR",
    associatedNodes: [
      "WheelRearR",
      "WheelRearRRim",
      "WheelRearRBrakeDisc",
      "WheelRearRBrakePad",
    ],
    explosionVector: [-0.7, 0, 0],
    defaultHotspotAnchor: [-1.14, 0.38, -1.31],
    selectionBounds: box(-1.127, -0.842, -0.151, 0.919, -1.849, -0.779),
    meshSeparable: true,
    xrayRole: "mechanical",
    paintRole: "none",
    description:
      "Rear-right tyre, rim, disc and pad on the `WheelRearR` node.",
  },
  {
    id: "headlights",
    label: "Headlamp Assemblies",
    category: "lighting",
    available: true,
    primaryNode: "BodyHeadlights",
    associatedNodes: ["BodyHeadlights"],
    explosionVector: [0, 0, 0],
    defaultHotspotAnchor: [0.55, 0.66, 2.28],
    selectionBounds: box(-0.805, 0.805, 0.621, 0.691, 2.096, 2.267),
    meshSeparable: false,
    xrayRole: "exterior",
    paintRole: "none",
    description:
      "One `BodyHeadlights` mesh spanning both lamp clusters. It is parented to the hood node, so it lifts with the bonnet in the exploded view.",
  },
  {
    id: "taillights",
    label: "Tail & Signal Lamps",
    category: "lighting",
    available: true,
    primaryNode: "BodyTaillights",
    associatedNodes: [
      "BodyTaillights",
      "BodyTaillightsPanels",
      "BodyTurnsignalsRear",
    ],
    explosionVector: [0, 0, 0],
    defaultHotspotAnchor: [0, 0.98, -1.66],
    selectionBounds: box(-0.895, 0.895, 0.923, 1.002, -1.671, -1.194),
    meshSeparable: false,
    xrayRole: "exterior",
    paintRole: "none",
    description:
      "Rear lamp clusters, their lenses and the rear turn-signal strip, all parented to the rear hatch group.",
  },
  {
    id: "engine",
    label: "Engine Block",
    category: "powertrain",
    available: true,
    primaryNode: "Engine",
    associatedNodes: ["Engine"],
    explosionVector: [0, 0.45, 0.3],
    defaultHotspotAnchor: [0, 0.78, 1.95],
    selectionBounds: box(-0.602, 0.602, 0.14, 0.748, 1.603, 2.325),
    meshSeparable: true,
    xrayRole: "mechanical",
    paintRole: "none",
    description:
      "The single `Engine` mesh in the front bay. It is the only powertrain geometry this asset provides — there is no separate gearbox, driveshaft or exhaust mesh, so those are reported as unverified rather than drawn.",
  },
  {
    id: "suspension",
    label: "Axle & Suspension Frame",
    category: "chassis_structure",
    available: true,
    primaryNode: "Axles",
    associatedNodes: ["Axles"],
    explosionVector: [0, -0.35, 0],
    defaultHotspotAnchor: [0.95, 0.42, 1.3],
    selectionBounds: box(-1.053, 1.053, 0.289, 0.479, -1.409, 1.591),
    meshSeparable: true,
    xrayRole: "mechanical",
    paintRole: "none",
    description:
      "One `Axles` mesh carrying the front and rear axle geometry between the wheel hubs. No individual damper, spring or control-arm meshes exist in the asset, so they are not simulated.",
  },
  {
    id: "chassis",
    label: "Chassis Floor & Cage",
    category: "chassis_structure",
    available: true,
    primaryNode: "InteriorCage",
    associatedNodes: ["BodyUnderside", "InteriorCage"],
    explosionVector: [0, 0, 0],
    defaultHotspotAnchor: [0, 0.12, 0],
    selectionBounds: box(-1.094, 1.094, 0.089, 0.2, -1.894, 2.39),
    meshSeparable: false,
    xrayRole: "structure",
    paintRole: "none",
    description:
      "`BodyUnderside` is the root body tub that parents every other node, so it cannot be moved; the roll-over `InteriorCage` is the separable structural element.",
  },
  {
    id: "interior",
    label: "Cabin, Seats & Dashboard",
    category: "interior",
    available: true,
    primaryNode: "InteriorDashMid",
    associatedNodes: [
      "InteriorDashMid",
      "InteriorDashSides",
      "InteriorFloor",
      "InteriorFloormats",
      "InteriorMid",
      "InteriorPillar",
      "InteriorRearPanels",
      "InteriorPedalAccel",
      "InteriorPedalAccelArm",
      "InteriorPedalBrake",
      "InteriorPedalBrakeArm",
      "InteriorSeatsColor1",
      "InteriorSeatsColor2",
      "InteriorSeatsFrame1",
      "InteriorSeatsFrame2",
      "InteriorSteeringBase",
      "InteriorSteeringCylinder",
      "InteriorSteeringWheel01",
      "InteriorSteeringWheel02",
      "InteriorSteeringWheel03",
      "InteriorSteeringWheel04",
      "InteriorSteeringDash",
      "InteriorSteeringDashColumn",
      "InteriorSteeringHandleL",
      "InteriorSteeringHandleR",
    ],
    explosionVector: [0, 0.35, 0],
    defaultHotspotAnchor: [0, 0.95, -0.3],
    selectionBounds: box(-1.105, 1.105, 0.094, 1.114, -1.867, 1.662),
    meshSeparable: false,
    xrayRole: "interior",
    paintRole: "none",
    description:
      "Dashboard, floor, mats, seats, pedal set, pillar trim and the steering column assembly. Door trim panels are mapped to their door components instead.",
  },
  {
    id: "steering_emblem",
    label: "Steering Wheel Emblem",
    category: "trim",
    available: true,
    primaryNode: "InteriorSteeringEmblem",
    associatedNodes: ["InteriorSteeringEmblem"],
    explosionVector: [0, 0, 0],
    defaultHotspotAnchor: [0, 0.64, 0.97],
    selectionBounds: box(-0.022, 0.023, 0.613, 0.655, 0.95, 0.967),
    meshSeparable: true,
    xrayRole: "interior",
    trademarked: true,
    paintRole: "none",
    description:
      "Hub badge on the steering wheel. Like the rear plate it carries Khronos artwork that the licence excludes, so TrustDrive renders it as a blank disc.",
  },
  {
    id: "license_plate",
    label: "Rear Number Plate",
    category: "trim",
    available: true,
    primaryNode: "License Plate",
    associatedNodes: ["License Plate"],
    explosionVector: [0, 0, 0],
    defaultHotspotAnchor: [0, 0.32, -1.95],
    selectionBounds: box(-0.179, 0.179, 0.264, 0.366, -1.917, -1.884),
    meshSeparable: true,
    xrayRole: "exterior",
    trademarked: true,
    paintRole: "none",
    description:
      "Rear plate panel. The asset textures it with Khronos artwork, which its licence excludes, so TrustDrive renders it as a blank plate and never as a readable registration.",
  },
];

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------
const COMPONENT_BY_ID = new Map<string, VehicleComponentDef>();
const NODE_TO_COMPONENT = new Map<string, VehicleComponentDef>();

for (const comp of VEHICLE_COMPONENT_REGISTRY) {
  COMPONENT_BY_ID.set(comp.id, comp);
  for (const nodeName of comp.associatedNodes) {
    if (!NODE_TO_COMPONENT.has(nodeName)) NODE_TO_COMPONENT.set(nodeName, comp);
  }
  if (comp.primaryNode && !NODE_TO_COMPONENT.has(comp.primaryNode)) {
    NODE_TO_COMPONENT.set(comp.primaryNode, comp);
  }
}

const volumeOf = (b: SelectionBounds) =>
  Math.max(0.0001, b.max.x - b.min.x) *
  Math.max(0.0001, b.max.y - b.min.y) *
  Math.max(0.0001, b.max.z - b.min.z);

const CONTAINERS = VEHICLE_COMPONENT_REGISTRY.filter((c) => c.available).sort(
  (a, b) => volumeOf(a.selectionBounds) - volumeOf(b.selectionBounds)
);

/**
 * Resolve the component that owns a click.
 *
 * Two rules, in order:
 *  1. If the clicked node chain contains a mesh that belongs to a component with
 *     its own geometry, that component wins — even when another component's
 *     region overlaps it (the engine sits inside the hood's bounding box).
 *  2. Otherwise the mesh is one of the long shared panels (`BodyUnderside`,
 *     `BodyPanelsColor2`, `BodyRearPanelsColor1`, the door/mirror groups), and
 *     the smallest containing region decides.
 *
 * Mesh-name lookup alone cannot do this: the asset re-uses single meshes for
 * several panels, so the front fascia would otherwise be reported as "chassis".
 */
export function resolveComponentAtPoint(
  point: Point,
  nodeNameChain: string[] = []
): VehicleComponentDef | undefined {
  for (const name of nodeNameChain) {
    const owner = NODE_TO_COMPONENT.get(name);
    if (owner?.meshSeparable) return owner;
  }
  for (const comp of CONTAINERS) {
    if (inBounds(comp.selectionBounds, point)) return comp;
  }
  for (const name of nodeNameChain) {
    const owner = NODE_TO_COMPONENT.get(name);
    if (owner) return owner;
  }
  return undefined;
}

function inBounds(b: SelectionBounds, p: Point, pad = 0.03) {
  return (
    p.x >= b.min.x - pad &&
    p.x <= b.max.x + pad &&
    p.y >= b.min.y - pad &&
    p.y <= b.max.y + pad &&
    p.z >= b.min.z - pad &&
    p.z <= b.max.z + pad
  );
}

/** Component definition by canonical ID. */
export function getComponentById(id: string): VehicleComponentDef | undefined {
  return COMPONENT_BY_ID.get(id);
}

/** Component definition by GLTF node or mesh name. */
export function getComponentByMeshName(meshName: string): VehicleComponentDef | undefined {
  const exact = NODE_TO_COMPONENT.get(meshName);
  if (exact) return exact;
  for (const comp of VEHICLE_COMPONENT_REGISTRY) {
    for (const node of comp.associatedNodes) {
      if (meshName.includes(node) || node.includes(meshName)) return comp;
    }
  }
  return undefined;
}

export function getAllComponents(): VehicleComponentDef[] {
  return VEHICLE_COMPONENT_REGISTRY;
}

export function getAvailableComponents(): VehicleComponentDef[] {
  return VEHICLE_COMPONENT_REGISTRY.filter((c) => c.available);
}

/** Nodes that must never show the asset's Khronos artwork. */
export const TRADEMARK_NODES = VEHICLE_COMPONENT_REGISTRY.filter((c) => c.trademarked).flatMap(
  (c) => [c.primaryNode, ...c.associatedNodes].filter(Boolean) as string[]
);

/**
 * Legacy / database zone IDs to canonical component IDs.
 * `door_rr` and `door_rl` stay resolvable because older damage rows use them,
 * but they land on the rear quarter because the asset has no rear door mesh.
 */
export function mapZoneToComponentId(zoneId: string): string {
  const norm = zoneId.toLowerCase().trim().replace(/[-\s]/g, "_");
  if (COMPONENT_BY_ID.has(norm)) return norm;

  switch (norm) {
    case "door_fl":
    case "left_front_door":
    case "driver_door":
      return "front_left_door";
    case "door_fr":
    case "right_front_door":
    case "passenger_door":
      return "front_right_door";
    case "door_rr":
    case "door_rl":
    case "rear_door":
    case "quarter_panel":
      return "rear_glass";
    case "hood":
      return "bonnet";
    case "trunk":
      return "boot";
    case "windscreen":
      return "windshield";
    case "wheels":
    case "wheel":
      return "front_left_wheel";
    case "plate":
    case "number_plate":
      return "license_plate";
    default:
      return norm;
  }
}

// ---------------------------------------------------------------------------
// Availability report
// ---------------------------------------------------------------------------
export interface ComponentAvailabilityReport {
  totalRegistered: number;
  availableCount: number;
  unavailableCount: number;
  nonSeparableCount: number;
  availableList: Array<{
    id: string;
    label: string;
    primaryNode?: string;
    nodeCount: number;
    separable: boolean;
  }>;
  unavailableList: Array<{
    id: string;
    label: string;
    reason: string;
    alternativeId?: string;
  }>;
  nonSeparableList: Array<{ id: string; label: string; sharesNodeWith: string }>;
}

export function getComponentAvailabilityReport(): ComponentAvailabilityReport {
  const available = VEHICLE_COMPONENT_REGISTRY.filter((c) => c.available);
  const unavailable = VEHICLE_COMPONENT_REGISTRY.filter((c) => !c.available);
  const nonSeparable = available.filter((c) => !c.meshSeparable);

  return {
    totalRegistered: VEHICLE_COMPONENT_REGISTRY.length,
    availableCount: available.length,
    unavailableCount: unavailable.length,
    nonSeparableCount: nonSeparable.length,
    availableList: available.map((c) => ({
      id: c.id,
      label: c.label,
      primaryNode: c.primaryNode,
      nodeCount: c.associatedNodes.length,
      separable: c.meshSeparable,
    })),
    unavailableList: unavailable.map((c) => ({
      id: c.id,
      label: c.label,
      reason: c.unavailableReason || "Not present on this chassis body style",
      alternativeId: c.alternativeComponentId,
    })),
    nonSeparableList: nonSeparable.map((c) => ({
      id: c.id,
      label: c.label,
      sharesNodeWith: c.primaryNode || c.associatedNodes[0] || "shared body mesh",
    })),
  };
}
