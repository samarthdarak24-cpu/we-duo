# TrustDrive — Test Plan

## 1. Levels and commands

| Level | Tool | Command | Scope |
| --- | --- | --- | --- |
| Type check | TypeScript | `npx tsc --noEmit` | whole app (excludes `precedent/`) |
| Unit / component | Vitest + RTL + jsdom | `npm test` | engine, chain, schema, validation, format, action bar |
| Production build | Next.js | `NEXT_DIST_DIR=.next_verify npm run build` | all routes compile and prerender |
| Backend unit/integration | Pytest | `npm run intel:test` | API, detectors, agent, worker, 18-step pipeline, backend, security |
| E2E | Playwright | `npm run test:e2e` | 21-step seller→buyer + RBAC |
| Schema | script | `npm run schema:dump` | regenerate ERD from live DB |

## 2. Backend unit cases

- Permissions and ownership (buyer→seller denial, cross-seller edit).
- Vehicle identifier validation (17-char VIN, Indian registration, duplicates).
- Listing state transitions (draft→published→paused/sold; illegal transitions 409).
- Mileage rules (decrease, implausible usage, same-date conflict, duplicates).
- Document normalisation, SHA-256 duplicate detection, confidence flagging.
- Trust-score edge cases: no records, partial records, contradictions, strong evidence.
- QR token expiry/revocation.
- Agent output schema and evidence-citation validation.
- Rate limiter window and 429/Retry-After.

## 3. Backend integration cases

- Auth: register → login → refresh → logout; wrong password 401.
- Seller creates a vehicle and reads it back (persistence).
- Seller registers a document; async processing job is queued.
- Worker processes OCR; extraction stored; low confidence queues review.
- Verification run stores results and evidence; trust snapshot persisted.
- Mileage rollback creates a high-severity finding.
- Damage/inspection/accident records persist with valid CHECK values.
- Listing publish; buyer sees only published listings.
- Buyer saves/compares; inquiry → seller reply → status transition.
- Buyer downloads a real PDF report (hash verified).
- Public QR reveals only permitted fields.
- Audit log captures important changes.

## 4. Security cases (`tests/test_security.py`)

Unauthenticated rejection · buyer→seller denial · cross-seller edit denial ·
private-document denial · QR privacy · invalid magic bytes · oversized upload ·
invalid SHA-256 · SQL-injection login · stored markup returned as data ·
rate-limit 429 · v1 contract path coverage.

## 5. End-to-end scenario (Playwright)

1 Seller signs in → 2 registers a vehicle → 3 uploads images/documents →
4 OCR job processed → 5 reviews extraction → 6 verification rules run →
7 mileage anomaly detected → 8 damage evidence attached → 9 AI investigation →
10 publishes listing → 11 buyer searches → 12 opens detail/report →
13 views mileage timeline → 14 opens 3D and selects a damaged component →
15 compares → 16 saves and contacts seller → 17 seller replies →
18 buyer downloads report → 19 public QR shows summary → 20 audit history.

Viewports: 1920×1080, 1440×900, 1366×768, 390×844.

## 6. Acceptance criteria

- `tsc` exit 0; `npm test` all green; `npm run build` exit 0.
- `pytest` all green (60 tests).
- No endpoint returns a fabricated success; unavailable adapters are labelled.
- RBAC enforced on direct URL **and** direct API calls.
- Data survives refresh and restart (SQLite file + persisted rows).
- No critical authorization defect in `test_security`.

## 7. Environment notes

- Playwright browsers are not installed in this sandbox; the spec and CI job are
  ready (`workflow_dispatch`).
- Next's diagnostic trace writer can return `EPERM` on this Windows host;
  verification builds use `scripts/next-build-notrace.cjs`.
- Pytest's temp-dir cleanup can print a sandbox `atexit` warning; it does not
  affect results.

## 8. Latest results

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | ✅ exit 0 |
| `npm test` | ✅ 7 files / 53 tests |
| `npm run build` | ✅ exit 0, BUILD_ID `n2Zi3X7dEmceONjKyy8Vx` |
| `npm run intel:test` | ✅ **88 passed** |
| `npm run test:e2e` | ⚠️ not run locally (browser binaries absent) |
