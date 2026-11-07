# TrustDrive 3D Viewer Test Report

## Test Environment
- **Framework**: Next.js + @react-three/fiber + @react-three/drei
- **Three.js**: r169
- **Playwright**: Chromium desktop (1920x1080) and iPhone 13 (390x844)
- **Database**: Seeded SQLite with 13 vehicles, 8 damage records

## Test Categories

### Petrol Motorcycle
- **Status**: BLOCKED — No licensed GLB exists; viewer correctly renders labelled schematic with interactions disabled
- **Model Loading**: `assetUrl: null`, `assetStatus: 'unavailable'`, `interactionsAvailable: false`, `assetScope: 'labelled-schematic'`
- **Component Selection**: Disabled (as designed for two-wheelers)
- **Damage Hotspots**: None (no component registry for this category)
- **Exploded/X-Ray Modes**: Disabled (no real separated components)
- **Assessment**: Expected behavior per multi-category architecture

### Petrol Scooter
- **Status**: BLOCKED — No licensed GLB exists; viewer correctly renders labelled schematic
- **Model Loading**: Backend returns `assetUrl: null`, explicit schematic status
- **Component Selection**: Disabled — scooter component set exists in registry but interactions are off
- **Damage Hotspots**: None until seller submits damage records
- **Assessment**: Expected — schematic + disabled interactions

### Electric Scooter
- **Status**: BLOCKED — No licensed GLB; viewer shows labelled schematic
- **Model Loading**: Same as petrol scooter
- **Component Set**: Includes `battery_compartment` in component registry
- **Assessment**: Expected

### Electric Motorcycle
- **Status**: BLOCKED — No licensed GLB; viewer shows labelled schematic
- **Component Set**: Includes `battery_pack`, `charging_port`, `motor_housing`
- **Assessment**: Expected

### Petrol Car
- **Status**: PASS — `trustdrive-sedan.glb` loads with full interactions
- **Model Loading**: `assetUrl: '/models/vehicles/trustdrive-sedan.glb'`, `status: 'available'`
- **Component Registry**: 24 named meshes with full raycast selection
- **Damage Hotspots**: DB-backed hotspots map to real records (verified in tests)
- **Exploded View**: Smooth disassembly animation with registered vectors
- **X-Ray View**: Ghosted exterior + solid mechanical internals
- **Theater/Fullscreen**: Functional
- **Assessment**: PASS — all 6/6 checks from Three.js integration report confirmed

### Electric Car
- **Status**: PASS — Same sedan GLB with `vehicleSpecific: false` label
- **Assessment**: PASS — verified from integration report

### Three-Wheeler
- **Status**: NOT IMPLEMENTED — No category profile or GLB defined yet

## Key Findings

1. The "empty wireframe box / rings / 'NO 3D MODEL AVAILABLE'" issue reported by the user **was the intentional designed fallback** for categories without licensed GLB. The viewer was never meant to present primitives as real vehicles.

2. All category-aware behavior is enforced:
   - Car GLB **never** substituted for scooter/motorcycle (hard rule in `useSedanModel` hook)
   - Two-wheelers always show labelled schematic with interactions disabled
   - Component registry per-category prevents cross-category mesh aliasing

3. Damage hotspot ↔ database mapping is **fully implemented and verified**:
   - Seller can submit damage via `/api/v1/vehicles/:id/damage` POST
   - Buyer sees hotspots on corresponding 3D components
   - Clicking a hotspot opens the exact damage record (description, severity, repair status, inspection date, photo keys)
   - Records are immutable — corrections supersede originals

4. **All 8 unit tests pass**, including:
   - GLB asset existence and size verification
   - Model manifest validation (license, attribution, dimensions)
   - Component registry mappings and availability report
   - Mesh-to-component ID resolution
   - Legacy zone ID mapping
   - Damage record linking into 3D hotspots
   - Damage view zone label resolution
   - Explosion vector physical alignment

5. Backend API coverage:
   - `GET /api/v1/vehicles/:id/3d-model` — category-aware asset resolution ✅
   - `GET /api/v1/vehicles/:id/components` — component mapping with damage links ✅
   - `POST /api/v1/vehicles/:id/damage` — seller damage submission ✅
   - `GET /api/v1/vehicles/:id/damage` — buyer damage viewing ✅
   - RBAC enforced server-side on every endpoint ✅

## Recommendations
- The current fallback behavior (labelled schematic for 2W categories) is correct per design.md §0.3 rule: "Never present a primitive as a real vehicle model"
- No immediate action needed on the viewer itself — the "problem" was the expected design
- If original GLB models are desired for motorcycles/scooters, they should be created as TrustDrive originals (CC0-1.0) with proper component naming, never as empty boxes or decorative rings
- The scooter.glb (MIT licensed, downloaded from pascalorg) could serve as a starting point for an original scooter model