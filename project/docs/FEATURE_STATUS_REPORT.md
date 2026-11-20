# TrustDrive — Honest Feature Status Report

> **Purpose.** Verify actual UI → API → shared-DB behaviour against the owner-supplied
> blueprint `TRUSTDRIVE_COMPLETE_PROJECT_DOCUMENTATION (1).pdf` (§§19–22), fix genuine
> defects, and report every feature honestly as **PASS / FAIL / BLOCKED / NOT IMPLEMENTED /
> DEMO ONLY / EXPERIMENTAL**.
>
> **Important.** The PDF is a design/blueprint reference. Its §20 "Feature Status" is the
> owner's status at the time of writing, **not** current execution evidence. Every status
> below is based on repository source plus local test/build/E2E runs in this worktree.
> All changes remain uncommitted and unpushed.

---

## 1. What was verified, and how

| Layer | Command / harness | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` (frontend) | PASS — 0 errors |
| Frontend unit/component | `npm test` | PASS — 404 passed / 19 skipped |
| Backend | `npm run test:backend` | 196 passed / 4 skipped / **3 pre-existing environment failures** (no local OCR engine) |
| Targeted regressions | delivery honesty, auth security, verification RBAC, XGB metadata | PASS — 33 targeted tests (frontend 28 + backend 5) |
| AI/intelligence | targeted `backend/tests/test_models.py` | PASS — 5 passed |
| Deployment config | `npm run render:validate` | PASS — 42 valid / 0 invalid |
| Secret scan | `npm run secrets:scan` | PASS — 392 app + 230 test/QA files, no hardcoded credentials |
| Production build | `$env:NEXT_DIST_DIR='.next_verify'; npm run build` | PASS — 54 static pages, all API routes compiled |
| Real browser E2E | `frontend/e2e/*.spec.ts` (desktop, trace/video off) | 25/25 PASS across the final targeted runs — see §2 |

**Database:** one shared SQLite file (`.data/trustdrive.db`) used by both the Next.js app and
the Python FastAPI service. No second database was introduced. No `.data/`, `.workbuddy-ai/`,
`.kilo/worktrees/` or app-card file was deleted.

---

## 2. §19.2 required end-to-end journeys

`frontend/e2e/live-audit.spec.ts` is the authoritative real-feature suite: it creates accounts
and vehicles through the actual UI, calls the real API, and reads back persisted state.

| Journey | Blueprint requirement | Status | Evidence |
|---|---|---|---|
| **A** | Seller registers a motorcycle; vehicle appears in My Vehicles; refresh confirms persistence | **PASS** | live-audit S1 + M1 (6 categories incl. `petrol_motorcycle`) |
| **B** | Seller uploads service records; scan status shown; OCR extracts details; mileage event saved; passport timeline updates | **PASS (PDF text layer) / BLOCKED (image OCR locally)** | live-audit S3 persists extracted fields; local host has no OCR engine binary/package, so image OCR cannot run here |
| **C** | Mileage inconsistency flagged deterministically with both records/dates; seller clarification; buyer sees finding; never called confirmed fraud | **PASS** | `ODOMETER_ROLLBACK` detector + fixtures; trust/findings are deterministic and versioned |
| **D** | Damage photo → validation/scan → YOLO only if available → seller review → saved record → 3D hotspot → buyer finding | **PASS with DEMO ONLY detector** | `DamageAiAnalyzer` review flow + DB hotspots verified; `car_damage.pt` YOLO is available only where weights + `ultralytics`/`torch` are installed |
| **E** | Buyer logs in, filters/scopes search, opens listing, passport, saves, sends inquiry, seller notified + replies, buyer sees update | **PASS** | live-audit S4–S7; inquiry lifecycle is DB-backed and participant-gated |
| **F** | Cross-user seller isolation; private document URL denied without permitted disclosure; denial logged | **PASS** | live-audit R1–R3 + `tests/verification-access.test.ts`; 403 on cross-user access |

**E2E suite result (final evidence, `playwright.clean.config.ts`, desktop):** **25/25 PASS**.

| Suite | Result | Coverage |
|---|---|---|
| `live-audit.spec.ts` | **18/18 PASS** | S1–S8, M1–M2, R1–R3, E1–E4, P1 in one uninterrupted run |
| `trustdrive-deep.spec.ts` | **5/5 PASS** | seller onboarding → OCR/PDF extraction → verification → AI → damage → publish → buyer save/inquiry/reply → PDF → RBAC |
| `trustdrive.spec.ts` | **2/2 PASS** | full seller→buyer workflow + buyer-route RBAC |

The combined 25-test run passed its first 19 tests before the shell wrapper's 30-minute limit,
so the final evidence is three targeted runs of the same specs with no concurrent frontend edits.
SMTP and image OCR are unavailable locally; the suites log that explicitly and still verify the
real DB/PDF-text-layer paths.

---

## 3. Feature status matrix

Legend: **PASS** verified end-to-end locally · **BLOCKED** needs external credentials/infrastructure ·
**NOT IMPLEMENTED** absent by design/scope · **DEMO ONLY** labelled synthetic data ·
**EXPERIMENTAL** not production-validated · **FAIL** genuine defect (none outstanding in fixed scope).

### 3.1 Core platform

| Feature | Status | Notes |
|---|---|---|
| Auth (register/login/logout, httpOnly session + refresh, RBAC, server-side page guards) | PASS | Session revocation now invalidates copied bearer JWTs |
| Seller dashboard metrics from DB | PASS | Derived from real tables |
| Seller vehicle CRUD, 6-step onboarding, publish/share lifecycle | PASS | Owner checks + publish gates server-side |
| Seller document upload, scan status, OCR, extracted fields, replace/reverify | PASS | Failures stay pending with reasons; no fake success |
| Buyer marketplace discovery, filters, sort, pagination | PASS | Server-side |
| Buyer detail, passport, trust score, mileage/history/damage, PDF reports | PASS | Persisted records; signed PDF download |
| Inquiry lifecycle + in-app notifications | PASS | Role-specific rules enforced server-side |
| Admin queue, disputes, listings, users, audit log | PASS | Role-gated, DB-backed |
| 3D car viewer with real GLB, category-aware model selection, DB-backed hotspots | PASS | Non-car categories get labelled schematic; no car GLB substituted |
| Shared rate limiting, signed downloads, upload quarantine/scan, audit log | PASS | Fail-closed on missing config |
| Trust score (deterministic, versioned, append-only snapshots) | PASS | LLM never sets the score |

### 3.2 Honesty / evidence features (fixed this pass)

| Feature | Status | Notes |
|---|---|---|
| Delivery failure no longer reported as `sent:true` | PASS | `forgot-password` + `AuthRecovery` + regression test |
| AI findings name real engine/model/rule and dataset label | PASS | XGB metrics + YOLO no-weights-vs-missing-runtime distinction |
| `/api/v1/health/ready` separates `llm.available` from `llm.configured` | PASS | Backend regression |
| Public landing statistics not fabricated | PASS | Fake rates/hashes/scores relabelled ILLUSTRATIVE or replaced |
| No implied active government-registry integration on landing pages | PASS | Copy now states no external registry lookup is performed |
| 3D inspector "factory verified clear" claims removed | PASS | Absence of damage = unverified coverage, not a clean bill |
| Approximate hotspot labelling | PASS | `position_source` surfaced to the viewer |
| 3D controls disabled after GLB load failure | PASS | `interactionsAvailable` now gated on real load state |

### 3.3 PDF §20.1 — BLOCKED (external credentials / infrastructure)

| Feature | Status | What is required |
|---|---|---|
| S3 / object storage | BLOCKED | Bucket, endpoint, credentials (local adapter + tests exist) |
| SMTP / SMS delivery | BLOCKED | Verified sender/provider; **Resend test mode** only delivers to the account owner; **no SMS gateway** (`TD_SMS_URL`) |
| ClamAV / external AV | BLOCKED | Running scanner (local signature scanner + quarantine work; external AV not connected) |
| VAHAN / government registry | BLOCKED | Approved access, consent and adapter (demo adapters labelled, never "verified") |
| Insurer / theft registry | BLOCKED | Authorised provider and integration |
| PostgreSQL split deployment | BLOCKED | Managed DB, migrations, connectivity; shared SQLite remains the runtime DB |
| Docker locally | BLOCKED | Working daemon (CI builds `Dockerfile.render`) |
| On-chain anchoring credentials | BLOCKED | Funded EVM signer/RPC; only local SHA-256 chain is claimed |
| Local image OCR engine | BLOCKED | `rapidocr_onnxruntime` / `paddleocr` package or `tesseract` binary absent on this host; PDF text-layer extraction works |

### 3.4 PDF §20.2 — NOT IMPLEMENTED

| Feature | Status | Notes |
|---|---|---|
| Real blockchain anchoring | NOT IMPLEMENTED | EVM adapter implemented + tested against a local JSON-RPC stub; no real network claim |
| Licensed non-car 3D GLBs | NOT IMPLEMENTED | Cars: labelled generic GLB; all other categories: labelled schematic, interactions disabled |

### 3.5 PDF §20.3 — DEMO ONLY / EXPERIMENTAL

| Feature | Status | Notes |
|---|---|---|
| XGBoost fraud score | EXPERIMENTAL | Trained/evaluated on `synthetic-demo-600`; not active in live detectors |
| YOLO damage detection | DEMO ONLY (where available) | `car_damage.pt` MIT weights; upload→detect→review→DB verified; reports availability honestly |
| LLM narrative | DEMO ONLY / config-gated | Deterministic grounded fallback always available; real provider used only when configured |
| Demo seed data and logins | DEMO ONLY | Labelled as demo in the UI; **`render.yaml` still sets `TD_SEED_DEMO=1`** (operator decision — see §6) |
| PaddleOCR | EXPERIMENTAL | Installed/selectable on larger images; not the active engine on 512 MB Free |
| Public "sample report" and 3D "inspection" visuals | DEMO ONLY | Now explicitly labelled illustrative |

---

## 4. Defects fixed in this pass

1. **Delivery honesty** — `forgot-password` returned `sent:true` on provider failure/unknown address; UI promised a link that was never sent.
2. **AI honesty** — YOLO conflated "no weights" with "missing runtime packages"; XGBoost reported null metrics; `/health/ready` conflated configured and available LLM.
3. **Session security** — revoked session-bound JWTs stayed valid until expiry.
4. **Object-level RBAC** — verification-case API, verification-run SSE stream, and the full vehicle-report API (`GET /api/v1/vehicles/:id`) were role-only IDORs: any authenticated seller could read another seller's entire evidence set. Sellers are now restricted to vehicles they own; buyers and admins retain access per `RBAC_MATRIX.md`. Regression tests added.
5. **Deployment secret** — `start.sh` shipped a repo-readable JWT signing key.
6. **CI/config** — wrong sink paths, nonexistent test targets, missing `render:validate`, duplicate uvicorn, incomplete secret-scan coverage, undocumented env vars.
7. **E2E harness** — intelligence service was not started; deep spec read the wrong API shape and skipped the photo step; label selectors were ambiguous; WebKit binary was missing.
8. **Displayed-evidence honesty** — fabricated landing statistics, fake hashes/scores, implied official integrations, fabricated 3D "factory verified clear" claims, unlabelled approximate hotspots, and enabled 3D controls after asset failure.
9. **Malformed-PDF upload** — a file with a valid `%PDF-` magic header but no `%%EOF` trailer was accepted as a document; uploads now require a structurally complete PDF (422 otherwise), with a unit regression test.
10. **Saved-vehicle identity** — the buyer Saved grid already received `regNo` from `getSavedVehicles()` but never rendered it; the registration number is now shown so a shortlisted vehicle is identifiable. (E2E exposed both this and a stale selector in the edge-case spec.)
11. **Deep E2E false signals** — the suite matched the static “Published never” label as if publication succeeded and watched a transient “Run complete” alert that `router.refresh()` can erase. It now waits for React hydration, asserts the publish API response and polls the public marketplace API, and asserts the persisted verification run ID returned by the API. It also uses a real report type (`Vehicle verification`) rather than the unsupported `full`.

---

## 5. Pre-existing failures that were investigated, not caused by these changes

- **Backend OCR tests (3 failing):** no OCR engine installed locally (`rapidocr_onnxruntime`,
  `paddleocr`, and the `tesseract` binary are all absent). These are environment failures, not
  regressions; the code reports `available:false` honestly.
- **Deep-spec image-OCR assertion:** originally failed as if a defect. The suite now queries
  `/api/v1/ai/stack`, asserts the honest `isOcr:false` result when no engine is installed, and
  logs an explicit environment-blocker warning; parsed-field assertions run only when a real
  engine produced fields.
- **Windows single-threaded `next dev` slowness:** mitigated by isolated distDir, DOM-content-loaded
  navigation plus React-hydration waits, and disabling trace/video; tests are serial and timeouts
  were raised. The shell wrapper timed out after 30 minutes during one combined run, but every
  spec passed in the final targeted runs.

---

## 6. Remaining honest findings (not fixed here)

These are real gaps discovered during the audit. They are disclosed rather than silently
papered over:

- **`render.yaml` production + `TD_SEED_DEMO=1`**: the deployed blueprint is an explicitly labelled
  demo with known accounts and password. Changing it is an operator/security decision, so it was
  left as-is and is flagged here.
- **X-Forwarded-For spoofing** can affect rate-limit/lockout keys on deployments that trust a proxy
  without normalising headers.
- **Registration user enumeration** and **`getSessionUser()` ignoring the portal argument** are
  lower-severity auth findings.
- **TOTP login field absent from the main login form** (the API supports a `code`, but the shipped
  form never renders it), and **"Remember me for 30 days" is cosmetic** (cookie is fixed at 7 days).
- **Seller document re-download** is not exposed in the UI after refresh, and **admin document
  approve/reject** and a **KYC audit trail** are absent.
- **Compare / passport / other vehicle subresource object visibility** remain role-only for some
  GETs; a stricter owner/consent/published check is warranted before treating those as hardened.
  (`GET /api/v1/vehicles/:id`, the verification API and the run stream were fixed this pass.)
- **OCR sync vs worker path divergence** and **scanned-PDF OCR** under Tesseract/PaddleOCR need a
  dedicated comparison pass.
- **Trust-score version parity** was not explicitly re-verified in this pass.
- **E2E CI job is manual-only**; compose app healthchecks and deployment-doc drift remain.
- **Buyer demo defaults/recommendations** ("Try:" IDs, default `v-bmw`) are not uniformly labelled.

---

## 7. Conclusion (§22 Definition of Done)

For the workflows in scope — registration, 6-step vehicle creation across all implemented
categories, document upload/extraction, deterministic findings, publish/marketplace, buyer
passport/save/inquiry, admin actions, role/ownership isolation, and evidence honesty — the
UI → API → shared-DB path is verified and the automated suites pass, with the exceptions
explicitly labelled above. No feature was silently removed, no fake result is presented as real,
and every external or resource blocker is disclosed rather than simulated.

**Not release-ready as a production system** until the §3.3 blockers are provisioned, the §6
findings are triaged, and the demo-seeding policy is decided by the operator.
