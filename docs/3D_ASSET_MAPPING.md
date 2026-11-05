# TrustDrive — 3D Asset & Component Mapping

## 1. Asset

| Field | Value |
| --- | --- |
| Primary Path | `public/models/vehicles/trustdrive-sedan.glb` |
| Legacy Alias | `public/models/car.glb` |
| Manifest | `public/models/vehicles/model-manifest.json` |
| Size | 11,778,688 bytes (~11.8 MB) |
| Format | Binary glTF 2.0 (GLB) |
| Source | KhronosGroup glTF-Sample-Assets (`Models/CarConcept`) |
| Creator | Eric Chadwick (Darmstadt Graphics Group GmbH) |
| Licence | **Creative Commons Attribution 4.0 International (CC BY 4.0)** |
| Structure | **101 nodes, 97 meshes, 29 materials** — separated parts across body, doors, hood, boot, roof, wheels, engine, suspension, and interior |

## 2. Component Registry & Normalisation

Managed through `lib/vehicle-registry.ts`:
- Length along Z: 4.357 m, Width along X: 2.716 m, Height along Y: 1.308 m.
- Centered at origin `[0, 0, 0]` with ground-level contact at Y = 0 on a turntable pedestal.
- 20 registered automotive components (18 available, 2 documented as unavailable on the 2-door coupe profile).
- Mesh raycasting directly resolves canonical component IDs using `getComponentByMeshName(mesh.name)`.

## 3. Four Interactive Vehicle Modes

1. **Normal Mode:** Assembled vehicle, metallic silver PBR paint (`#CBD3DC`, metalness 0.92, roughness 0.20, clearcoat 1.0), tinted glass, studio lighting, and 360° rotation.
2. **Exploded Mode:** Procedural animated disassembly moving parts away from the chassis along deterministic vectors; smooth reverse reassembly returns all components to origin.
3. **Damage Mode:** Highlights damaged parts with an amber emissive pulse (`#F59E0B`), displays interactive 3D damage markers, and supports severity filtering (All / Minor / Moderate / Major).
4. **X-Ray Mode:** Ghosted translucent exterior shell (`opacity: 0.14, depthWrite: false`) exposing genuine internal mechanical engine block, axles/suspension, brake discs/pads, structural cage, and cabin seating.

## 4. Camera Controls

- 6 Camera Presets: "3/4 Hero", "Front", "Side Flank", "Rear Tail", "Top Down", "Powertrain".
- Free 360° orbit with mouse/touch drag and 360° degree slider.
- Zoom in and zoom out buttons.
- Turntable auto-rotate toggle.
- Reset view.
- Fullscreen toggle with Escape key listener.

## 5. Backend Integration

- `GET /api/v1/vehicles/:id/3d-model`: Vehicle model manifest, dimensions, and asset URL.
- `GET /api/v1/vehicles/:id/components`: Component mapping, availability report, and verified damage records.
- `GET /api/v1/vehicles/:id/damage` & `POST /api/v1/vehicles/:id/damage`: Real database-backed damage records.
