# TrustDrive — Vehicle 3D Component Availability Report

**Model:** `trustdrive-sedan` (Executive Concept Coupe / Sedan)  
**File:** `/models/vehicles/trustdrive-sedan.glb`  
**License:** CC BY 4.0 (Khronos Group / Eric Chadwick, DGG)  
**Total Registered Components:** 20  
**Available & Selectable Components:** 18 (90%)  
**Unavailable Components:** 2 (10%)  

---

## 1. Available Components Matrix

| Component ID | Label | Category | Primary GLB Mesh/Node | Associated Nodes | Exploded Vector (X, Y, Z) | Anchor Position |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `bonnet` | Bonnet / Engine Hood | Closure | `BodyHood` | `BodyHood`, `BodyHoodTopgrill`, `BodyHoodUnder`, `BodyHoodInterior01`, `BodyHoodInterior02` | `[0, 0.85, 0.55]` | `[0, 0.72, 1.45]` |
| `front_bumper` | Front Bumper & Fascia | Exterior Body | `BodyUnderside` | `BodyUnderside`, `BodyHeadlights` | `[0, 0, 0.65]` | `[0, 0.32, 2.15]` |
| `rear_bumper` | Rear Bumper & Lower Valance | Exterior Body | `BodyRearPanelsColor1` | `BodyRearPanelsColor1`, `BodyTurnsignalsRear`, `BodyTaillightsPanels` | `[0, 0.15, -0.65]` | `[0, 0.38, -2.12]` |
| `boot` | Boot / Trunk Lid | Closure | `BodyRearPanelsColor1` | `BodyRearPanelsColor1`, `InteriorRearHatch`, `BodyRearwindow` | `[0, 0.75, -0.45]` | `[0, 0.82, -1.85]` |
| `roof` | Roof Panel & Pillars | Exterior Body | `BodyRoofPanel` | `BodyRoofPanel`, `BodyPillars`, `BodyPanelsColor2` | `[0, 0.95, 0]` | `[0, 1.32, 0.10]` |
| `front_left_door` | Front Left Door Assembly | Closure | `BodyDoorLColor1` | 15 Left Door child nodes (skin, mirror, glass, inner cards) | `[0.75, 0.1, 0.05]` | `[1.12, 0.65, 0.75]` |
| `front_right_door` | Front Right Door Assembly | Closure | `BodyDoorRColor1` | 15 Right Door child nodes (skin, mirror, glass, inner cards) | `[-0.75, 0.1, 0.05]` | `[-1.12, 0.65, 0.75]` |
| `front_left_wheel` | Front Left Wheel & Brake | Wheels / Brakes | `WheelFrontL` | `WheelFrontL`, `WheelFrontLRim`, `WheelFrontLBrakeDisc`, `WheelFrontLBrakePad` | `[0.65, 0, 0]` | `[1.02, 0.38, 1.48]` |
| `front_right_wheel` | Front Right Wheel & Brake | Wheels / Brakes | `WheelFrontR` | `WheelFrontR`, `WheelFrontRRim`, `WheelFrontRBrakeDisc`, `WheelFrontRBrakePad` | `[-0.65, 0, 0]` | `[-1.02, 0.38, 1.48]` |
| `rear_left_wheel` | Rear Left Wheel & Brake | Wheels / Brakes | `WheelRearL` | `WheelRearL`, `WheelRearLRim`, `WheelRearLBrakeDisc`, `WheelRearLBrakePad` | `[0.65, 0, 0]` | `[1.02, 0.38, -1.31]` |
| `rear_right_wheel` | Rear Right Wheel & Brake | Wheels / Brakes | `WheelRearR` | `WheelRearR`, `WheelRearRRim`, `WheelRearRBrakeDisc`, `WheelRearRBrakePad` | `[-0.65, 0, 0]` | `[-1.02, 0.38, -1.31]` |
| `headlights` | LED Headlights Unit | Lighting | `BodyHeadlights` | `BodyHeadlights` | `[0, 0.10, 0.70]` | `[0, 0.62, 2.05]` |
| `taillights` | Rear Taillight Lightbar | Lighting | `BodyTaillights` | `BodyTaillights`, `BodyTaillightsPanels`, `BodyTurnsignalsRear` | `[0, 0.20, -0.70]` | `[0, 0.75, -2.05]` |
| `mirrors` | Aerodynamic Mirrors | Exterior Body | `BodyDoorLMirror` | `BodyDoorLMirror*`, `BodyDoorRMirror*` | `[0.40, 0.10, 0]` | `[1.18, 0.78, 0.95]` |
| `engine` | Engine Powertrain Unit | Powertrain | `Engine` | `Engine` | `[0, 0.45, 0.30]` | `[0, 0.55, 1.30]` |
| `suspension` | Axle & Suspension Assembly | Chassis / Struct | `Axles` | `Axles` | `[0, -0.30, 0]` | `[0, 0.22, 0.10]` |
| `chassis` | Chassis & Spaceframe Cage | Chassis / Struct | `BodyUnderside` | `BodyUnderside`, `InteriorCage` | `[0, -0.10, 0]` | `[0, 0.18, 0]` |
| `interior` | Cockpit, Dashboard & Seats | Interior | `InteriorCage` | 21 Interior child nodes (seats, dashboard, console, pedals, column) | `[0, 0.35, 0]` | `[0, 0.68, 0.35]` |

---

## 2. Unavailable Components Report & Architectural Justification

| Component ID | Label | Availability Status | Reason & Architectural Justification | Recommended Fallback / Alternative |
| :--- | :--- | :--- | :--- | :--- |
| `rear_left_door` | Rear Left Door | ❌ UNAVAILABLE | This chassis model is an aerodynamic executive sports coupe with a 2-door profile. Rear occupant ingress is accommodated via front folding seat mechanisms. Rear quarter side panels are integrated into the monocoque outer shell. | Maps to `front_left_door` or rear quarter panel hotspot. |
| `rear_right_door` | Rear Right Door | ❌ UNAVAILABLE | Same as above. The 2-door coupe profile does not feature rear passenger door cutouts. | Maps to `front_right_door` or rear quarter panel hotspot. |

---

## 3. Inspection Modes & Interaction Fidelity

1. **Normal Mode:** Assembled car with metallic silver PBR shader, clearcoat, environment reflections, 360° orbit rotation, 6 camera presets, and raycast mesh picking.
2. **Exploded Mode:** Deterministic procedural displacement vectors applied to distinct GLB node branches (Hood, Boot, Doors, Wheels, Roof, Engine, Suspension). Reverse reassembly smoothly returns parts to origin `[0, 0, 0]`.
3. **Damage Mode:** Genuine database damage records projected as glowing interactive markers on verified component anchors. Raycast clicks open full evidence records (severity, repairs, invoices, inspection dates).
4. **X-Ray Mode:** Ghosted transparent exterior shell (`opacity: 0.18, depthWrite: false`) exposing internal mechanical engine block, axles/suspension, brake discs/pads, structural cage, and cabin seating.
