# TrustDrive — API Specification

Two documented surfaces over **one shared relational database**.

| Surface | Base | Doc | Auth |
| --- | --- | --- | --- |
| Web REST (Next.js route handlers) | `/api/v1` | this file, by hand (Next 14 has no generator) | JWT cookie + RBAC |
| Intelligence (FastAPI) | `/api/intelligence` | auto `/openapi.json`, `/docs` | `X-Service-Token` (internal) |

**Conventions (both surfaces):** JSON bodies; Zod/Pydantic validation;
`200` success, `201` created, `400` malformed, `401` unauthenticated,
`403` forbidden, `404` not found, `405` wrong method, `409` conflict,
`422` validation error, `500` internal error. Errors use
`{ "error": { "message": "...", "code"?: "..." } }`. List endpoints support
`limit` / cursor pagination where noted. Every response names the active
method/engine for any AI-derived field.

---

## 1. Authentication & account (web)

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/register` | Seller/Buyer registration | public |
| POST | `/api/v1/auth/login` | Login, sets httpOnly cookie | public |
| POST | `/api/v1/auth/logout` | Revoke session | session |
| POST | `/api/v1/auth/refresh` | Refresh token | session |
| POST | `/api/v1/auth/verify-email`, `resend-verification` | Email verification | public / session |
| POST | `/api/v1/auth/forgot-password`, `reset-password` | Password reset | public |
| GET/PATCH | `/api/v1/me` | Profile read/update | session |
| POST | `/api/v1/me/password` | Change password | session |
| POST | `/api/v1/me/avatar` | Avatar upload (magic-byte validated) | session |
| GET/DELETE | `/api/v1/me/sessions`, `/api/v1/me/sessions/:id` | Session list / revoke | session |
| GET/POST | `/api/v1/me/2fa` | Two-factor settings | session |
| GET/POST | `/api/v1/me/kyc` | KYC submission | seller |

## 2. Vehicles, history & evidence (web)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/vehicles/:id` | Identity, specs, trust, coverage |
| GET | `/api/v1/vehicles/:id/trust`, `/insights`, `/pricing`, `/alerts` | Score, insights, price range, alerts |
| GET | `/api/v1/vehicles/:id/history` | Registration / ownership / service / incident timeline |
| GET/POST | `/api/v1/vehicles/:id/mileage` | Odometer readings with source + timestamp |
| GET/POST | `/api/v1/vehicles/:id/documents` | Private document list / upload |
| GET | `/api/v1/vehicles/:id/documents/completeness` | Document coverage |
| DELETE | `/api/v1/documents/:id` | Soft delete (`deleted_at`); row and hash retained, hidden from reads |
| GET/POST | `/api/v1/vehicles/:id/photos` | Vehicle gallery |
| GET/POST | `/api/v1/vehicles/:id/damage` | Zone-level damage records (3D hotspots) |
| GET | `/api/v1/vehicles/:id/findings`, `/risk`, `/theft` | Findings, AI risk, theft checks |
| GET/POST | `/api/v1/vehicles/:id/verify`, `/verification` | Verification runs |
| GET | `/api/v1/vehicles/:id/chain` | Hash-chain records |
| POST | `/api/v1/vehicles/:id/report`, `/ai/explain` | Report generation / grounded explanation |
| GET | `/api/v1/files/[...key]` | Consent-gated private file serving |

| GET/POST | `/api/v1/vehicles/:id/claims` | Seller-declared field claims (pending/verified) |
| GET/POST | `/api/v1/vehicles/:id/provider-checks` | Provider adapter checks; unconfigured providers return status `unavailable`, never a fake pass |
| GET/POST | `/api/v1/vehicles/:id/evidence-graph` | Evidence graph (nodes/edges derived from stored rows) |
| GET/POST | `/api/v1/vehicles/:id/ai-investigations` | Investigation list / start |
| GET | `/api/v1/files/[...key]?token=` | Signed, expiring download (HMAC scope + id + exp) |
| GET | `/api/v1/reports/:id/download?token=` | Signed report download |

Seller-only mutations: `/api/v1/seller/vehicles`, `/seller/vehicles/:id`,
`/seller/vehicles/:id/archive`, `/seller/overview`.
Corrections (audited, never silent): `/api/v1/history/:id/correction`,
`/api/v1/damage/:id/correction`, `/api/v1/documents/:id/replace`,
`/api/v1/documents/:id/reverify`, `/api/v1/documents/:id/consent`,
`/api/v1/findings/:id/dispute`.

## 3. Marketplace (web)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v1/marketplace/listings`, `/marketplace/listings/:id` | Published listings (pagination) |
| POST | `/api/v1/marketplace/search` | Brand, price, year, mileage, location, fuel, transmission, verification, sort |
| GET/POST | `/api/v1/seller/listings`, `/seller/listings/:id` | Create / update listing |
| POST | `/api/v1/seller/listings/:id/:action` | `publish`, `pause`, `resume`, `sold` transitions |
| GET | `/api/v1/listings/:id/stats` | Views + saved count |
| POST/DELETE | `/api/v1/seller/listings/:id/share` | Revocable signed link + QR |
| POST | `/api/v1/listings/:id/report-suspicious` | Buyer suspicious-listing report |
| GET/POST | `/api/v1/saved`, `DELETE /api/v1/saved/:listingId` | Wishlist |
| GET/POST | `/api/v1/saved-searches` | Saved searches |
| POST | `/api/v1/compare` | Compare 2–4 vehicles (**POST-only**; GET returns 405 by design) |
| GET | `/api/v1/buyer/recommended`, `/buyer/overview` | Recommendations / buyer KPIs |

## 4. Inquiries, reports, notifications, admin (web)

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `/api/v1/inquiries` | List / contact seller |
| GET | `/api/v1/inquiries/:id` | Owner-checked (403 for non-owner) |
| POST | `/api/v1/inquiries/:id/messages` | Reply / negotiation |
| PATCH | `/api/v1/inquiries/:id/status` | Accept / reject / close |
| GET/POST | `/api/v1/reports` | Report list / create |
| GET | `/api/v1/reports/:id`, `/reports/:id/download` | Metadata / PDF download |
| POST | `/api/v1/reports/vehicle/:id` | Vehicle verification report |
| GET | `/api/v1/verify/:token` | Public QR verification (permitted summary only) |
| POST | `/api/v1/verification/lookup` | Lookup by `{ type, value }` |
| GET | `/api/v1/verification/runs/:runId/stream` | Progress stream |
| GET/POST | `/api/v1/notifications`, `read-all`, `/:id/read`, `/stream` | Notifications; supports `?page=&pageSize=` **and** `?limit=&before=`; `unread=1` filters in SQL; returns `page` envelope |
| GET | `/api/v1/admin/queue`, `/admin/audit` | Review queue / audit logs |
| PATCH | `/api/v1/admin/kyc/:userId`, GET `/admin/kyc` | KYC review |
| GET | `/api/v1/admin/disputes/:id`, POST `/resolve` | Dispute resolution |
| POST | `/api/v1/admin/listings/:id/suspend` | Moderation |
| POST | `/api/v1/contact`, `/api/v1/newsletter` | Real persistence (no fake success) |
| GET | `/api/v1/ai/health`, POST `/api/v1/ai/assistant` | Grounded assistant: deterministic answer, upgraded to an LLM narrative when the intelligence service returns a validated one |
| GET | `/api/v1/ai/stack` | Live stack status (OCR/YOLO/XGBoost/retrieval/agent/LLM/blockchain) proxied from the intelligence service; `connected:false` when it is down |

## 5. Intelligence service (FastAPI)

Full machine-readable spec: `GET http://127.0.0.1:8000/openapi.json`.

| Method | Path | Request | Response highlights |
| --- | --- | --- | --- |
| GET | `/health` | — | DB status, OCR backends, LLM, 12-node graph, worker |
| GET | `/api/intelligence/capabilities` | — | versions, weights, entity counts, adapter policy |
| POST | `/api/intelligence/documents/process` | `{document_id, vehicle_id, path?, doc_type, async}` | 18-step workflow, fields, confidence, flags, duplicate, expiry, review id |
| POST/GET | `/api/intelligence/fraud/detect`, `/fraud/:vehicleId` | `{vehicle_id}` | mileage + document findings with anomaly type, severity, evidence, method, version, confidence, review action |
| POST | `/api/intelligence/investigate` | `{vehicle_id, question, thread_id?}` | 12 nodes, orchestrator, evidence IDs, human review, trust explanation |
| POST | `/api/intelligence/chat` | `{vehicle_id?, question}` | grounded answer, provider/model, citations, `llm_rejected`, deterministic fallback; used by `/api/v1/ai/assistant` |
| GET | `/api/intelligence/blockchain/status` | — | `configured:false`, `anchoring_claimed:false`; local SHA-256 chain only |
| GET | `/api/intelligence/blockchain/integrity/:vehicleId` | — | record count, broken count, `method:"local-sha256-chain"`, explicit "not an on-chain anchor" |
| GET | `/api/intelligence/trust-score/:vehicleId` | `?persist=true` | additive score, contributions, unverified areas, version |
| GET/POST | `/api/intelligence/jobs` | `{type, vehicle_id, payload, idempotency_key}` | queue with status / attempts / progress |
| POST | `/api/intelligence/jobs/run-one` | — | process one pending job |
| GET | `/api/intelligence/review` | — | pending human-review items |
| POST | `/api/intelligence/review/:id/resolve` | `{decision, reviewer, note}` | audit-logged inspector decision |
| GET | `/api/intelligence/integrity/:vehicleId` | — | SHA-256 drift detection |
| GET | `/api/intelligence/damage/:vehicleId` | — | DB-backed damage + inspection evidence |

**Every AI payload includes:** `method`, `engine`, `model_version`/`version`,
`confidence`, `evidence`, `explanation` and `recommended_review_action`.
Unavailable backends are named as adapters; no result is presented as a real
verification when the code did not compute it.

### 5.1 `POST /api/intelligence/chat` — grounded vehicle chat

The only place an LLM narrative can enter the product. It is **not** a general
chatbot: it receives a question plus a fact bundle assembled from persisted rows
(`vehicles`, `documents`, `findings`, `mileage_readings`, `verification_evidence`
and the deterministic trust score), then validates the generated text before it
can be returned. The LLM never computes or changes the trust score.

**Request** (Pydantic-validated, `422` on violation):

```json
{ "question": "Summarise the mileage anomaly and missing documents.",
  "vehicle_id": "v-camry" }
```

| Field | Type | Rules |
| --- | --- | --- |
| `question` | string | required, 2–600 characters |
| `vehicle_id` | string \| null | optional; when absent the answer is general, `vehicle_identity_status: "not_provided"`, and `sources` is empty |

Optional header `X-Service-Token` is required only when `TD_SERVICE_TOKEN` is
configured (localhost-bound local mode needs none).

**Response** (200):

```json
{
  "answer": "The mileage decreased between the 2022 and 2023 readings. Sources: m-b1, v-camry.",
  "grounded": true,
  "provider": "local-transformers",
  "model": "Qwen/Qwen2.5-0.5B-Instruct",
  "llm_rejected": false,
  "reason": "Grounded in supplied evidence.",
  "unsupported_claims": [],
  "citations": [
    { "kind": "vehicle", "id": "v-camry", "label": "Toyota Camry",
      "detail": "Registration MH12CD8899" }
  ],
  "deterministic": {
    "answer_source": "deterministic-evidence-only",
    "vehicle_identity_status": "verified",
    "missing_records": ["puc"],
    "disclaimer": "This answer is assembled from persisted records only. No LLM conclusion is included."
  },
  "facts": { "vehicle": { "...": "..." }, "missing_records": ["puc"], "trust_score": 86 }
}
```

| Field | Meaning |
| --- | --- |
| `provider` / `model` | **active engine**, reported on every payload. `local-transformers` + model id, the configured HTTP provider, or `deterministic` / `rules-v1` when no validated LLM conclusion exists |
| `grounded` | whether the returned narrative passed all validation gates |
| `llm_rejected` | `true` when the LLM produced no usable conclusion and the deterministic evidence-only narrative was substituted |
| `reason` | human-readable explanation, including "No LLM provider is configured…" when offline, or the provider failure class |
| `unsupported_claims` | numeric/ID tokens absent from the evidence, plus `policy:*`, `policy:incoherent`, `policy:contradiction:*`, `policy:no_citation` markers |
| `citations` | structural evidence IDs, one per vehicle/document/finding; attached even when the model omits inline citations |
| `deterministic` | always present — the evidence-only baseline, also used as the fallback answer |

**Validation gates** (all must pass; any failure ⇒ `conclusion: null` ⇒
`llm_rejected: true` and the deterministic narrative): numeric grounding,
forbidden safety/authenticity claims ("safe to buy", "genuine", "no fraud",
"accident-free", "guaranteed", …), coherence (length/word/letter ratio),
contradiction of recorded findings, and inline citation when the caller requires
it. A PDF text layer is never reported as OCR; a fallback is never reported as
the primary engine; a missing LLM returns **no conclusion**, never a fabricated one.

**Offline behaviour:** with `TD_LLM_PROVIDER=none` (production default) the
endpoint returns the deterministic narrative with `provider: "deterministic"` and
`llm_rejected: true`. This is a valid, honest 200 response — not an error.

### 5.2 Assistant → LLM wiring (`POST /api/v1/ai/assistant`)

The Next.js route handler is the user-facing entry point. It always computes the
deterministic grounded answer first (`lib/server/ai.ts`), then optionally calls
the intelligence service. It never removes the deterministic baseline and never
lets the LLM set the trust score.

```
AiAssistant.tsx  →  POST /api/v1/ai/assistant  { question, vehicleId? }
                       │  getAuth + published-listing/owner RBAC
                       │  askVehicleAssistant()  ← deterministic, always
                       └─ if TD_INTELLIGENCE_URL is set:
                            POST {base}/api/intelligence/chat
                                 { question, vehicle_id }
                            ← { answer, provider, model, grounded,
                                llm_rejected, citations }
                          · validated narrative → answer replaced,
                            intent "llm_grounded", model "llm:<provider>:<model>"
                          · rejected / HTTP error / timeout / service down
                            → deterministic answer preserved, model "rules-v1"
```

`TD_SERVICE_TOKEN` is forwarded as `X-Service-Token` when configured. The fetch
uses `AbortSignal.timeout(TD_INTELLIGENCE_TIMEOUT_MS)`, default **90 000 ms**
(clamped to 1–120 s): local CPU inference needs ~13–25 s per answer and the
first call also loads the model (~65 s measured), so a short timeout would
silently force the deterministic path. The UI reads
`data.model?.startsWith("llm:")` to display the active engine as "llm + rules"
versus "rules-v1".

**Startup configuration.** `npm run intel:serve` starts uvicorn directly, so
`app/config.py` loads the repo-root `.env` (and `.env.local`) with
`python-dotenv` before settings are read; a dependency-free parser is the
fallback. Both runtimes therefore share one config file:

```dotenv
TD_INTELLIGENCE_URL=http://127.0.0.1:8000   # Next.js → intelligence service
TD_INTELLIGENCE_TIMEOUT_MS=90000            # allow local CPU inference + cold start
TD_LLM_PROVIDER=local                       # none = deterministic only
TD_LLM_MODEL=Qwen/Qwen2.5-0.5B-Instruct
# HTTP provider instead: TD_LLM_PROVIDER=openai + TD_LLM_BASE_URL + TD_LLM_API_KEY
```

If either `TD_INTELLIGENCE_URL` or `TD_LLM_PROVIDER` is unset, the assistant
returns the deterministic evidence-only answer — no LLM result is claimed.
`GET /health` on the intelligence service reports the active LLM provider.

---

## 6. Worked example — mileage rollback finding

```json
{
  "anomaly_type": "mileage_decrease",
  "severity": "high",
  "explanation": "Odometer fell from 58,000 km (2022-01-15) to 25,000 km (2023-01-15). A mechanical odometer cannot go backwards.",
  "evidence": ["m4", "m5"],
  "readings": [
    {"id": "m4", "date": "2022-01-15", "km": 58000},
    {"id": "m5", "date": "2023-01-15", "km": 25000}
  ],
  "method": "monotonicity-check",
  "model_version": "fraud-rules-1.1.0",
  "confidence": 0.98,
  "recommended_review_action": "Verify both source documents with an inspector; request clarification from the seller."
}
```

## 7. Known contract notes

- `GET /api/v1/compare` intentionally returns **405** (POST-only).
- `/api/v1/verification/lookup` requires both `type` and `value`.
- `/api/v1/admin/kyc/:userId` is PATCH-only.
- Pagination: marketplace, notifications (offset **and** keyset) and audit
  (SQL `LIMIT/OFFSET`) all return a `page` envelope; `unread` filters in SQL.
- Soft delete: `DELETE /api/v1/users/me`, `DELETE /api/v1/documents/:id` and
  `DELETE /api/v1/admin/users/:id` set `deleted_at`; rows are retained for audit
  and hidden from reads, login and sessions.

---

## 8. Backend surface (FastAPI, all feature categories)

Base: `http://127.0.0.1:8000/api/backend`. Index: `GET /api/backend`.
Machine-readable spec: `/openapi.json` (**137 paths**: 54 `/api/v1`, 68
`/api/backend`, 13 `/api/intelligence`, 2 root/health). Auth: `Authorization: Bearer
<access_token>` from `POST /api/backend/auth/login`, using the **same scrypt
password hashes and HS256 signing** as the Next.js app, so one account works in
both runtimes. RBAC is enforced per route (`buyer` / `seller` / `admin`).

| Category | Endpoints |
| --- | --- |
| Authentication | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`; `GET /auth/me`, `/auth/sessions`; `DELETE /auth/sessions/{id}`; `POST /auth/change-password`, `/auth/forgot-password`, `/auth/reset-password` |
| Users | `GET/PATCH /users/me`, `DELETE /users/me`, `GET /users/me/activity`, `GET /users`, `GET /users/{id}`, `PATCH /users/{id}/kyc`, `DELETE /users/{id}` (admin) |
| Vehicles | `GET/POST /vehicles`, `GET/PATCH /vehicles/{id}`, `POST /vehicles/{id}/archive` |
| Documents | `GET/POST /vehicles/{id}/documents`, `GET /vehicles/{id}/documents/completeness` |
| History | `GET/POST /vehicles/{id}/history`, `POST /vehicles/{id}/history/{eventId}/correction` |
| Mileage | `GET/POST /vehicles/{id}/mileage` |
| Verification | `GET /vehicles/{id}/verification`, `POST /vehicles/{id}/verify`, `GET /vehicles/{id}/trust`, `POST /verification/lookup`, `GET /verify/{token}` |
| AI analysis | `GET /vehicles/{id}/ai`, `POST /api/intelligence/investigate` |
| Damage / inspection | `GET/POST /vehicles/{id}/damage`, `/inspections`, `/accidents`, `/photos` |
| Listings | `GET /marketplace/listings`, `GET/POST/PATCH /seller/listings`, `POST /seller/listings/{id}/{action}`, `GET /listings/{id}/stats`, `POST/DELETE /listings/{id}/share` |
| Search | `POST /marketplace/search` — brand, price, year, km, location, fuel, transmission, `verified_only`, sort, pagination |
| Saved | `GET/POST /saved`, `DELETE /saved/{listingId}`, `GET/POST /saved-searches` |
| Comparisons | `POST /compare` (2–4 vehicles) |
| Inquiries | `GET/POST /inquiries`, `GET /inquiries/{id}`, `POST /inquiries/{id}/messages`, `PATCH /inquiries/{id}/status` |
| Reports | `GET/POST /reports`, `GET /reports/{id}`, `GET /reports/{id}/download` — generates a real PDF and re-verifies its SHA-256 before serving |
| QR verification | `POST/DELETE /listings/{id}/share`, `GET /verify/{token}` |
| Notifications | `GET /notifications`, `POST /notifications/{id}/read`, `POST /notifications/read-all` |
| Audit / admin | `GET /audit`, `GET /jobs`, `POST /jobs/{id}/retry`, `GET /admin/queue`, `GET /admin/disputes`, `POST /admin/disputes/{id}/resolve`, `POST /admin/listings/{id}/suspend` |

**Guarantees:** every write validates input, enforces ownership/role, and only
touches columns that exist in the live schema. `chain_records`, `audit_logs` and
`trust_scores` are append-only. A history correction appends a superseding event
and never overwrites a verified row. Report downloads fail closed if the PDF
hash drifts. Missing optional data is returned as `unverified`, never as a pass.
