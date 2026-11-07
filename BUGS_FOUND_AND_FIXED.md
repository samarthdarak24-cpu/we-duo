# TrustDrive — Bugs Found and Fixed

**Date:** 2026-11-07 · **Method:** real Chromium browser, real API calls, read-only SQLite assertions, Vitest/Pytest. Every fix below was retested; no bug was hidden with a mock, an empty success response or a hardcoded status.

## Summary

| # | Defect | Severity | Fixed | Retest |
|---:|---|---|---|---|
| 1 | Document upload wrote `pending` but never ran OCR; UI implied verification was queued | Critical (fake-success risk) | Real `document-ocr.ts` bridge + persisted extraction | Live OCR 11/11 + 6 categories |
| 2 | AI investigation always used the Next deterministic fallback even when Python was healthy | High | Python-first route, persisted `ai_runs`, labelled fallback | Live 9/9, `orchestrator=langgraph` |
| 3 | Demo theft row was treated as a clean provider check | High (false assurance) | Demo source detected → `unavailable`; missing ≠ clean | Live honesty checks |
| 4 | Marketplace `q` did not search registration/VIN/TrustDrive ID | Medium | Search extended; SQL metacharacters treated as text | Live search `MH12QA7132` |
| 5 | Buyer/other-seller could see private document metadata; raw bytes not gated | High | Consent + ownership gates on document routes | Security 13/13 |
| 6 | Duplicate RC uploads re-verified with no duplicate marker | Medium | Hash/history duplicate detection → `needs_correction`, `duplicate_of` | OCR negative 10/10 |
| 7 | 3D viewer used the sedan GLB for every category | High (design rule 13) | `assetUrl:null` for 2W; labelled schematic; interactions disabled | 4/4 2W live checks |
| 8 | `app/vehicle/[id]/page.tsx` passed invalid `style` prop to `Icon` | Medium (tsc failure) | Removed invalid prop | `tsc --noEmit` clean |
| 9 | 3D hotspot buttons lacked accessible names; model/damage fetch could race | Medium | `aria-label` with damage count; viewer waits for DB hotspots | Live hotspot click |
| 10 | Two `next dev` processes shared `.next` and corrupted the manifest → 500 on vehicle/report pages | Critical (environment/process) | One server, isolated `NEXT_DIST_DIR` | Pages 200, 0 JS errors |
| 11 | Public “Download Real PDF” CTA returned 403 JSON | High (broken visible action) | Public demo sample-report endpoint with real PDF + demo headers | 200, 106,834-byte `%PDF` |
| 12 | Public vehicle page showed “Sign in” to a signed-in buyer | Medium (session UX) | “My workspace” link when session exists | Browser header verified |
| 13 | Offline “Live stack” showed 7 green active dots | High (evidence honesty) | Offline rows are `off`, labelled documented build/not live | 0 green dots offline |
| 14 | Seller publish read `listingId` from a stale closure | Medium (latent) | Local id assigned before publish; server gate authoritative | Wizard publish retest |
| 15 | React hydration warning on Buyer dashboard search input | Low (cosmetic/extension) | `suppressHydrationWarning` on that input only | Broad run 0 unexpected console errors |
| 16 | Multicategory marketplace test assumed default page 12 covered all 2-wheelers | Low (test robustness) | Test requests `pageSize:48`; assertion unchanged | `npm test` 187/187 |
| 17 | Evidence collector used `documents.uploaded_at` (column does not exist) | Low (harness) | Use real `created_at`; harness only | Evidence summary regenerated |
| 18 | Independent harness used wrong seller2 account and `storage_key` column | Low (harness) | Correct seller `weduo@` and `file_key`; assertions unchanged | Independent security 10/10 |
| 19 | Trust score was never persisted; `trust_scores` history stayed empty | Medium | `ensureTrustScoreSnapshot()` after trust reads and verification runs; dedupe + `computed_by` | Unit 17/17 + live route history |
| 20 | Rate limiting lived only in a process-local map | Medium (security) | Shared `rate_limit_hits` sliding window with memory fallback | `ratelimit.test.ts` 3/3 |
| 21 | Signed download tokens fell back to a public dev secret in production | High (security) | Fail closed without a configured secret; local demo explicitly allows dev fallback | `signed.test.ts` 4/4 |
| 22 | Fresh-database FK rebuild aborted on views, leaving core tables without FKs | High | Drop/recreate views around the 12-step table rebuild | Fresh DB: all tables rebuilt, orphan rejected |
| 23 | “demo workspace” label always rendered even with `TD_SEED_DEMO=0` | Low (honesty) | Conditional `demo` prop from the environment | Typecheck + visual check |
| 24 | Duplicate `TD_INTELLIGENCE_URL` key in root `.env` | Low (hygiene) | Removed the duplicate | Duplicate-key scan clean |
| 25 | `POST /api/v1/reports/vehicle/:id` returned HTTP 404 for a valid-route/invalid-body case (`VALIDATION_FAILED`) | Low (API contract) | Status mapped by code: 404/403/400 | Live: `"type":"full"` → **400**, valid type → **201** |
| 26 | FastAPI failed to boot after the lazy-secret refactor (`from ..security import SECRET` no longer existed) | High (startup) | Public `signing_secret()` accessor; marketplace and security tests updated | `import app.main` OK; live `/health` 200; **127/127** Pytest |
| 27 | Expired/tampered report download tokens returned “This report belongs to another account” | Low (honesty) | Distinct `DOWNLOAD_LINK_INVALID` message when a token is presented but fails verification | Live: tampered link → 403 `DOWNLOAD_LINK_INVALID` |

## Details of the most important fixes

### 1. OCR was not actually connected
**Before:** upload route stored the file and set `documents.status="pending"`; no OCR job ran. The UI copy implied verification was in progress.
**Fix:** `frontend/lib/server/document-ocr.ts` calls FastAPI `/api/intelligence/documents/process` with the service token, persists `documents.extracted`, `documents.status`, `verified_at` and `document_extractions`, and returns engine/method/confidence/flags. If the service is down, the document stays `pending` with a real `status_reason`.
**Retest:** focused 11/11; six-category 6/6; negative inputs 10/10.

### 2. AI investigation ignored the real agent
**Before:** the Next route returned only the deterministic review even when the Python service was healthy.
**Fix:** Python-first call; response carries `orchestrator`, `nodes`, `human_review`, `model_versions`, `limitations`; fallback is explicitly labelled `next-deterministic-fallback` / `deterministic-next`.
**Retest:** 9/9 focused; 6/6 categories; `ai_runs.graph=langgraph-conditional`.

### 3. Demo theft was treated as clean
**Before:** a demo-labelled theft row counted as a clean check in verification/insights.
**Fix:** demo/mock/sample sources are ignored for conclusions; missing checks are `unavailable`/`pending`; theft can never be `verified` without a real provider.
**Retest:** honesty checks in the live run and insights/alert tests.

### 5. Private documents were over-exposed
**Before:** buyer/other seller could list document metadata; raw bytes were not consistently owner/admin-only.
**Fix:** buyer sees only consented documents on a published listing; other seller 403; owner/admin full list; raw bytes owner/admin only.
**Retest:** security 13/13, including 0 unconsented items and 403 for other seller and buyer raw bytes.

### 7. Fake 3D vehicle
**Before:** every category loaded the sedan GLB.
**Fix:** category asset policy returns `url:null` for two-wheelers; UI renders a labelled schematic and disables interactions. Cars keep the real GLB and clearly label it `generic-reference`.
**Retest:** all six category pages; 4/4 2W checks; no car geometry/text on 2W pages.

### 10. Corrupted Next.js manifest
**Before:** two `next dev` processes wrote the same `.next`; `lucide-react` vendor chunk disappeared; `/vehicle/[id]` and `/print/report/[id]` returned 500.
**Fix:** one server, isolated `.next_independent` / `.next_qa` / `.next_verify` directories.
**Retest:** 40 authenticated pages 200, 0 JS exceptions.

## Remaining issues (not silently fixed)

| Issue | Status | Note |
|---|---|---|
| External registries (government/insurer/theft) | BLOCKED | no credentials/adapters; always disclosed |
| Blockchain anchoring | BLOCKED | local SHA-256 only; no on-chain claim |
| YOLO photo damage end-to-end | BLOCKED | weights/adapter exist, upload→detection flow not implemented/tested |
| Production XGBoost fraud model | BLOCKED | synthetic-demo training only |
| LLM narrative | BLOCKED | `TD_LLM_PROVIDER=none`; deterministic text used |
| S3 / external AV / email / SMS / Postgres | BLOCKED | local disk, local scan, in-app notifications, SQLite only |
| PaddleOCR | BLOCKED | not installed; RapidOCR active |
| Docker build | NOT RUN | daemon unavailable in this environment |
| Hydration warning on DocumentsManager file input | COSMETIC | injected attribute false positive; not reproducible in SSR source |

**Closed in the final hardening pass:** durable LangGraph checkpoints (SQLite), test-database isolation, persisted trust snapshots, DB-backed rate limiting, fail-closed signed downloads, fresh-database FKs and the duplicate `.env` key. See `ALL_BUGS_FOUND.md` §2b/§6.7–6.9.

**No failed feature remains hidden. All BLOCKED/NOT IMPLEMENTED items are listed in `FEATURE_BY_FEATURE_AUDIT.md` and `MISSING_CONNECTIONS.md`.**
