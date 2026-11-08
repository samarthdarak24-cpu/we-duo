# TrustDrive — Full Regression Test Report

**Date:** 2026-11-08

## Test Summary

| Suite | Result | Details |
|-------|--------|---------|
| Frontend unit/component (Vitest) | **329 passed** | 16 test files |
| Backend unit (Pytest) | **150 passed** | Backend tests |
| TypeScript typecheck | **0 errors** | `npx tsc --noEmit` |
| Prior live browser (broad) | **272/272** | `LIVE-MW6DOO1A` |
| Prior live browser (focused) | **49/49** | `MW5ATBQ1` |
| OCR negative paths | **10/10** | PaddleOCR unavailable paths |
| Security / RBAC focused | **13/13** | Auth and authorization checks |
| Independent security/API | **10/10 + 15/15** | Security + API checks |
| Page sweep | **40/40** | All pages render |
| Responsive | **44/44** | Desktop + mobile |

## Frontend Tests (329 passed, 16 files)

| Test File | Tests | Status |
|-----------|-------|--------|
| `tests/multicategory.test.ts` | 54 | 20-category taxonomy validation |
| `tests/live-audit-regressions.test.ts` | 167 | Category-aware VIN, EV fields, 3D assets, publish gate |
| `tests/auth-security.test.ts` | 16 | Anonymous 401, wrong role 403, tampered JWT, cross-user isolation |
| `tests/seller-buyer-workflow.test.ts` | 15 | Complete Seller→Buyer cross-role journey |
| `tests/db-intelligence.test.ts` | 17 | Phase 4 intelligence entities |
| `tests/vehicle-3d-inspection.test.ts` | 8 | 3D hotspot → damage record mapping |
| `tests/ai-assistant-wiring.test.ts` | 4 | LLM narrative grounding |
| `tests/engine.test.ts` | 12 | Trust engine |
| `tests/ratelimit.test.ts` | 3 | Rate limiting |
| `tests/validation.test.ts` | 9 | Input validation |
| `tests/signed.test.ts` | 4 | Signed download/QR |
| `tests/scan.test.ts` | 4 | File scan |
| `tests/chain.test.ts` | 4 | SHA-256 chain |
| `tests/public-site.test.ts` | 3 | Public pages |
| `tests/format.test.ts` | 4 | Formatting |
| `tests/component/listing-action-bar.test.tsx` | 5 | Listing action bar |

## Backend Tests (150 passed)

| Test Area | Status |
|-----------|--------|
| Health and active backends | PASS |
| Vehicle categories (20 implemented) | PASS |
| Category resolution (legacy + explicit) | PASS |
| Identity validation (VIN vs chassis) | PASS |
| Electric/hybrid field rules | PASS |
| Commercial / 3W documents | PASS |
| Component sets | PASS |
| Battery findings (EV + hybrid) | PASS |
| Agent node lists (15/16 conditional) | PASS |
| OCR endpoint (409 when unavailable) | PASS |
| OCR manual correction | PASS |
| YOLO damage detection | PASS |
| Damage review (confirm/reject) | PASS |
| Fraud model status (experimental) | PASS |
| Provider status endpoints | PASS |
| Storage / registry / notification status | PASS |

## Regression Areas Covered

1. **20-category taxonomy** — All new categories (moped, e-bike, 3-wheelers, hatchback, SUV, MUV, hybrid, commercial) validated in both TS and Python.
2. **Strict category resolution** — Unknown labels return `VALIDATION_FAILED`, never silent car fallback.
3. **Powertrain-dependent validation** — VIN only for 4-wheelers; EVs reject engine numbers; hybrids keep engine + battery.
4. **Category-specific documents** — `rc_2w`/`rc_3w`/`rc_commercial`; permits/fitness/road_tax for commercial/3W.
5. **YOLO damage workflow** — Backend detect/review endpoints; frontend `DamageAiAnalyzer` component; buyer passport damage visibility.
6. **Authentication & RBAC** — Anonymous 401, wrong role 403, tampered JWT, cross-user isolation, `TD_SEED_DEMO=0` guard.
7. **OCR honesty** — RapidOCR active; PaddleOCR reports `unavailable`; endpoint returns 409 when engine absent.
8. **XGBoost honesty** — `mode: experimental`; synthetic demo data; no production metric claims.
9. **Integrity chain** — SHA-256 append-only; not claimed as blockchain.

## Remaining (Not Yet Executed)

| Area | Classification | Reason |
|------|---------------|--------|
| Live browser rerun after category/YOLO changes | NOT IMPLEMENTED | Needs running services + seeded DB |
| Docker build verification | BLOCKED | Docker daemon unavailable locally |
| Playwright local browser run | BLOCKED | Chromium not installed locally |
| Postgres migration test | BLOCKED | No Postgres driver/migration layer |

## Commands

```powershell
# Frontend
cd frontend
npx tsc --noEmit
npm test -- --run

# Backend
cd backend
.\.venv\Scripts\python.exe -m pytest tests -q

# Build (isolated)
cd frontend
$env:NEXT_DIST_DIR='.next_verify'
npm run build
```
