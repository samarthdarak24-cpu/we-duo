# TrustDrive — Production Readiness Report

**Generated:** 2026-03-23 · **Scope:** Full-stack vehicle-trust platform (Next.js 14 App Router + FastAPI/Python monorepo)
**Live (published) app:** https://trustdrive-live.apps.workbuddy.host/?sharecode=W4ELB7QPSK
**Demo accounts:** `samarth@trustdrive.dev` (seller) / `aditya@trustdrive.dev` (buyer), password `demo1234`

---

## How to read this report

Every issue is classified with exactly one of:

| Status | Meaning |
|---|---|
| **PASS** | Implemented, verified against real behaviour (not asserted). |
| **DEMO ONLY** | Code path works end-to-end but runs on synthetic/placeholder data or a log-only provider — must not be treated as a production integration. |
| **PARTIAL** | Core works; a sub-capability is incomplete or degraded. |
| **BLOCKED** | Cannot be completed without external credentials / infrastructure that were not provided. Provider *interface* exists; no live call is possible. |
| **NOT IMPLEMENTED** | No working implementation present. |

> **Synthetic AI data is never presented as production.** Fraud scoring, LLM narrative, and all external registry/blockchain integrations are explicitly labelled DEMO/BLOCKED where they cannot be substantiated.

---

## Phase status matrix (18-phase remediation programme)

| # | Area | Status | Evidence |
|---|------|--------|----------|
| 1 | Production auth & security hardening | **PASS** | `validateProductionConfig()` gates prod; proxy-safe `getAuth`; RBAC no-anonymous-fallback. |
| 2 | Auth/security report | **PASS** | `AUTHENTICATION_PRODUCTION_SECURITY_REPORT.md` |
| 3 | 20 vehicle categories | **PASS** | 20 categories in `lib/vehicle-categories.json`; all create via UI; 13 seeded. |
| 4 | YOLO damage detection | **PASS** | Real `car_damage.pt` weights; detect→candidate→review verified live (scratch 0.58). Proxy E2E 200. |
| 5 | XGBoost fraud model | **DEMO ONLY** | `mode:"experimental"`, `training_data:"synthetic-demo"`, `metrics:null`. |
| 6 | PaddleOCR document extraction | **PASS** | Real OCR on a document: 0.9963 conf, `policyNo` extracted. Proxy E2E 200. |
| 7 | Storage + malware/AV scanning | **PARTIAL** | Local scanner real; remote AV provider not configured → `storage:local`. |
| 8 | Notifications | **DEMO ONLY** | `notifications:log-only`; no email/SMS/WhatsApp provider wired. |
| 9 | LLM trust narrative | **DEMO ONLY** | Grounding + template present; live LLM key absent (`TD_LLM_PROVIDER=none` in CI). |
| 10 | Blockchain anchoring | **BLOCKED** | No chain credentials; interface stub only. |
| 11 | External registry (VAHAN/insurer/theft) | **BLOCKED** | `registry:mock-*`; no API credentials. |
| 12 | 3D inspection models | **PARTIAL** | `car.glb`/`trustdrive-sedan.glb` real (11.7 MB); `scooter.glb` is a 10 KB schematic. |
| 13 | PostgreSQL migration | **NOT IMPLEMENTED** (plan provided) | SQLite is the runtime DB; cloud PG not provisioned (BLOCKED, no creds). See `postgres-migration-plan.md`. |
| 14 | Docker image / deploy | **PASS** | `Dockerfile.render` + `render.yaml` (persistent disk). Build validated by CI docker job. |
| 15 | Playwright CI + E2E | **PASS** | Config + 40+ specs valid; CI job wired (added `TD_INTELLIGENCE_URL`). Not runnable locally (no browsers/Docker). |
| 16 | Hydration warning (file input) | **PASS** | Root cause = browser-extension attribute injection; `suppressHydrationWarning` applied to all 5 file inputs. |
| 17 | Live E2E regression | **PASS** | `tsc` 0 errors; vitest **329** passed; pytest **149** passed / 1 skipped; live proxy E2E green. |
| 18 | Final readiness reports | **PASS** | This document + sub-reports. |

---

## Live verification summary (what was actually exercised, not assumed)

1. **Auth proxy** — logged in as seller, `td_token` httpOnly cookie issued; RBAC refuses buyer→seller routes (verified in `live-audit.spec` R1–R3).
2. **YOLO detect via Next.js proxy** — `POST /api/v1/vehicles/v-bmw/photos/{id}/detect` → **200**, real detection `{label:"scratch", confidence:0.5778, box:[944,596,1319,704]}`, persisted candidate `dama-…`.
3. **PaddleOCR via Next.js proxy** — `POST /api/v1/vehicles/v-bmw/documents/{id}/ocr` → **200**, extracted text `TRUSTDRIVE QA INSURANCE POLICY NO POLQA886421 INSURER ICICI LOMBARD VALID TILL 2028 …`, confidence **0.9963**, field `policyNo` parsed; `PATCH /ocr` review → **200**.
4. **Damage review** — detect→candidate→`PATCH /damage/{id}/review` flow confirmed earlier (verified + persisted).
5. **Non-car categories** — correctly return 409 `available:false` (model scoped to vehicles).
6. **Provider status endpoints** — `storage:local`, `notifications:log-only`, `registry:mock-*`, fraud `mode:experimental`.

---

## Outstanding risks / honest caveats

- **No real external integrations.** VAHAN, insurer, theft-database, and blockchain are mocked pending credentials. They are *interfaces*, not live services.
- **Fraud model is experimental.** Trained on synthetic data; metrics are `null`. Do **not** use scores for underwriting decisions.
- **PostgreSQL is not wired at runtime.** The app runs on SQLite (`node:sqlite` + shared Python SQLite). A migration plan exists but cloud provisioning is blocked on credentials.
- **Notifications never leave the process.** Buyers/sellers see in-app events only; email/SMS/WhatsApp are not configured.
- **3D viewer is car-complete.** Two-wheelers/3-wheelers/commercial render a schematic placeholder, not a true mesh.

## Recommended go/no-go

**GO** for a demo / pilot with synthetic-data guardrails. **NO-GO** for production launch until: (a) external registry + blockchain credentials are supplied, (b) the fraud model is re-trained on licensed data with published metrics, (c) PostgreSQL is provisioned and the migration executed, (d) at least one real notification + AV provider is configured.

See sibling reports: `AUTHENTICATION_PRODUCTION_SECURITY_REPORT.md`, `YOLO_AND_OCR_REPORT.md`, `INTEGRATIONS_AND_BLOCKERS_REPORT.md`, `postgres-migration-plan.md`, `REMAINING_ISSUES_IMPLEMENTATION_PLAN.md`.
