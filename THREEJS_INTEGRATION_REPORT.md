# TrustDrive — Three.js / 3D Integration Report

**Date:** 2026-11-07 · **Result: PASS for real car GLB + DB hotspots and honest 2W fallback; vehicle-specific scans NOT IMPLEMENTED.**
**Asset:** `frontend/public/models/vehicles/trustdrive-sedan.glb` (11.8 MB, real GLB)
**Component:** `frontend/components/shared/VehicleViewer3D.tsx`

## 1. Asset policy

| Category | Asset | Label | Interactions |
|---|---|---|---|
| `passenger_car` | `trustdrive-sedan.glb` | `generic-reference`, `vehicleSpecific:false` | Normal / Exploded / Damage / X-Ray / Theater |
| `electric_car` | `trustdrive-sedan.glb` | `generic-reference`, `vehicleSpecific:false` | same |
| `petrol_motorcycle` | none (`url:null`) | labelled schematic | disabled |
| `petrol_scooter` | none (`url:null`) | labelled schematic | disabled |
| `electric_scooter` | none (`url:null`) | labelled schematic | disabled |
| `electric_motorcycle` | none (`url:null`) | labelled schematic | disabled |

The API (`GET /api/v1/vehicles/:id/3d-model`) returns `status`, `assetUrl`, `license`, `interactionsAvailable` and `assetScope`; the UI obeys it. A car GLB is never substituted for a scooter or motorcycle.

## 2. Live proof

| Check | Observed | Result |
|---|---|---|
| Car GLB request | `3d-model` 200, `status=available`, URL to real GLB | PASS |
| GLB renders | studio visible in browser | PASS |
| Camera/category | car page uses car model; 2W pages show schematic | PASS 6/6 |
| 360°/zoom controls | OrbitControls interactive | PASS |
| View modes | Normal/Exploded/Damage/X-Ray buttons render | PASS |
| Damage hotspots | DB-backed hotspot button present | PASS |
| Hotspot → record | click opens matching `front_bumper` damage text | PASS |
| 2W no car geometry | `assetUrl=null`, `interactionsAvailable=false` | PASS 4/4 |
| 2W interaction buttons | disabled/greyed, 0 damage panels | PASS |

Evidence: `SCREENSHOTS/verify-passenger_car-glb.png`, `SCREENSHOTS/verify-electric_scooter-schematic.png`, `SCREENSHOTS/feat5-marketplace-3d.png`, `SCREENSHOTS/buyer-car-3d-hotspot.png`.

## 3. Hotspot ↔ database mapping

The viewer does not use decorative markers. A hotspot is created only from a persisted `damage_records` row:

```text
damage_records (vehicle_id, zone_id/component_id, severity, description)
  → GET /api/v1/vehicles/:id/damage
  → VehicleViewer3D hotspot
  → click opens damage detail
```

Focused run: damage `d-1793989213056` at `front_bumper` produced a hotspot that opened the exact description (`MW5ATBQ1`).

## 4. Component inspection

Cars expose a 24-component GLB registry with named meshes and raycast selection. The viewer supports component highlighting and shows the matching inspection/repair record where present. Two-wheelers have no selectable 3D components; the UI says so instead of pretending.

## 5. Limitations

- The car GLB is a **generic reference body**, not a scan of the specific vehicle. The UI labels this.
- No per-vehicle 3D scan geometry exists — **NOT IMPLEMENTED**.
- Two-wheelers have no 3D model — honest labelled schematic, not a fake vehicle.
- Damage hotspots are human-entered records, not YOLO-photo-derived.

## 6. Tests

- `tests/vehicle-3d-inspection.test.ts` — 8 tests, all pass.
- Live six-category run: car GLB + 2W schematic proof for all categories.
- Focused run: 3D hotspot opens the stored damage record.

**3D verdict: PASS** for the implemented viewer and asset policy; vehicle-specific scan geometry remains NOT IMPLEMENTED.
