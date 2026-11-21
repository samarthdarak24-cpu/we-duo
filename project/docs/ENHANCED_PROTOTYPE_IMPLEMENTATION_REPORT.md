# TrustDrive — Enhanced Prototype Implementation Report

**Date:** 20–21 November 2026
**Scope:** Upgrade the existing TrustDrive codebase (Next.js + shared SQLite + Python intelligence service) toward the enhanced vehicle-verification prototype described in the 14-phase brief.
**Approach:** Inspect the existing implementation first, reuse working subsystems, and add only genuinely missing behaviour. No second database, no replacement marketplace, no fabricated demo results.

---

## 1. What already existed and was preserved

The repository already implemented most of the underlying platform. This pass did **not** rebuild or replace it:

| Area | Existing implementation retained |
|---|---|
| Seller flow | Vehicle creation, multi-category forms, document upload, OCR extraction, verification runs, damage records, listing publish |
| Buyer flow | Marketplace search, filters, comparison, saved vehicles, inquiries, reports, notifications, settings |
| Document verification | PyMuPDF text extraction, RapidOCR image OCR, field extraction, registration/VIN/model-year cross-checks, duplicate hash/reference checks, near-duplicate detection |
| Mileage | Stored readings, seller claims, flags, cross-modal comparison, rollback rule in verification analysis |
| AI/ML | Deterministic rules baseline, grounded LLM assistant, XGBoost model with explicit experimental/demo designation, YOLO adapter that stays inactive without weights |
| 3D inspection | Shared Three.js viewer, category assets, database-linked damage hotspots, x-ray/exploded modes where geometry exists |
| Evidence | Append-only hash chain, evidence graph, findings, disputes, consent-gated files |
| Reports | Server-generated professional PDF, report hash, public sample report |
| Multi-category | 20 implemented categories, category-specific identifiers, documents, damage components, EV battery fields |
| Security | Server-side RBAC, session revocation, consent gating, object-level ownership checks added in the previous pass |

---

## 2. New implementation in this pass

### 2.1 Unified Vehicle History Passport

A single read-only projection now combines every stored evidence type:

- documents (including OCR extraction count)
- history events
- distance/odometer readings
- damage records
- EV battery records
- deterministic findings
- verification runs
- theft checks

Each entry carries a normalised status:

`VERIFIED` · `PENDING` · `SUSPICIOUS` · `UNVERIFIED` · `NEEDS_REVIEW` · `UNAVAILABLE`

The timeline is sorted chronologically and every entry carries evidence references (`document:<id>`, `finding:<id>`, `damage:<id>`, …).

**Files**

- `frontend/lib/server/category-service.ts`
- `frontend/components/shared/VehiclePassport.tsx` (new)
- `frontend/app/vehicle/[id]/page.tsx`
- `frontend/app/seller/verification/page.tsx`
- `frontend/app/buyer/history/page.tsx`

**API**

`GET /api/v1/vehicles/:id/passport` now also returns:

- `timeline`
- `mileageAnalysis`
- `assessment`
- per-document `consent`

### 2.2 Explainable mileage analysis

The passport now returns a chronological odometer projection with:

- previous/current reading, date and source
- signed difference and days between readings
- rollback / implausible-jump classification
- severity, explanation and recommended action
- supporting document references
- method and rules version
- `reviewable: true` for the existing auditable dispute/correction flow

A decrease is explicitly described as **a warning requiring investigation, not proof of tampering**. The verification finding now carries the same previous/current/difference fields and a concrete recommended action.

**Files**

- `frontend/lib/server/category-service.ts`
- `frontend/lib/server/data.ts`

### 2.3 Explainable trust assessment

The passport assessment is deterministic and versioned. It exposes:

- assessment summary and status
- positive indicators
- risk indicators (with evidence references)
- missing information (required documents, insurance, distance history, damage records, theft coverage)
- explicit limitations (no LLM sets the score; missing data is unverified coverage; SHA-256 proves file integrity, not authenticity)
- coverage counts and method/version

**Files**

- `frontend/lib/server/category-service.ts`
- `frontend/components/shared/VehiclePassport.tsx`

### 2.4 Passport access control

The passport endpoint previously returned the full evidence set to any authenticated seller/buyer for any vehicle id, including unpublished drafts. That is now enforced:

- owner or admin → full passport (including drafts)
- other authenticated user → only a published listing, and only consented documents
- anonymous → only a published listing, redacted summary

Non-consented document names, hashes, timeline document rows and evidence-graph document payloads are removed before a buyer view is returned. The public vehicle page reuses the report's document visibility, so the server-rendered passport cannot leak private evidence either.

**Files**

- `frontend/app/api/v1/vehicles/[id]/passport/route.ts`
- `frontend/app/vehicle/[id]/page.tsx`
- `frontend/lib/server/category-service.ts`

### 2.5 Professional PDF corrections

The generated PDF now:

- states the actual versioned trust engine version instead of hardcoded `Rules v1.0`
- uses the vehicle category's real trust weights instead of hardcoded car weights
- lists every decreasing odometer reading with previous/current values and a review instruction
- states that missing records are unverified coverage, never proof of fraud

**Files**

- `frontend/lib/server/pdf.ts`
- `frontend/lib/server/data.ts`

### 2.6 Status vocabulary

`needs_review` is now a first-class status in the shared status type, badge and insight row, so `NEEDS_REVIEW` is not silently rendered as "Unverified".

**Files**

- `frontend/lib/seed.ts`
- `frontend/components/ui/StatusBadge.tsx`
- `frontend/components/ui/InsightRow.tsx`

---

## 3. API changes

| Endpoint | Change |
|---|---|
| `GET /api/v1/vehicles/:id/passport` | Adds `timeline`, `mileageAnalysis`, `assessment`; adds document `consent`; enforces owner/admin/published access; filters non-consented evidence for buyer views |
| `GET /api/v1/reports/:id/download` | PDF now uses category trust weights/version and lists decreasing readings |
| `GET /api/v1/public/sample-report` | Same PDF corrections; still built only from the fixed demo report id |

No endpoint was removed. No response field used by an existing UI was renamed.

---

## 4. Database and migrations

**No schema migration was required.** The passport, mileage analysis and assessment are read-only projections over existing tables:

`vehicles`, `documents`, `history_events`, `mileage_readings`, `damage_records`, `battery_records`, `findings`, `verification_runs`, `verification_results`, `theft_checks`, `evidence_nodes`, `evidence_edges`, `chain_records`.

The shared SQLite database remains the single source of truth for both Next.js and the Python service. No destructive migration, no duplicate database and no fabricated data were introduced.

---

## 5. Test evidence

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | PASS — 0 errors |
| Frontend unit/component | `npm test` | **411 passed / 19 skipped** |
| New passport suite | `npx vitest run tests/vehicle-passport.test.ts` | **7/7 passed** |
| Backend | `npm run test:backend` | **201 passed / 2 skipped** (RapidOCR active locally) |
| Local integrations | `npm run test:integration` | **19/19 passed** (real local SMTP/SMS/S3/ClamAV sinks) |
| Production build | `NEXT_DIST_DIR=.next_verify npm run build` | PASS — 54 static pages, all API routes compiled |
| Deployment config | `npm run render:validate` | PASS — 42/42 |
| Secret scan | `npm run secrets:scan` | PASS |
| Browser E2E (live audit) | `npx playwright test --config=playwright.lowdisk.config.ts e2e/live-audit.spec.ts` | **18/18 passed** (S1–S8, M1–M2, R1–R3, E1–E4, P1) |
| Browser E2E (deep journey) | `npx playwright test --config=playwright.lowdisk.config.ts e2e/trustdrive-deep.spec.ts` | **5/5 passed** (real image OCR upload → verify → publish → buyer finds/saves/inquires → seller replies → PDF download + forged-access rejection → RBAC) |
| Browser E2E (supporting workflow) | `npx playwright test --config=playwright.lowdisk.config.ts e2e/trustdrive.spec.ts` | **2/2 passed** (21-step seller → buyer workflow, buyer blocked from seller route) |

### New regression coverage

`frontend/tests/vehicle-passport.test.ts` verifies:

1. timeline is chronological and every status belongs to the six-status vocabulary
2. a decreasing reading reports previous/current/difference, severity, recommended action and `NEEDS_REVIEW`
3. assessment is deterministic, versioned, and includes positives, risks, missing data and limitations
4. EV battery health is never treated as distance
5. absent damage records are reported as unverified coverage, not a clean history
6. unknown vehicles return `null`, never a fabricated passport
7. restricted viewers cannot see non-consented document names/hashes/references in documents, timeline, assessment or evidence graph

The live-audit S6 test now asserts the real `timeline`, `assessment.method`, assessment status vocabulary and limitations, and checks that the passport heading renders in the browser.

### Defect found by live testing and fixed

The first deep-journey run failed on a React console error: two duplicate-document findings rendered identical assessment text, so `key={item}` produced duplicate React keys. React ignores duplicate keys silently in some paths, which can drop or duplicate list rows — a real correctness bug, not just a warning. The assessment list now uses index-qualified keys, and the deep journey passes 5/5 on rerun. No assertion was weakened to make the test pass.

### Screenshots

The Playwright suite writes live captures to `project/docs/screenshots/live/` (including `buyer-vehicle-passport-trust.png`, the buyer's vehicle-report entry point). These are test output, not hand-authored mockups; they are regenerated by the real browser run against the real API/database. The passport section itself is asserted in the DOM (`Vehicle History Passport` heading) and through the API payload checks in S6, not through that viewport capture.

> **Harness note:** the live runs reported here were executed with `frontend/playwright.lowdisk.config.ts` — a committed low-artifact profile (list reporter, desktop project only, failing-test trace/video disabled) used because the build machine had under 1 GB free disk. The application, database, OCR engine, explicit page screenshots and assertions are identical to the standard profile in `frontend/playwright.config.ts`; only automatic failure artefacts and the secondary viewport project are dropped.

---

## 6. Feature status against the 14 phases

| Phase | Status | Notes |
|---|---|---|
| 1 — Vehicle History Passport | **Implemented** | Unified timeline with six statuses; missing coverage explicit |
| 2 — Intelligent document verification | **Already implemented, verified** | Upload → validation → OCR → fields → cross-document checks → findings; confidence/source shown in Documents Manager |
| 3 — Odometer/mileage anomaly | **Implemented / strengthened** | Chronological analysis, previous/current/difference, review action; audits use existing dispute/correction flow |
| 4 — Explainable AI fraud analysis | **Already implemented, verified** | Deterministic findings, evidence refs, rules version, XGBoost labelled experimental |
| 5 — 3D damage inspection | **Already implemented, verified** | Category assets, real DB hotspots, damage capture; unavailable assets labelled |
| 6 — Multi-category support | **Already implemented, verified** | 20 categories, category-specific validation/documents/components, EV battery separated from odometer |
| 7 — Seller dashboard | **Already implemented; passport added** | Verification Center now shows the passport and assessment |
| 8 — Buyer dashboard | **Already implemented; passport surfaced** | Buyer history links to the passport; public report renders it |
| 9 — Trust assessment | **Implemented** | Positives, risks, missing data, limitations, deterministic versioned method |
| 10 — Professional PDF report | **Already implemented; corrected** | Real version/weights, decreasing-reading details, limitations |
| 11 — UX/design | **Preserved** | Existing design system reused; loading/empty/error states retained |
| 12 — Backend/DB integration | **Verified** | Shared SQLite; read-only projections; no destructive migration |
| 13 — Live testing | **Verified** | Journeys A–E exercised by the live-audit (18/18) and deep (5/5) suites against the real app, real SQLite data and real OCR |
| 14 — Final acceptance | **Conditional** | Core workflow and evidence paths work; external/provider blockers remain (below) |

---

## 7. Remaining blockers (not hidden)

These are genuine environment/provider limits, not implementation claims:

- Production email requires a verified sending domain/Resend key; local SMTP is verified only against a local sink.
- Production SMS requires a real gateway (`TD_SMS_URL`); local HTTP SMS is verified against a sink.
- S3/ClamAV are verified against local stand-ins; production needs real endpoints/credentials.
- YOLO damage detection stays inactive without licensed runtime weights on the deployment.
- EVM on-chain anchoring needs a funded signer/RPC; only the local hash chain is claimed.
- External registry/insurer/theft APIs are not configured; unavailable results are labelled.
- `render.yaml` still seeds demo data (`TD_SEED_DEMO=1`) for the production service — an operator/security decision that must be reviewed before release.
- Image OCR works locally now; a deployment without `rapidocr-onnxruntime` will honestly report `available:false` and fall back to the PDF text layer.

**Conclusion:** the enhanced passport/assessment additions are implemented, integrated, unit-tested, built and browser-tested. TrustDrive is still **not release-ready for production** until the provider/deployment blockers above and the previously documented lower-severity findings are triaged.
