# TrustDrive — Production Readiness Report

**Date:** 2026-11-08
**Scope:** Full TrustDrive platform (Next.js + FastAPI, shared SQLite DB)

## Summary

TrustDrive is production-ready for local/container deployment with honest labelling of all external integrations. Core Seller → Buyer workflows are implemented and tested. External credentials-dependent features (S3, SMTP, ClamAV, blockchain, VAHAN, PaddleOCR, production XGBoost, Postgres) are reported as `unavailable`, `BLOCKED`, or `DEMO ONLY` — never claimed as working.

## Classification Key

- **PASS** — Implemented and tested with actual evidence.
- **DEMO ONLY** — Works with synthetic/demo data; not production validated.
- **BLOCKED** — Missing credentials, infrastructure, or provider access.
- **NOT IMPLEMENTED** — No real implementation exists.

## Findings

| Area | Classification | Evidence |
|------|---------------|----------|
| Next.js frontend + FastAPI backend | PASS | 329 frontend tests, 150 backend tests, typecheck clean |
| Shared SQLite database | PASS | 55 tables, integrity_check=ok, WAL mode, FK enforced |
| Authentication (JWT, scrypt, RBAC) | PASS | `requireRole`, `getAuth`, session/refresh rotation, rate limiting |
| Authorization (Seller/Buyer/Admin) | PASS | Role checks on every API route + page-level guards |
| TD_SEED_DEMO=0 production guard | PASS | `validateProductionConfig` forces `TD_SEED_DEMO=0` in production; `seed()` skips demo accounts |
| Anonymous access rejection | PASS | `getAuth` returns null; `requireRole` returns 401/403 |
| Cross-user isolation | PASS | Owner checks on vehicles, documents, damage records |
| Vehicle categories (20 implemented) | PASS | Taxonomy `multicategory-2.0.0`; strict resolver; class-filtered marketplace |
| Category-specific validation | PASS | VIN only for 4-wheelers; EVs reject engine numbers; hybrids keep both |
| Commercial / 3W documents | PASS | `rc_2w`/`rc_3w`/`rc_commercial`; permits, fitness, road_tax |
| Hybrid battery evidence | PASS | `hasBatteryPack()` applies to EV + hybrid; SOH ≠ odometer |
| YOLO damage detection (backend) | PASS | FastAPI `/detect` creates `damage_records` with `provenance="detected_visible_damage"`; `/review` confirms/rejects |
| YOLO damage detection (frontend UI) | PASS | `DamageAiAnalyzer` component integrated into seller vehicle page |
| Buyer passport damage visibility | PASS | Passport includes damage records with `positionSource` and provenance legend |
| OCR (RapidOCR active) | PASS | RapidOCR active and labelled; PaddleOCR adapter reports `unavailable` |
| OCR endpoint (409 when unavailable) | PASS | Fixed to return 409 with `{"available": false, "reason": ...}` |
| XGBoost fraud model | DEMO ONLY | Synthetic demo training data; `mode: "experimental"`; no production metrics |
| LLM narrative | DEMO ONLY | `TD_LLM_PROVIDER=none`; deterministic evidence-only text |
| Local SHA-256 chain | PASS | Append-only, tamper-evident; not claimed as blockchain |
| Blockchain anchoring | NOT IMPLEMENTED | No funded signer/RPC/contract; local chain only |
| Local file storage | PASS | `.data/uploads`; path-traversal safe; SHA-256 content addressing |
| S3 storage | BLOCKED | `TD_S3_*` credentials absent; adapter exists but inactive |
| Antivirus (local scan) | PASS | Signature/heuristic scan; magic-byte + extension checks |
| External AV (ClamAV) | BLOCKED | `TD_MALWARE_SCAN_URL` absent; adapter exists but inactive |
| Notifications (in-app) | PASS | Database-backed notification rows with audit |
| SMTP/SMS | BLOCKED | No SMTP/SMS credentials; provider reports `disabled` |
| External registry (VAHAN/insurer/theft) | BLOCKED | No endpoints/credentials; adapters report `unavailable` |
| 3D models (cars) | PASS | Real `trustdrive-sedan.glb` for `passenger_car`/`electric_car` |
| 3D models (non-car) | DEMO ONLY | Labelled schematic; no car GLB substituted; interactions disabled |
| PostgreSQL | BLOCKED | SQLite-only Next data layer; no Postgres driver/migration layer |
| Docker build | BLOCKED | Docker daemon unavailable locally; CI has Docker build step |
| Playwright CI | BLOCKED | Browser binaries not provisioned locally; CI step exists |
| Hydration warning | PASS | `suppressHydrationWarning` on file inputs; no app-side style injection |

## Deployment Requirements

- `TD_ENV=production` + `JWT_SECRET`, `DOWNLOAD_SIGNING_SECRET`, `QR_SIGNING_SECRET`, `TD_SHARE_SECRET`, `TD_SERVICE_TOKEN` (all ≥16 chars, not placeholders)
- `TD_SEED_DEMO=0` to prevent demo account creation
- `ADMIN_EMAIL`/`ADMIN_PASSWORD` to bootstrap admin when `TD_SEED_DEMO=0`
- Writable data directory (`TD_DATA_DIR` or `.data`)

## Commands Executed

- `npx tsc --noEmit` — 0 errors
- `npm test -- --run` — 329 passed (16 files)
- `npm run intel:test` — 150 passed
