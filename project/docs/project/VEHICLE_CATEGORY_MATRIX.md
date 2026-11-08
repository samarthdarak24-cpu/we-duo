# TrustDrive — Vehicle Category Matrix

> Single source of truth for the **multi-category** verification platform.
> One shared engine, one shared database, one taxonomy JSON
> (`frontend/lib/vehicle-categories.json`, `version: multicategory-1.0.0`,
> `trustVersion: trust-v2-multicategory`). Car functionality is preserved; every
> other category rides the same verification pipeline with its own profile.

---

## 1. Implemented categories (priority order)

| # | `categoryId` | Label | Class | Powertrain | Primary identifier | PUC | 3D asset | Damage CV | Agent nodes |
|---|--------------|-------|-------|-----------|-------------------|-----|----------|-----------|-------------|
| 1 | `petrol_motorcycle` | Petrol Motorcycle | two_wheeler | petrol | Chassis / frame No. (`^[A-Z0-9]{8,22}$`) | Required | labelled_schematic (unavailable) | unavailable | 15 |
| 2 | `petrol_scooter` | Petrol Scooter | two_wheeler | petrol | Chassis / frame No. (`^[A-Z0-9]{8,22}$`) | Required | labelled_schematic (unavailable) | unavailable | 15 |
| 3 | `electric_scooter` | Electric Scooter | two_wheeler | electric | Chassis / frame No. (`^[A-Z0-9]{8,22}$`) | Not applicable | labelled_schematic (unavailable) | unavailable | 16 (incl. `EVBatteryAnalysisNode`) |
| 4 | `electric_motorcycle` | Electric Motorcycle | two_wheeler | electric | Chassis / frame No. (`^[A-Z0-9]{8,22}$`) | Not applicable | labelled_schematic (unavailable) | unavailable | 16 (incl. `EVBatteryAnalysisNode`) |
| 5 | `passenger_car` | Passenger Car | four_wheeler | petrol | VIN (`^[A-HJ-NPR-Z0-9]{17}$`) | Required | `car_sedan` GLB (available) | available | 15 |
| 6 | `electric_car` | Electric Car | four_wheeler | electric | VIN (`^[A-HJ-NPR-Z0-9]{17}$`) | Not applicable | `car_sedan` GLB (available) | available | 16 (incl. `EVBatteryAnalysisNode`) |

**Planned (not implemented):** moped, electric_bike, auto_rickshaw, electric_three_wheeler,
passenger_three_wheeler, cargo_three_wheeler, hatchback, suv, muv, hybrid_car,
light_commercial, truck, bus, electric_commercial.

---

## 2. Identifier, odometer & PUC rules

| Category | Primary identifier label | Pattern | Odometer label | PUC |
|----------|--------------------------|---------|---------------|-----|
| `petrol_motorcycle` | Chassis / frame number | `^[A-Z0-9]{8,22}$` | Odometer | PUC certificate (required) |
| `petrol_scooter` | Chassis / frame number | `^[A-Z0-9]{8,22}$` | Odometer | PUC certificate (required) |
| `electric_scooter` | Chassis / frame number | `^[A-Z0-9]{8,22}$` | Total distance | Not applicable |
| `electric_motorcycle` | Chassis / frame number | `^[A-Z0-9]{8,22}$` | Total distance | Not applicable |
| `passenger_car` | VIN (17 characters) | `^[A-HJ-NPR-Z0-9]{17}$` | Odometer | PUC certificate (required) |
| `electric_car` | VIN (17 characters) | `^[A-HJ-NPR-Z0-9]{17}$` | Total distance | Not applicable |

**Hard rules (enforced in `validateIdentity`):**
- The 17-character VIN rule applies **only** to four-wheelers. Two-wheelers use a stamped
  frame number of 8–22 chars; the car VIN rule is explicitly *not* applied.
- EVs never ask for an engine number, engine CC or PUC. They ask for a **motor number**
  (`^[A-Z0-9]{5,22}$`) instead.
- The engine-number field is optional even for combustion vehicles.

---

## 3. Mileage / distance rules

All categories use `unit: km`. Battery State of Health is **never** treated as a distance
reading (`sohIsOdometer: false` for every category).

| Category | `dailyMaxKm` ceiling | Notes |
|----------|----------------------|-------|
| `petrol_motorcycle` | 300 km/day | Two-wheeler ceiling |
| `petrol_scooter` | 200 km/day | Lowest ceiling — scooters accumulate fewer km |
| `electric_scooter` | 150 km/day | Lowest ceiling — short urban trips |
| `electric_motorcycle` | 250 km/day | |
| `passenger_car` | 400 km/day | Highest ceiling |
| `electric_car` | 350 km/day | |

A reading that exceeds the category ceiling triggers `MILEAGE_JUMP`; two readings on the same
date trigger `DUPLICATE_DISTANCE_READING` (only when a category id is known).

---

## 4. Document sets (category-specific)

Required documents are whatever the category profile marks `required`. As shipped, **no**
category marks any document strictly required (coverage is reported as unverified when
missing, never as "clean"). The *available* document types are category-scoped:

| Category | Document types available |
|----------|--------------------------|
| `petrol_motorcycle` / `petrol_scooter` | `rc_2w`, `insurance_2w`, `puc`, `ownership`, `service_2w`, `repair`, `inspection`, `accident_claim`, `engine_chassis` |
| `electric_scooter` / `electric_motorcycle` | `rc_2w`, `insurance_2w`, `ownership`, `service_2w`, `repair`, `inspection`, `accident_claim`, `battery_warranty`, `battery_inspection`, `battery_health`, `battery_replacement`, `motor_controller_repair`, `charging_service` |
| `passenger_car` | `rc`, `insurance`, `puc`, `ownership`, `service`, `repair`, `inspection`, `accident_claim` |
| `electric_car` | `rc`, `insurance`, `ownership`, `service`, `repair`, `inspection`, `accident_claim`, `battery_warranty`, `battery_inspection`, `battery_health`, `battery_replacement`, `motor_controller_repair`, `charging_service` |

EVs drop `puc` and `engine_chassis`; they add the `battery_*` and `motor_controller_repair` /
`charging_service` types. `addDocumentForVehicle` rejects any document type not in the
vehicle's category set.

---

## 5. Component / 3D asset mapping

| Category | 3D asset | Interactions | Component set |
|----------|----------|--------------|---------------|
| `petrol_motorcycle` | none — labelled schematic | disabled | two-wheeler component set (e.g. `front_fairing`, `side_panel_right`) |
| `petrol_scooter` | none — labelled schematic | disabled | two-wheeler component set |
| `electric_scooter` | none — labelled schematic | disabled | two-wheeler set **+** `battery_compartment` |
| `electric_motorcycle` | none — labelled schematic | disabled | two-wheeler set **+** `battery_compartment` |
| `passenger_car` | `car_sedan` GLB (`trustdrive-sedan.glb`) | enabled | 24-component measured GLB registry (QA22 baseline) |
| `electric_car` | `car_sedan` GLB (`trustdrive-sedan.glb`) | enabled | 24-component measured GLB registry |

**Rule (enforced end-to-end):** when a category has no licensed GLB, the 3D viewer
(`VehicleViewer3D`) renders a clearly-labelled category **schematic** with raycast /
Exploded / X-Ray interactions disabled. It **never** loads the sedan GLB for a scooter,
and it **never** substitutes a primitive placeholder presented as a real asset. The
`/api/v1/vehicles/:id/3d-model` contract returns `assetUrl: null`,
`assetStatus: "unavailable"`, `interactionsAvailable: false`,
`assetScope: "labelled-schematic"` for every non-car profile.

---

## 6. Investigation agent nodes

Combustion profiles run **15** nodes; electric profiles run **16** (adding
`EVBatteryAnalysisNode`). The same node *functions* exist for all categories; only the
relevant subset executes per category. An unavailable orchestrator (LangGraph not loaded)
is reported honestly, never hidden.

| Node | Combustion (15) | Electric (16) |
|------|-----------------|--------------|
| `VehicleResolverNode` | ✅ | ✅ |
| `VehicleCategoryDetectionNode` | ✅ | ✅ |
| `DocumentRetrievalNode` | ✅ | ✅ |
| `OCRAnalysisNode` | ✅ | ✅ |
| `MileageAnalysisNode` | ✅ | ✅ |
| `EVBatteryAnalysisNode` | — | ✅ |
| `DamageAnalysisNode` | ✅ | ✅ |
| `IdentityVerificationNode` | ✅ | ✅ |
| `HistoryCorrelationNode` | ✅ | ✅ |
| `AnomalyDetectionNode` | ✅ | ✅ |
| `EvidenceGraphNode` | ✅ | ✅ |
| `ConflictDetectionNode` | ✅ | ✅ |
| `RiskExplanationNode` | ✅ | ✅ |
| `HumanReviewNode` | ✅ | ✅ |
| `ReportGenerationNode` | ✅ | ✅ |
| `ResultPersistenceNode` | ✅ | ✅ |

---

## 7. Cross-cutting invariants (the "never" list)

- Never break car functionality when adding a category.
- Never use a separate database per category — one shared SQLite DB.
- Never use the car registration form for a scooter (or any non-car).
- Never use the **same** 3D model for every category (schematic, not sedan GLB, for non-cars).
- Never assume petrol engines — electric profiles have no engine number / CC / PUC.
- Never require an engine number for EVs.
- Never invent a battery State of Health — every SOH value is backed by a battery health report.
- Never invent accident / insurance / service records — missing history is reported as
  **unverified**, never as clean.
- Never treat missing history as a guarantee of cleanliness.
- Never present an AI/CV prediction as a verified fact (OCR ≠ genuineness; findings require review).
- Never show an unrelated 3D asset (no car GLB for a scooter).
- Never mark an unsupported capability as complete (damage CV + 3D GLB for two-wheelers are
  honestly reported `unavailable`).
