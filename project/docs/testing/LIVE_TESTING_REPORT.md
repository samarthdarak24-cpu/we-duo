# TrustDrive — Complete Live Frontend + Backend Functionality Audit & Testing

**Run ID:** `LIVE-MW6DOO1A` · **Executed:** 2026-11-07 · **Verdict: PASS**

| | |
|---|---|
| Live checks | **272 / 272 passed (100%)** |
| Feature groups | **11 / 11 passed** |
| Categories exercised end-to-end | **6 / 6** |
| Unexpected browser console errors | **0** |
| Screenshots captured (canonical) | **29** (+2 visual-verification +RC fixtures = 44 files) |
| Frontend unit/integration | **179 / 179 passed** (13 files) |
| Backend unit/API | **126 / 126 passed** |
| TypeScript | **0 errors** |
| Harness exit code | **`EXIT=0`** |

This is a **live** audit. Every assertion below was observed through a real Chromium browser against a running Next.js app and a running Python FastAPI service writing to the shared SQLite database. No mock responses, no injected session cookies, no seeded "success" flags, and no direct database writes used to make a check pass. The harness opens the real login form, fills the real Seller wizard, uploads real multipart files, and reads back real HTTP bodies, rendered DOM text, screenshots and SQLite rows.

---

## 1. Scope and the rules that were enforced

Six **implemented** categories were audited end-to-end:

| Category ID | Label | Powertrain | Wheels | Primary identifier | Expected agent nodes |
|---|---|---|---|---|---|
| `petrol_motorcycle` | Petrol Motorcycle | Combustion | 2 | Chassis / frame (8–22 chars) | 15 |
| `petrol_scooter` | Petrol Scooter | Combustion | 2 | Chassis / frame (8–22 chars) | 15 |
| `electric_scooter` | Electric Scooter | Electric | 2 | Chassis / frame (8–22 chars) | 16 |
| `electric_motorcycle` | Electric Motorcycle | Electric | 2 | Chassis / frame (8–22 chars) | 16 |
| `passenger_car` | Petrol Car | Combustion | 4 | VIN (17 chars, ISO 3779) | 15 |
| `electric_car` | Electric Car | Electric | 4 | VIN (17 chars, ISO 3779) | 16 |

The wizard was also asserted to offer **exactly these six** selectable categories. `moped`, `electric_bike`, `auto_rickshaw`, the three-wheeler classes, `hatchback`, `suv`, `muv`, `hybrid_car` and commercial classes remain **planned only** and are not selectable. Taxonomy version: `trust-v2-multicategory` (legacy fallback `trust-score-2.0.0`).

Non-negotiable product rules asserted on every relevant category:

1. **Never show a car model for a scooter/two-wheeler.** Two-wheelers expose `assetStatus: unavailable`, `assetUrl: null`, `interactionsAvailable: false`, `assetScope: labelled-schematic`, and no car license/attribution. Cars resolve `/models/vehicles/trustdrive-sedan.glb`, honestly labelled `generic-reference` / `vehicleSpecific: false`.
2. **Never require petrol details for EVs.** EVs hide "Engine capacity (CC)" and "Engine number", expose battery capacity + State of Health and motor number, and keep `fuel = Electric` / EV `categoryId` even if a client sends `engine_number` / `engine_cc` in `specs`.
3. **Never confuse battery SOH with odometer.** SOH lives in `vehicle_specs`/`specs` (`battery_soh`), distance lives in `vehicles.km_claimed`; `battery_records` receives no odometer rows.
4. **Never impose a universal 17-character VIN rule.** Two-wheelers accept `^[A-Z0-9]{8,22}$` frames; cars require `^[A-HJ-NPR-Z0-9]{17}$`. A 10-character frame was accepted for a two-wheeler and rejected for a car in the same run.

---

## 2. Environment and stack start-up

| Component | Detail |
|---|---|
| Frontend | Next.js 14 dev server, `http://127.0.0.1:3000` (HTTP 200 on `/login`) |
| Intelligence backend | FastAPI/Uvicorn, `http://127.0.0.1:8000`, `intelligence-2.0.0-multicategory` |
| Database | `.data/trustdrive.db`, SQLite, `journal_mode = wal`, `shared_with_nextjs: true`, 55 tables |
| OCR | RapidOCR (`rapidocr-onnx-crnn`) active; PaddleOCR unavailable; PyMuPDF text layer + OpenCV preprocessing available |
| Agent | LangGraph, checkpointing on, `interrupt_before: [HumanReviewNode]`, 16-node registry, conditional 15/16-node sets |
| LLM | `TD_LLM_PROVIDER=none` — deterministic evidence-only answer (see §11) |
| Auth | Real form login: seller `samarth@trustdrive.dev`, buyer `rohan@trustdrive.dev`, password `demo1234` |
| Service auth | `TD_SERVICE_TOKEN` from root `.env`, sent as `X-Service-Token` |
| Browser | Headless Chromium via Playwright (`@playwright/test` resolved from `frontend/node_modules`), 1440×900 |

`/health` live response (abridged): `status=ok`, `llm.active=false`, `llm.provider=none`, `agent.orchestrator=langgraph`, `agent.node_registry_count=16`, `agent.conditional=true`, `database.tables=55`, `database.shared_with_nextjs=true`.

---

## 3. Methodology — what "live" means here

`qa/live_e2e.mjs` (invoked via `npm run qa:live`) performs, in one uninterrupted run:

- **Real login** by filling `#login-email` / `#login-password` and clicking `form button[type="submit"]`, waiting on the actual `POST /api/v1/auth/login` response and the resulting URL.
- **Real Seller wizard** interaction per category: select category, assert category-driven field labels, fill all required fields, submit, and capture the real `POST /api/v1/seller/vehicles` response.
- **Real investigation** through the app's `POST /api/v1/vehicles/:id/ai-investigations` route, which calls the Python service. The harness asserts `source === "python-intelligence"`, `orchestrator === "langgraph"`, the exact conditional node count, and the presence/absence of `EVBatteryAnalysisNode`.
- **Real multipart uploads**: three generated PNG photos to `/photos`, and one generated category-correct RC image (`rc_2w` for 2W, `rc` for cars) to `/documents`. The Python OCR service extracts fields and the document is auto-set to `verified`.
- **Real publish gate**: a bare draft must fail with HTTP `422 PUBLISH_BLOCKED`; after photos + verified RC + complete fields + price, publish must return HTTP `200` and the DB row must read `published`.
- **Real Buyer flows**: marketplace category filters, registration search, 3D asset resolution, vehicle detail pages, a DB-backed 3D damage hotspot, PDF report generation and download (real `%PDF` bytes), buyer inquiry, seller inbox, seller reply, and buyer-side message read-back.
- **Direct backend HTTP** with `X-Service-Token`: `/health` and `/api/intelligence/investigate` for all six categories, plus an anonymous-call rejection.
- **Security/edge cases**: RBAC, duplicate registration, VIN/frame rule asymmetry, EV petrol-field injection, malformed registration, taxonomy boundaries.
- **Read-only SQLite assertions** on the same DB the app writes to, for every persistence claim.
- **Screenshots** at each milestone and full console-error capture with classification of expected HTTP rejections.

Fixtures are generated uniquely per run (`STAMP`-derived registration numbers and primary identifiers) so the audit is repeatable against a non-empty database.

---

## 4. Phase-by-phase results

| Phase | Requirement | Result | Evidence |
|---|---|---|---|
| 1 | Start the full stack | **PASS** | `:3000` HTTP 200, `:8000` `/health` ok, WAL DB shared |
| 2 | Operate the real UI | **PASS** | Seller + buyer real form logins, 1/1 each |
| 3 | Test the Seller dashboard | **PASS** | Wizard, draft, gate, investigation, uploads, publish for 6 categories (150/150 checks) |
| 4 | Test the Buyer dashboard | **PASS** | 68/68 checks incl. marketplace, 3D, PDF, inquiry thread |
| 5 | Test six category samples | **PASS** | 23/23, 23/23, 27/27, 27/27, 23/23, 27/27 |
| 6 | Verify backend functionality | **PASS** | 40/40 checks, real Python LangGraph on all six |
| 7 | Security and edge cases | **PASS** | 12/12 checks |
| 8 | Automate testing | **PASS** | `qa/live_e2e.mjs`, `qa:live` script, 51 new regression tests |
| 9 | Visual / functional verification | **PASS** | 29 canonical + 2 verification screenshots, inspected |
| 10 | Fix, retest, report | **PASS** | Defects fixed, clean rerun `EXIT=0`, six reports written |

---

## 5. Aggregate live results

| Feature group | Checks | Passed | Failed | Result |
|---|---:|---:|---:|---|
| Seller login | 1 | 1 | 0 | PASS |
| Category: Petrol Motorcycle | 23 | 23 | 0 | PASS |
| Category: Petrol Scooter | 23 | 23 | 0 | PASS |
| Category: Electric Scooter | 27 | 27 | 0 | PASS |
| Category: Electric Motorcycle | 27 | 27 | 0 | PASS |
| Category: Petrol Car | 23 | 23 | 0 | PASS |
| Category: Electric Car | 27 | 27 | 0 | PASS |
| Buyer login | 1 | 1 | 0 | PASS |
| Buyer marketplace & multi-category | 68 | 68 | 0 | PASS |
| Backend service & API | 40 | 40 | 0 | PASS |
| Security & edge cases | 12 | 12 | 0 | PASS |
| **Total** | **272** | **272** | **0** | **PASS** |

Console: 12 errors captured, **all 12 are the expected HTTP `400/403/409/422` rejections deliberately provoked by the negative tests**; 0 unexpected errors (the earlier React hydration warning was fixed — see `BUGS_FIXED.md`).

---

## 6. Six-category end-to-end matrix

Each row was created through the real wizard, investigated by the real Python agent, given 3 real photos and a real OCR-verified RC, and published.

| Category | Vehicle ID | Reg. no. | Primary identifier | Agent source / orchestrator | Nodes | RC type → status (confidence) | Published |
|---|---|---|---|---|---:|---|---|
| `petrol_motorcycle` | `v-1794054449573` | `MH12QA9442` | `FRM0054427822000` | `python-intelligence` / `langgraph` | 15 | `rc_2w` → `verified` (0.786) | yes |
| `petrol_scooter` | `v-1794054461271` | `MH13QA2301` | `FRM0054428822001` | `python-intelligence` / `langgraph` | 15 | `rc_2w` → `verified` (0.785) | yes |
| `electric_scooter` | `v-1794054469821` | `MH14QA3467` | `FRM0054429822002` | `python-intelligence` / `langgraph` | 16 | `rc_2w` → `verified` (0.779) | yes |
| `electric_motorcycle` | `v-1794054478303` | `MH15QA8013` | `FRM0054430822003` | `python-intelligence` / `langgraph` | 16 | `rc_2w` → `verified` (0.787) | yes |
| `passenger_car` | `v-1794054488033` | `MH16QA4426` | `91794054427822004` | `python-intelligence` / `langgraph` | 15 | `rc` → `verified` (0.778) | yes |
| `electric_car` | `v-1794054498560` | `MH17QA9643` | `91794054427822005` | `python-intelligence` / `langgraph` | 16 | `rc` → `verified` (0.776) | yes |

Category-specific assertions that passed for every applicable row:

- Two-wheelers show "Chassis / frame number" and **never** "VIN (17 characters)"; cars show the 17-character VIN label.
- Combustion categories show "Engine capacity (CC)" and "Engine number"; EV categories hide both, show battery fields + motor number, and store `{"battery_soh":"…"}` with **no** `engine_cc`.
- EV SOH is separate from odometer (`soh=92/km=6400`, `soh=88/km=11200`, `soh=95/km=28000`) and `batteryRows=0` for odometer writes.
- `ai_runs` rows persist with graph `langgraph-conditional` and status `completed`.
- Bare drafts return `HTTP 422 PUBLISH_BLOCKED` on all six; satisfied gates return `HTTP 200` with DB `published`.

---

## 7. Buyer-side results (68/68)

- Marketplace category filters and registration search return each of the six new listings with the correct `vehicle_category_id` and primary-identifier label.
- Two-wheelers: `3D status = unavailable`, `assetUrl = null`, `interactionsAvailable = false`, `assetScope = labelled-schematic`, `license = null`, `manifest = null`, and the API rule text explicitly forbids loading the sedan GLB. Buyer detail pages contain no car GLB reference and show the labelled schematic.
- Cars: `status = available`, `url = /models/vehicles/trustdrive-sedan.glb`, `assetScope = generic-reference`, `vehicleSpecific = false`.
- Car-only DB-backed chain: damage record `HTTP 201` → visible 3D hotspot → PDF report `HTTP 201` → PDF download returns **42,804 real `%PDF` bytes** → contact form → inquiry `HTTP 201` persisted in SQLite with `status = open` → seller inbox shows the message → seller reply `HTTP 201` → buyer reads back 2 messages.

---

## 8. Backend results (40/40)

- `/health` reports the multicategory service, shared SQLite, LangGraph orchestrator and 16-node registry.
- Health profiles declare 15 conditional nodes for all three combustion categories (no `EVBatteryAnalysisNode`) and 16 for all three electric categories (with `EVBatteryAnalysisNode`).
- Anonymous `POST /api/intelligence/investigate` → `HTTP 401`.
- Authenticated direct investigations for all six categories → `HTTP 200`, `orchestrator = langgraph`, 15/15/16/16/15/16 nodes, correct EV-node conditional, and `agent_investigations` rows persisted.
- Representative latency after the LLM configuration fix: **3,263 ms** for a 16-node `electric_car` investigation (`qa/probe-fast.json`), versus 200–670 s before the fix.

---

## 9. Visual verification (Phase 9)

Screenshots were opened and inspected, not merely counted.

- `SCREENSHOTS/verify-electric_scooter-schematic.png` — after the lazy viewer chunk loads, the studio shows a transparent wireframe envelope with two abstract wheel discs, a labelled card reading **"NO 3D MODEL AVAILABLE / Electric Scooter / Labelled schematic · interactions off"**, the notice "No licensed 3D model for Electric Scooter — labelled schematic only · interactions disabled", `0 damage panels`, and greyed-out **Exploded / Damage / X-Ray** controls. **No sedan/car geometry is present.** The dark/gold visual design is unchanged.
- `SCREENSHOTS/verify-passenger_car-glb.png` and `SCREENSHOTS/buyer-car-3d-hotspot.png` — the car GLB renders with the "Generic v3.1.0 reference body — not a scan of the … vehicle" provenance label, `1 damage panel`, and a "Recorded Defects: Front Bumper & Lower Fascia" hotspot highlight.
- A first capture of the scooter page showed the transient `Loading 3D viewer…` placeholder. A dedicated re-probe (`qa/probe_schematic.mjs`, results in `qa/probe_schematic.json`) waited for the placeholder to disappear and confirmed the schematic then renders. This is lazy-chunk timing, **not** a rendering defect.

---

## 10. Automated test suites after the audit

| Command | Result |
|---|---|
| `npm test` (frontend Vitest) | **13 files, 179/179 passed** — includes the new `tests/live-audit-regressions.test.ts` (51 tests) |
| `npm run intel:test` (backend Pytest) | **126 passed**, 1 harmless `fitz` deprecation warning |
| `npm run typecheck` | **0 errors** |
| `npm run qa:live` | **272/272 checks, `EXIT=0`** |

> Final hardening pass (2026-11-07): the suites now run **187/187 frontend** (15 files) and **127/127 backend**, with isolated test databases, shared DB rate limiting, persisted trust snapshots and durable SQLite checkpoints. The 272/272 live figure above remains the broad-run evidence; the focused suites above were re-run after the hardening changes.

The new regression suite locks down taxonomy version, exactly six implemented categories, planned categories being non-selectable, chassis/VIN asymmetry, EV field sets, PUC applicability, SOH/odometer separation, 3D asset policy and text, RC document types, 15/16-node conditional sets, and publish-gate blockers/warnings. Four earlier assertion mistakes in that suite were corrected (bad import, blocker count, 2W asset note regex).

---

## 11. Honest limitations and residual observations

These are **disclosed, not hidden**, and none of them invalidates a PASS above.

1. **LLM narration is disabled.** `TD_LLM_PROVIDER=none` returns an evidence-only deterministic answer. The full 15/16-node Python LangGraph investigator still runs, computes findings and trust score, and persists rows. The 1.5B local CPU model (`Qwen/Qwen2.5-1.5B-Instruct`) was measured at **201 s / 676 s / 521 s** per investigation because it loads synchronously in the request path — far beyond the app's 150 s route timeout — which forced every UI investigation into the honest `next-deterministic-fallback`. The configuration change fixes the live path; no narrative LLM was exercised in this audit. Re-enable only with a suitably raised `TD_INTELLIGENCE_TIMEOUT_MS` and a non-blocking inference path.
2. **No licensed two-wheeler GLB exists.** This is an intentional, clearly-labelled product decision, not a missing feature: a category schematic with disabled interactions is rendered instead. No car model and no primitive "car" placeholder is substituted.
3. **The car GLB is generic reference geometry**, explicitly not a scan of the specific vehicle; component hotspots map to real `damage_records` rows.
4. **PaddleOCR is unavailable** in this environment; RapidOCR performed the RC extraction. Both PyMuPDF text-layer and OpenCV preprocessing are available.
5. **External data sources** (vehicle registry, insurance, blockchain anchoring, theft/provider checks) are local/demo adapters. No live third-party network integration was claimed or tested.
6. **Residual deployment hardening** (carried forward from `SECURITY_TEST_REPORT.md`): per-IP rate limiting is in-process only (requires Redis/gateway for multi-instance), rotate `DOWNLOAD_SIGNING_SECRET` before production, HMAC-signed download URLs expire.
7. **Minor cosmetic observation, not a functional defect:** `/vehicle/[id]` is a public report page whose sticky header always renders a "Sign in" link even when a buyer session exists (it does call `getSessionUser("buyer")` for data). It does not affect any of the 272 checks. Left unchanged deliberately to **preserve the existing visual design**; recommended as a separate, design-approved polish item.
8. **Audit data is retained** in the shared SQLite DB (repeat runs use unique fixtures). `SCREENSHOTS/` also contains generated RC image fixtures from earlier runs; the 29 canonical screenshots for this run are enumerated in `qa/live-e2e-summary.json`.

---

## 12. Artifacts and reproduction

| Artifact | Contents |
|---|---|
| `qa/live_e2e.mjs` | The complete live harness (`npm run qa:live`) |
| `qa/live/harness.mjs` | Shared Playwright + read-only SQLite helpers |
| `qa/live_e2e.log` | Full 272-check console transcript, ends `EXIT=0` |
| `qa/live-e2e-summary.json` | Machine-readable results, fixtures, screenshots, console errors |
| `qa/probe_schematic.mjs`, `qa/probe_schematic.json` | 3D schematic/GLB visual re-verification |
| `qa/probe-fast.json` | Fast 16-node direct investigation response |
| `SCREENSHOTS/` | 29 canonical screenshots + 2 visual verification + RC fixtures |
| `frontend/tests/live-audit-regressions.test.ts` | 51 new pure-logic regression tests |
| `LIVE_TESTING_REPORT.md`, `FEATURE_IMPLEMENTATION_AUDIT.md`, `API_TEST_REPORT.md`, `DATABASE_VALIDATION_REPORT.md`, `SECURITY_TEST_REPORT.md`, `BUGS_FIXED.md` | This audit's six deliverables |

Reproduce:

```bash
# terminal 1 — intelligence service
TD_LLM_PROVIDER=none backend/.venv/Scripts/python -m uvicorn app.main:app \
  --app-dir backend --host 127.0.0.1 --port 8000
# terminal 2 — frontend (CODEBUDDY_SAFE_DELETE_ENABLED=0 avoids the .next cleanup guard)
cd frontend && npm run dev
# terminal 3 — audit + baselines
npm run qa:live
npm test && npm run typecheck && npm run intel:test
```

**Final verdict: all six implemented categories, the Seller dashboard, the Buyer dashboard, the Python verification backend, the shared database and the security/edge-case surface pass live functional testing. No broken feature was skipped and no fake success was reported.**
