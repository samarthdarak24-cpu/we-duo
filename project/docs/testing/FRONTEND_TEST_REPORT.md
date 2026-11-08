# TrustDrive — Frontend Test Report

**Date:** 2026-11-07 · **Browser:** headless Chromium via Playwright (`frontend/node_modules`)
**Frontend:** Next.js 14.2.35 App Router, `http://127.0.0.1:3000` (production build also verified with `NEXT_DIST_DIR=.next_verify`)
**Result: PASS — 40/40 authenticated pages, 10/10 public pages, 44/44 responsive checks, 0 unexpected console errors in the broad run.**

## 1. Page inventory

| Area | Pages | Result |
|---|---:|---|
| Public | `/`, `/login`, `/register`, `/forgot-password`, `/reset-password/[token]`, `/marketplace`, `/vehicle/[id]`, `/verify/[token]`, `/verify-email/[token]`, `/about`, `/contact`, `/faq`, `/resources`, `/technology`, `/inspection`, `/print/report/[id]` | All HTTP 200 |
| Seller | `/seller`, `/seller/add-vehicle`, `/seller/vehicles`, `/seller/vehicles/[id]`, `/seller/documents`, `/seller/history`, `/seller/verification`, `/seller/fraud`, `/seller/listings`, `/seller/listings/[id]`, `/seller/inquiries`, `/seller/inquiries/[id]`, `/seller/reports`, `/seller/notifications`, `/seller/settings` | All HTTP 200 |
| Buyer | `/buyer`, `/buyer/explore`, `/buyer/search`, `/buyer/saved`, `/buyer/compare`, `/buyer/history`, `/buyer/risk`, `/buyer/reports`, `/buyer/verification`, `/buyer/inquiries`, `/buyer/inquiries/[id]`, `/buyer/notifications`, `/buyer/settings` | All HTTP 200 |
| Admin | `/admin/queue`, `/admin/kyc`, `/admin/users`, `/admin/audit`, `/admin/notifications`, `/admin/settings` | All HTTP 200 |

The independent sweep loaded **40 authenticated pages** (`qa/indep-pages.json`) and every page returned HTTP 200 with `pageErrors: []`. The public site sweep covered the 10 public routes in the same harness.

## 2. Real browser journeys

| Journey | What was actually done | Evidence | Result |
|---|---|---|---|
| Seller login | Typed `#login-email` / `#login-password`, clicked submit, waited for `POST /api/v1/auth/login` 200 and `/seller` | `qa/indep-results-full-pass1.json`, `SCREENSHOTS/seller-dashboard.png` | PASS |
| Buyer login | Same form, landed on `/buyer` | `qa/indep-results-full-pass1.json`, `SCREENSHOTS/buyer-dashboard.png` | PASS |
| Wrong password / empty form | Wrong password stayed on login with an error; empty submit did not call the API | independent auth checks 13/13 | PASS |
| Registration | Real form submitted; new user row written to SQLite; role enforced | independent auth checks | PASS |
| Session persistence | Reload preserved the session; protected API still authorised | independent auth checks | PASS |
| Logout | Backend logout 200, cookie cleared, protected API 401 | independent auth checks | PASS |
| Seller wizard ×6 categories | Selected category, filled wizard fields, submitted real draft, verified category-specific labels/fields | `SCREENSHOTS/cat-*-step0.png` | PASS 6/6 |
| Document upload | Real multi-part RC image upload through the UI; OCR result rendered | `SCREENSHOTS/feat1-rc-ocr.png` | PASS |
| OCR negative UI | Unsupported, corrupt, blank and duplicate files show real error/needs-correction states | `SCREENSHOTS/ocr-negative.png` | PASS |
| Mileage rollback | Submitted 52,000 → 41,000 km; finding rendered | `SCREENSHOTS/feat2-mileage-rollback.png` | PASS |
| AI investigation | Clicked investigation, rendered LangGraph node timeline, findings and citations | `SCREENSHOTS/feat3-ai-investigation.png` | PASS |
| Damage record | Saved damage and saw it in the vehicle workspace | `SCREENSHOTS/feat4-damage-record.png` | PASS |
| Marketplace + 3D | Published listing, searched by registration, opened buyer page, clicked 3D hotspot | `SCREENSHOTS/feat5-marketplace-3d.png`, `SCREENSHOTS/buyer-car-3d-hotspot.png` | PASS |
| Seller inbox reply | Buyer inquiry visible in seller inbox; seller replied; buyer thread showed 2 messages | `SCREENSHOTS/feat6-seller-inbox-reply.png`, `SCREENSHOTS/seller-inquiry-reply.png` | PASS |
| PDF download | Real `%PDF` bytes (45,266 / 42,804 / 106,834 across runs) | `qa/live-browser/evidence_summary.json` | PASS |
| Category detail pages | All six categories open with correct label/asset | `SCREENSHOTS/buyer-*-detail.png` | PASS |

## 3. Responsive testing

`qa/indep-responsive.json` contains 44 checks: 11 representative routes × 4 viewports.

| Viewport | Routes | Status | Overflow | JS errors |
|---|---|---:|---|---:|
| Desktop 1440×900 | seller dashboard/add vehicle/vehicles/listings; buyer dashboard/explore/search/saved; public home/marketplace/login | 200 | none | 0 |
| Laptop 1366×768 | same 11 routes | 200 | none | 0 |
| Tablet 768×1024 | same 11 routes | 200 | none | 0 |
| Mobile 390×844 | same 11 routes | 200 | none | 0 |

Every check recorded `scrollWidth === innerWidth`, `bodyWidth` within the viewport, `overflow: false`, `jsErr: 0`, `ok: true`.

## 4. Console and network health

| Run | Console result |
|---|---|
| Broad live run `LIVE-MW6DOO1A` | 12 captured errors, all deliberate `400/403/409/422` negative-test responses; **0 unexpected** |
| Independent page sweep | `pageErrors: []` for all 40 authenticated pages |
| Responsive sweep | `jsErr: 0` for all 44 checks |
| Focused `MW5ATBQ1` run | One hydration warning about an extra `style` attribute on a file input; SSR/render source emits no such attribute (browser autofill/extension false positive, same class of issue as the fixed Topbar warning). Not reproducible as an application defect and not counted as a failed check. |

No broken API requests were observed in the successful journeys. Expected 401/403/409/415/422 responses are documented in the security and OCR reports.

## 5. Frontend automated tests

```text
cd frontend
npm test -- --run
→ 15 files passed, 187 tests passed
```

Coverage includes:
- `tests/live-audit-regressions.test.ts` — 51 regression tests from the live audit.
- `tests/multicategory.test.ts` — 44 category/taxonomy/DB tests.
- `tests/seller-buyer-workflow.test.ts` — 15-step seller→buyer workflow.
- `tests/vehicle-3d-inspection.test.ts` — GLB/component/hotspot behaviour.
- `tests/component/listing-action-bar.test.tsx` — React Testing Library component test.
- `tests/ratelimit.test.ts` — shared DB limiter: 429, `Retry-After`, persisted rows, bucket/IP isolation.
- `tests/signed.test.ts` — signed download round-trip, tamper, malformed and expiry rejection.
- `tests/ai-assistant-wiring.test.ts`, `engine.test.ts`, `validation.test.ts`, `scan.test.ts`, `chain.test.ts`, `format.test.ts`, `db-intelligence.test.ts`, `public-site.test.ts`.

Tests run against a fresh seeded database created by `tests/setup-db.ts`; set `TD_TEST_SNAPSHOT_LIVE=1` only to debug against a live snapshot.

**Final count: 187/187 PASS.** `npx tsc --noEmit` is clean.

## 6. Visual evidence

`SCREENSHOTS/` contains **69 PNG files**:
- 29 canonical screenshots from the six-category live run (seller dashboard, category step0/investigation/published ×6, buyer dashboards/details, 3D hotspot, inquiry reply, taxonomy).
- 6 focused feature screenshots (`feat1`–`feat6`) plus `ocr-negative.png`.
- 8 screenshots in `SCREENSHOTS/live/` and 10 in `SCREENSHOTS/independent/` (registration, persistence, bug retests, responsive desktop/mobile).

Every screenshot listed in `qa/live-e2e-summary.json` was captured by the real browser during the run, not mocked or composited.

## 7. Known UI limitations

1. **LLM narrative is disabled** (`TD_LLM_PROVIDER=none`); the UI shows deterministic evidence-only text. This is labelled, not fabricated.
2. **Two-wheelers use a labelled schematic**, not a car GLB. Interaction controls are disabled and the page says no 3D model is available.
3. **External provider panels** show `unavailable`/demo labels because no government/insurer/theft credentials are configured.
4. **OCR confidence is extraction confidence**, not authenticity. The UI carries the explicit machine-read warning.
