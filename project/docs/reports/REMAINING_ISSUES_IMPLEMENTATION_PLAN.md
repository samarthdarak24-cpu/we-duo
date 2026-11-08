# Remaining Issues — Implementation Plan & Status

A living tracker for the 18-phase remediation programme. Each line shows the classification used in `PRODUCTION_READINESS_REPORT.md`.

Legend: ✅ PASS · 🟡 DEMO ONLY · 🟠 PARTIAL · 🔴 BLOCKED · ⚪ NOT IMPLEMENTED

## Phase-by-phase status

| # | Phase | Status | Notes |
|---|-------|--------|-------|
| 1 | Production auth & security hardening | ✅ PASS | `validateProductionConfig`, proxy-safe `getAuth`, RBAC. |
| 2 | Auth/security report | ✅ PASS | `AUTHENTICATION_PRODUCTION_SECURITY_REPORT.md` |
| 3 | 20 vehicle categories | ✅ PASS | 20 categories implemented; 13 seeded. |
| 4 | YOLO damage detection | ✅ PASS | Real weights; detect→review verified live. |
| 5 | XGBoost fraud model | 🟡 DEMO ONLY | Experimental, synthetic data, metrics `null`. |
| 6 | PaddleOCR extraction | ✅ PASS | Real OCR verified (0.9963 conf). |
| 7 | Storage + AV scanning | 🟠 PARTIAL | Local scan real; remote AV not configured. |
| 8 | Notifications | 🟡 DEMO ONLY | `log-only`; no email/SMS/WhatsApp. |
| 9 | LLM trust narrative | 🟡 DEMO ONLY | Grounded template; no LLM key. |
| 10 | Blockchain anchoring | 🔴 BLOCKED | Stub only; no credentials. |
| 11 | External registry (VAHAN/insurer/theft) | 🔴 BLOCKED | `mock-*`; no API credentials. |
| 12 | 3D inspection models | 🟠 PARTIAL | Car real; non-car schematic. |
| 13 | PostgreSQL migration | ⚪ NOT IMPLEMENTED | Plan ready; cloud PG blocked on creds. |
| 14 | Docker image / deploy | ✅ PASS | `Dockerfile.render` + `render.yaml` (disk). |
| 15 | Playwright CI + E2E | ✅ PASS | Config + 40 specs; CI wired (`TD_INTELLIGENCE_URL` added). |
| 16 | Hydration warning (file input) | ✅ PASS | `suppressHydrationWarning` on all 5 file inputs. |
| 17 | Live E2E regression | ✅ PASS | tsc 0; vitest 329; pytest 149/1; live proxy E2E. |
| 18 | Final readiness reports | ✅ PASS | See `reports/`. |

## Work completed in this remediation pass

1. **Proxy route bug fix** — the three AI proxy routes were created under a `[vehicleId]` slug that broke `next build` (`You cannot use different slug names for the same dynamic path`). Relocated to `[id]` and corrected parameter names.
2. **`TD_INTELLIGENCE_URL` wiring** — added `http://127.0.0.1:8000` to `frontend/.env.local` so the Next.js proxy can reach the Python service.
3. **Production config guard** — `validateProductionConfig()` enforces secrets + disables demo seeding in prod; `render.yaml` set to `TD_SEED_DEMO:"0"` + persistent `/data` disk.
4. **Live E2E of AI proxies** — YOLO detect (200, real detection) and PaddleOCR (200, real text extraction) verified through the full Next.js→Python→frontend path with a real `td_token` cookie.
5. **Regression gates green** — `npx tsc --noEmit` 0 errors; `vitest` 329 passed; `pytest` 149 passed / 1 skipped.
6. **Hydration fix** — applied `suppressHydrationWarning` to all file inputs (root cause: browser-extension attribute injection; no genuine app-code mismatch).
7. **Playwright CI correctness** — added `TD_INTELLIGENCE_URL` to the `e2e` job so AI proxy routes resolve in CI.

## Open items requiring external inputs (cannot be closed by code alone)

- **Credentials** for VAHAN, insurer, theft-database, blockchain, a real AV scanner, a notification provider, and an LLM key. → unblocks §8, §9, §10, §11, and parts of §5/§7.
- **Licensed, labelled training data + published metrics** for the fraud model. → upgrades §5 from DEMO to PASS.
- **A provisioned PostgreSQL instance** (`TD_DATABASE_URL`). → executes §13.
- **Per-category 3D meshes** (scooter, three-wheeler, commercial, etc.). → completes §12.

## Suggested sequencing once inputs arrive

1. Provision Postgres → run §13 migration + CI matrix. (highest leverage)
2. Supply registry/blockchain credentials → replace `mock-*` with live adapters + contract tests.
3. Re-train fraud model on licensed data → publish metrics.
4. Configure one real notification + AV provider → exit demo mode.
5. Commission non-car 3D meshes.
