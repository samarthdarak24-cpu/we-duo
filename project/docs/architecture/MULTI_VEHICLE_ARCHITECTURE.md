# TrustDrive — Multi-Category Vehicle Verification Architecture

**Status:** Architecture audit + implementation baseline
**Spec version:** `multicategory-1.0.0`
**Date:** 2026-11-06
**Governing rules:** `AGENTS.md`, `newdesign (3).md` §0/§19/§20, `design.md`

> This document records the **audit first**, then the target design, then the
> implementation state. Per the strict implementation rules, capabilities that
> are not real are labelled `unavailable` or `planned` — never marked complete.

---

## 1. Audit of the existing system (before changes)

### 1.1 Runtime topology (verified live)

| Layer | Reality |
| --- | --- |
| Portal + REST | Next.js 14.2.35, `frontend/`, production `next start` on `:3000` |
| Intelligence + backend | FastAPI/uvicorn on `:8000`, launched from `backend/.venv/Scripts/python.exe` |
| Database | **one** shared SQLite `.data/trustdrive.db`, `PRAGMA user_version = 3`, 51 tables, 11 immutability/chain triggers, 5 alias views |
| Data access | `frontend/lib/server/db.ts` (Node `node:sqlite`) is the DDL owner; `backend/app/db.py` reflects the live schema and never declares it |
| Browser QA | Playwright + installed Chrome; the 22-feature live regression finished **22 PASS / 0 FAIL** (`qa/evidence/qa22/`) |

The two runtimes already share one database file. **No second database was added.**

### 1.2 Existing live data

`vehicles` has **69 rows** and already contains a free-text `category` column, but it has no constraint, no default and no taxonomy:

| `vehicles.category` | rows |
| --- | ---: |
| `Sedan` | 62 |
| `SUV` | 3 |
| `Superbike` | 2 |
| `Motorcycle` | 1 |
| `Adventure Bike` | 1 |

`fuel` also has case drift (`Petrol` 63, `Diesel` 3, `petrol` 2, `Hybrid` 1). Five seeded two-wheeler rows exist, but **every rule that reads them is car-only**.

### 1.3 Car-only assumptions found (the defects this build removes)

| Where | Hardcoded assumption |
| --- | --- |
| `frontend/lib/server/validate.ts:11-23` | Indian car registration regex + **17-character ISO VIN for every vehicle** |
| `frontend/lib/server/data.ts:1731-1732, 1808-1815` | Same VIN rule on create and update; defaults `fuel: "Petrol"`, `category: "Sedan"` |
| `frontend/app/api/v1/vehicles/route.ts` | No category check, defaults `category \|\| "Sedan"` |
| `backend/app/routers/vehicles.py:15, :168-169` | `VIN_RE = [A-HJ-NPR-Z0-9]{17}` rejects a scooter frame number |
| `backend/app/routers/vehicles.py:276` / `main.py:430` | Fixed document checklist `["rc","insurance","puc","service"]` — PUC is meaningless for an EV |
| `backend/app/extract.py:24-43` | Only `REG_RE`, 17-char `VIN_RE`, `ODOMETER_RE`, policy/amount; no engine/motor/battery fields |
| `backend/app/detectors.py:76-181` | Car-scale mileage thresholds (`> max(50_000, med*4)` km/yr, rollback wording "mechanical odometer") |
| `backend/app/explain.py:17-24` | Category-weighted weight set (`trust-v2-multicategory`): document/identity/mileage/service/inspection/integrity, per-category weights |
| `backend/app/intelligence/damage/yolo.py` | `car_damage.pt`, car zone names (`front_bumper`, `bonnet`) |
| `backend/app/agent.py` | 15/16 category-aware nodes (combustion 15, EV 16 with `EVBatteryAnalysisNode`), `VehicleCategoryDetectionNode` + EV battery branch |
| `frontend/lib/vehicle-registry.ts` | 24 components measured from **one sedan GLB** only |
| `frontend/components/shared/VehicleViewer3D.tsx` | Hardcoded `trustdrive-sedan.glb` / `car.glb` |
| `frontend/app/api/v1/vehicles/[id]/3d-model/route.ts` | Returns the sedan asset for every vehicle id |
| `frontend/components/seller/AddVehicleStepper.tsx` | Category dropdown `[Sedan, SUV, Hatchback, MUV, Coupe]`; VIN label "17 chars" |
| `frontend/components/public/MarketplaceSection.tsx` | `isBikeVehicle()` string heuristic with hardcoded ids |

> **Remediation status.** The car-only assumptions mapped above have all been addressed.
> A single canonical taxonomy (`frontend/lib/vehicle-categories.json`, `version:
> multicategory-1.0.0`, `trustVersion: trust-v2-multicategory`) now drives the shared
> engine, frontend forms, backend detectors/trust/agent, and the 3D/Passport contracts.
> Six categories are implemented (petrol/electric motorcycle & scooter, passenger & electric
> car). The 3D viewer honours `assetUrl: null` for non-car profiles (labelled schematic,
> interactions disabled) and never substitutes the sedan GLB. The Buyer marketplace filters
> and cards are category-aware. See `VEHICLE_CATEGORY_MATRIX.md` for the full matrix and
> `IMPLEMENTATION_STATUS.md` for the current verification baseline.

### 1.4 Assets and models actually present

| Asset | Size | Notes |
| --- | ---: | --- |
| `frontend/public/models/vehicles/trustdrive-sedan.glb` | 11,778,688 B | Real Khronos CarConcept GLB, CC BY 4.0, measured component hierarchy |
| `frontend/public/models/car.glb` | 11,778,688 B | Same file used as fallback |
| `frontend/public/models/vehicles/model-manifest.json` | 32,103 B | One manifest, 24 components |

**No motorcycle, scooter or electric-scooter GLB exists.** Therefore per the brief
("never load a car model for a scooter", "never ship a primitive placeholder as the
final vehicle"), those categories get a **clearly labelled category-specific
schematic** with all 3D interactions disabled — not a car GLB, not a box, not a
human figure. This is reported as `unavailable`, never as complete.

### 1.5 Integration reality discovered during the audit

- `langgraph` **is** installed in `backend/.venv` (added to `requirements.txt` and activated). The live agent now reports `orchestrator: "langgraph"` with checkpointing enabled; the sequential executor remains the fallback when the package is absent.
- `TD_LLM_PROVIDER=local` (`Qwen/Qwen2.5-1.5B-Instruct`) is configured, `/health` reports `llm.active: true`, but **every** call fails: loading the fp32 model on a 15.4 GB machine with 5.7 GB free raises `MemoryError` inside transformers 5.22. The caught error surfaces as `Local model call failed (AttributeError)` and no LLM conclusion is produced. The deterministic evidence-only answer is used, which is honest, but the health flag is misleading and the earlier 105 s investigator latencies were real CPU contention.
- `rapidocr-onnxruntime`, `ultralytics`, `xgboost` **are** available in the venv; `paddleocr` is not. The existing OCR pipeline is PyMuPDF text layer + RapidOCR, not PaddleOCR. PaddleOCR stays an adapter, not a claimed runtime.

### 1.6 Schema migration hazard (critical)

`frontend/lib/server/db.ts:331 migrate()` is **destructive**: when `PRAGMA
user_version != SCHEMA_VERSION` it drops 27 core tables, recreates them and
re-seeds. Bumping `SCHEMA_VERSION` from 3 to 4 would erase all 69 vehicles and
the entire QA-verified history. The migration must therefore be **additive and
idempotent**, registered in the `getDb()` ensure chain without changing
`SCHEMA_VERSION`.

---

## 2. Target architecture

### 2.1 One engine, category profiles only

```
                       ┌──────────────────────────────────────────┐
                       │  frontend/lib/vehicle-categories.json    │
                       │  SINGLE canonical taxonomy (data only)   │
                       └───────────────┬──────────────────────────┘
                    ┌──────────────────┴───────────────────┐
                    ▼                                      ▼
   frontend/lib/vehicle-categories.ts        backend/app/categories.py
   (UI, REST, RBAC, 3D resolution)          (rules, OCR, ML, agent, trust)
                    │                                      │
                    └──────────────┬───────────────────────┘
                                   ▼
                 one shared SQLite database, one vehicles table
```

A category profile supplies: identity rules, dynamic field groups, document
types, mileage thresholds, damage component set, 3D asset mapping, trust
weights, UI labels and applicable investigator nodes. The verification
engine reads the profile; it never branches on a hardcoded `if (isBike)`.

### 2.2 Category resolution for legacy rows

`vehicles.vehicle_category_id` (new, nullable) is authoritative. When absent,
`categoryForVehicle(row)` maps legacy free text (`Sedan`, `Superbike`, …) plus
`fuel` to a profile. **All 69 existing car rows keep working unchanged** — the
mapping is read-time, not a rewrite. `resolveCategoryId("Superbike")` →
`petrol_motorcycle`; `resolveCategoryId("Sedan", "Electric")` → `electric_car`.

### 2.3 Identifier rules (no universal VIN)

| Category | Primary identifier | Pattern |
| --- | --- | --- |
| Petrol motorcycle / scooter | Chassis / frame number | `^[A-Z0-9]{8,22}$` |
| Electric scooter / motorcycle | Chassis / frame number + motor number | `^[A-Z0-9]{8,22}$` |
| Petrol car / electric car | ISO 3779 VIN | `^[A-HJ-NPR-Z0-9]{17}$` |

Registration is validated per **jurisdiction** (`IN` today, extensible), not
per vehicle class. Electric profiles contain no `engine_number`, `engine_cc`
or `puc` field/document at all.

### 2.4 Database additions (additive only)

| New table | Purpose |
| --- | --- |
| `schema_migrations` | idempotent migration ledger; does not touch `PRAGMA user_version` |
| `vehicle_category_specs` | taxonomy snapshot + version, so a finding can cite the exact rule set |
| `vehicle_specs` | category-specific validated attributes (JSON + provenance per field) |
| `battery_records` | battery evidence: chemistry, capacity, serial, SOH **with source**, warranty, replacement |
| `motor_records` | motor/controller identity and service evidence |
| `vehicle_model_assets` | category → GLB mapping with availability + licence |
| `vehicle_components` | category-scoped component registry rows |

`vehicles` gains nullable `vehicle_category_id`, `vehicle_type`, `powertrain`,
`specs_version`; `damage_records` gains `component_id` and geometry columns
(back-filled from the correct registry). All via guarded `ALTER TABLE …

ADD COLUMN`, never a table rebuild.

### 2.5 Investigator (one graph, conditional nodes)

16 declared nodes; a category profile lists the applicable subset. Electric
profiles add `EVBatteryAnalysisNode`; car profiles omit it. The response always
reports `orchestrator`, `nodes_declared`, `nodes_executed`, `category_id`, rule
version and evidence IDs. LangGraph is used for orchestration only — every
finding still comes from deterministic rules or a versioned model, never from
an LLM verdict.

### 2.6 Trust score

`trust-v2-multicategory`, additive and deterministic, `BASE_SCORE = 50` plus a
versioned per-category weight set. Missing evidence contributes **zero**, never
a positive "clean" score and never a fraud penalty. `battery_soh` is never an
odometer input.

---

## 3. Honest capability matrix (design target, verified state at end of build)

| Capability | Cars | Petrol 2W | Electric 2W |
| --- | --- | --- | --- |
| Category-aware registration form | ✅ | ✅ | ✅ |
| Category-aware identity validation | ✅ | ✅ | ✅ |
| Category-aware document checklist + OCR | ✅ | ✅ | ✅ |
| Odometer / distance fraud rules | ✅ | ✅ | ✅ |
| Battery evidence analysis | n/a | n/a | ✅ (evidence-backed only) |
| Real category-correct GLB | ✅ sedan (generic reference) | ❌ labelled schematic | ❌ labelled schematic |
| Trained damage CV weights | ✅ car only (demo weights) | ❌ unavailable | ❌ unavailable |
| PaddleOCR runtime | ❌ adapter only (RapidOCR + PyMuPDF are live) | same | same |
| Real LangGraph runtime | target | target | target |

`✅` means a real backend path with persisted data. `❌` means explicitly
labelled unavailable, never silently substituted.

---

## 4. Implementation sequence (AGENTS.md §5 / newdesign §19)

| Phase | Deliverable | Gate |
| --- | --- | --- |
| 0 | This audit | no existing behaviour lost |
| 1 | Shared taxonomy JSON + TS/Python loaders | both runtimes resolve the same 6 profiles |
| 2 | Additive migration + 6 labelled demo vehicles | 69 original vehicle rows intact |
| 3 | Category-aware backend engine | car 22-feature regression still passes |
| 4 | Conditional LangGraph investigator | node list + orchestrator reported honestly |
| 5 | Dynamic Seller UI | register all 6 categories through the real API |
| 6 | Buyer UI + Passport + 3D mapping | no car GLB for a scooter |
| 7 | Tests + documentation | typecheck, tests, build, live verification |

After each phase: `npx tsc --noEmit`, `npm test`, `npm run build` (isolated
`NEXT_DIST_DIR`), and a live check against real DB rows.

---

## 5. Rule compliance notes

- **Rule 1/2** — nothing is rebuilt and no working feature is removed; the migration is additive and car behaviour is preserved by profile-defaulting legacy rows.
- **Rule 5/6** — demo vehicles are labelled `DEMO DATA`; every action writes to the real shared DB.
- **Rule 7/8** — unavailable 3D assets, damage weights, PaddleOCR and LLM conclusions are reported as such in payloads and in `/health`.
- **Rule 9/10** — SHA-256 stays a file-integrity signal; missing records stay unverified coverage; trust score stays deterministic and versioned.
- **Rule 13** — no primitive placeholder is presented as a vehicle; the sedan GLB remains real. A labelled schematic is a clearly named fallback, not a fake 3D model.
- **Rule 15** — loading/empty/error states, RBAC, input validation and persistence are required for each new feature.
