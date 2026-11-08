# Backend completion — what was added, verified, and still missing

Date: 2026-11-05. Scope: finish missing backend domains first, then integrate the
new capabilities into the existing UI. No working feature was removed and
`SCHEMA_VERSION` was not bumped (a bump recreates and reseeds the database).

## 1. New additive schema (`lib/server/db.ts` → `ensureBackendTables`)

`CREATE TABLE IF NOT EXISTS` only, so existing verified rows are untouched:

| Table | Purpose |
| --- | --- |
| `evidence_nodes` / `evidence_edges` | Persisted projection of the evidence graph (`POST …/evidence-graph`) |
| `verification_cases` | Durable case id per verification run, with ruleset/model versions |
| `document_extractions` | Field-level OCR/parse values with confidence, page and method |
| `vehicle_claims` | Seller declarations with source and pending status |
| `provider_checks` | External registry/theft/insurance checks, including `unavailable` |
| `ai_runs` | Deterministic evidence-review runs with input/output references |
| `idempotency_keys` | Replay store for `Idempotency-Key` mutations |

The graph itself is **derived**, not ingested: `lib/server/evidence.ts` projects
vehicle, documents, history, mileage, damage, findings, verification run, theft,
reports and the hash chain, and only draws an edge when a stored foreign key or
finding reference supports it.

## 2. New modules

- `lib/server/evidence.ts` — graph build/persist, verification cases, claims,
  cross-modal odometer comparison, near-duplicate documents, extraction rows.
- `lib/server/alerts.ts` — saved-search and saved-vehicle price alerts, deduped
  by search/listing key; triggered on publish, price update, or buyer request.
- `lib/server/ratelimit.ts` — per-IP sliding window (auth 12/min, read 120/min,
  write 45/min, reports 12/min) returning `429` + `Retry-After`.
- `lib/server/idempotency.ts` — stores and replays the first response for a key.
- `lib/server/signed.ts` — HMAC download token (`scope`, `id`, `exp`) with
  constant-time verification.
- `lib/server/scan.ts` — malware-scan adapter. Without `TD_MALWARE_SCAN_URL` it
  returns `not_configured`; uploads then say **"this file was not scanned"**.

## 3. Endpoints added

| Method | Path | Access |
| --- | --- | --- |
| GET/POST | `/api/v1/vehicles/:id/evidence-graph` | read: any signed-in role, consent-filtered; persist: owner/admin |
| GET | `/api/v1/verification-cases/:id` | seller/buyer/admin |
| GET/POST | `/api/v1/vehicles/:id/ai-investigations` | owner, admin, or buyer of a published listing |
| GET | `/api/v1/vehicles/:id/near-duplicates` | seller/buyer/admin |
| GET/POST | `/api/v1/vehicles/:id/claims` | read: all roles; write: owner |
| GET/POST | `/api/v1/vehicles/:id/provider-checks` | read: all roles; write: admin only |
| GET | `/api/v1/documents/:id/extractions` | owner/admin, or consented buyer of a published listing |
| POST | `/api/v1/alerts/evaluate` | buyer (own) / admin (all) |

## 4. Existing endpoints extended

- `POST …/documents` and `…/documents/:id/replace`: rate limit, idempotency,
  magic-byte validation, malware-scan result, extraction rows, signed `fileUrl`.
- `POST …/verify`: rate limit, idempotency, opens/refreshes a verification case.
- `GET …/mileage`: adds `crossModal` (declared vs document-extracted vs
  independent series, 45-day window, 1,500 km threshold).
- `GET …/documents`: adds `nearDuplicates`.
- `POST /reports/vehicle/:id`: signed, 15-minute `downloadUrl`; idempotent.
- `GET /reports/:id/download`: accepts a scoped signed token; forged/expired
  tokens get `403`; audit attributes signed downloads to the requester.
- `GET /files/<key>`: accepts a scoped signed token for otherwise private files.
- `POST /auth/login`, marketplace search, claims, reports, provider checks,
  listing updates and listing actions: rate limits.
- Listing publish/sold/pending-review and price edits now evaluate saved-search
  and saved-price alerts.

## 5. UI integration

- `DocumentsManager`: the fabricated `window.prompt`/`{fileName, content}`
  replacement is gone; it now uploads a real file (multipart) with an
  idempotency key, renders parsed fields per document, and shows a
  near-duplicate review panel. Upload feedback states the actual scan status.
- `EvidenceGraph` component on `/vehicle/[id]` and `/seller/vehicles/[id]`:
  deterministic SVG/HTML node-and-edge view, reliability legend, hidden-document
  count, and open conflicts. No graph library was added.
- `DamageEditor` on the seller vehicle page: writes a real damage record to an
  existing 3D zone via `POST …/damage`; hotspots therefore come from the DB.
- `ClaimsPanel` on the seller vehicle page: submits and lists seller claims with
  their pending status.
- Cross-modal odometer card on `/vehicle/[id]` with input counts and conflicts.
- `StatusBadge`/`InsightRow` now cover the full status vocabulary (draft,
  published, sold, processing, cleared, open, plus the original six).

## 6. Verification actually run

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | exit 0 |
| `npm test` (Vitest) | 7 files, 53 tests passed |
| `NEXT_DIST_DIR=.next_verify npx next build` | exit 0 |
| Runtime smoke (built server, port 3107) | login 200 · anon graph 401 · graph 31 nodes/40 edges/3 conflicts · near-duplicates 200 · cross-modal `conflict` · documents 6 · claims 200 · provider checks 200 (`configured:false`) · AI review 200 (`deterministic-rules-v1`, 9 citations) · verify 200 with case + 12 checks · verify replay `Idempotent-Replay: true` · report 201 signed · signed PDF 200 `application/pdf`, SHA-256 header · forged token 403 |

One defect was found and fixed during that smoke run: signed report downloads
500'd because the audit row used a non-existent `actor_id` (FK). They are now
attributed to the report requester with `via: "signed-link"` recorded.

## 7. What still remains (not implemented)

1. **Malware scanning is not active** — no scanner endpoint is configured, so
   every upload reports `not_configured`. Do not describe uploads as scanned.
2. **External provider checks are inactive** — `TD_PROVIDER_*` is unset; checks
   are recorded as `unavailable`, never "clean".
3. **OCR/parse data is sparse** — seeded documents carry no extracted fields, so
   extraction rows and near-duplicate text comparison return 0 candidates. The
   pipeline is wired; the ingestion adapter that fills `documents.extracted`
   still needs a real OCR provider.
4. **Claims are not yet consumed by the rules engine** — they are stored,
   chained and displayed as pending, but no rule evaluates them.
5. **No perceptual image hashing** — near-duplicate detection compares extracted
   text, type and byte-size only (no image-decoding dependency was added).
6. **No admin UI** for provider checks, AI run history, or verification cases;
   those are API-only. Provider checks are admin-only by design.
7. **Rate limiting is in-process** — correct for one Next.js instance; a
   multi-instance deployment needs a gateway/Redis implementation with the same
   429 contract.
8. **Alerts are evaluated on events, not scheduled** — there is no cron/worker;
   publishing, price updates and the buyer-triggered endpoint are the triggers.
9. **LangGraph is still not installed** (`requirements.txt` line 24 commented);
   the Python investigator remains deterministic and the AI review is labelled
   `deterministic-rules-v1`, not an LLM.
10. **Design-only gaps unchanged**: mobile filter drawer, table sorting, 3D
    exploded view/keyboard controls, `public/assets/*` tree, `ASSET_REGISTER.md`,
    and Playwright end-to-end coverage (`npm run test:e2e`) were not run.
11. **Python service parity** was not extended; this work is the Next.js system
    of record plus additive tables in the shared database.

## 8. Environment notes

New optional environment variables (all disabled by default):

```
TD_MALWARE_SCAN_URL=        # scanner endpoint accepting multipart `file`
TD_MALWARE_SCAN_TOKEN=      # optional bearer token for the scanner
TD_PROVIDER_URL=            # external check provider base URL
TD_PROVIDER_NAME=           # label stored on provider_checks rows
TD_PROVIDER_TOKEN=          # optional bearer token
DOWNLOAD_SIGNING_SECRET=    # falls back to QR_SIGNING_SECRET, then a dev secret
```

Set `DOWNLOAD_SIGNING_SECRET` in production; the development fallback must not
be used to sign buyer-facing links.

## 9. Live browser verification (5 Nov 2026)

Built app served with `NEXT_DIST_DIR=.next_verify npx next start -p 3200`,
signed in as the seller demo account, with data created through the UI:

- **Seller vehicle page** — evidence graph rendered 35 nodes; findings showed
  `2 open`; the `explained` finding no longer counted as a conflict. Damage
  editor went 4 → 7 stored rows through `POST /api/v1/vehicles/v-seller/damage`
  (201 each), the success alert was visible, and the record count/hotspots
  updated after refresh.
- **Seller claims** — `POST /api/v1/vehicles/v-seller/claims` 201; the new claim
  appeared as `pending` and was chained for audit.
- **Documents** — 7 rows, parsed-field panels on 6 documents, near-duplicate
  review panel (0 candidates), and a real multipart replacement that stored
  `live-replace.jpg` as **v2** with "Supersedes an earlier version".
- **Buyer vehicle page** — public evidence graph (35 nodes) and cross-modal
  odometer card rendered alongside 2 open conflicts; no private documents
  leaked.
- **Reports** — Generate PDF created `RPT-2026-0007` (`ready`); the print view
  showed the finding statuses (`EXPLAINED`, `OPEN`). The signed download
  returned 200 `application/pdf`, 106,120 bytes, `%PDF` magic and
  `X-Report-SHA256`; forged and anonymous tokens returned **403**.
- **Console** — only `THREE.WebGLRenderer: Context Lost` from the demo 3D
  viewer; no request or React errors.

Three damage rows created during testing were left in place as pending demo
records (the form defaults to `front_bumper`; no delete endpoint exists by
design). Not exercised this pass: inquiries, saved comparisons, notifications,
admin screens, the AI chat UI, malware scanning / external providers (not
configured), and Playwright E2E. The print/QR verification URL rendered
`localhost:3000` while the app ran on 3200 — set the public app origin in the
environment so generated links point at the deployed host.
