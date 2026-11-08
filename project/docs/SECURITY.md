# TrustDrive — Security & Privacy

## 1. Authentication and sessions

- Passwords hashed with **scrypt** (salted); no plaintext storage.
- JWT **HS256** in **httpOnly, sameSite** cookies; server-side session rows in
  `sessions` with revocation (`/api/v1/me/sessions`, `/api/v1/auth/logout`).
- Email verification, password reset (`forgot-password` / `reset-password`),
  refresh, optional 2FA (`/api/v1/me/2fa`), login-attempt tracking.
- KYC submission and admin review (`/api/v1/me/kyc`, `/api/v1/admin/kyc/*`).
- `JWT_SECRET` comes from the environment; `.env.example` contains names only.

## 2. Server-side RBAC

Enforced in `lib/server/http.ts` on **every** API handler, not just in the UI:

| Rule | Enforcement |
| --- | --- |
| Seller-only vehicle/document/listing mutations | role + ownership check |
| Buyer cannot read another buyer's inquiry | `/api/v1/inquiries/:id` returns 403 for non-owner |
| Private documents | consent-gated per request (`/api/v1/documents/:id/consent`) |
| Admin-only | `/api/v1/admin/*` |
| Public verification | `/api/v1/verify/:token` shows a consent-filtered summary only |

Full matrix: `docs/RBAC_MATRIX.md`. Direct URL navigation and direct API calls
are both covered (verified by API smoke tests returning 401/403/405/409/422).

## 3. Input validation and injection

- Zod schemas on requests (`lib/server/validate.ts`) **and** client forms.
- All SQL uses parameterised statements (`node:sqlite` prepared statements and
  SQLAlchemy `text()` with bound parameters) — no string-concatenated SQL.
- React escapes output by default; no `dangerouslySetInnerHTML` on user data.
- State-changing endpoints are POST/PATCH/DELETE and require an authenticated
  session; cookies are `sameSite` so cross-site CSRF is mitigated.
- File uploads: extension allow-list, **magic-byte** validation, 25 MB cap,
  SHA-256 hashing, private storage under `.data/uploads` (never a public path).

## 4. Document privacy and integrity

- Source files are private. Buyers see only permitted, consent-filtered
  summaries; private seller documents are never exposed.
- Share links use revocable, signed QR tokens (`/api/v1/seller/listings/:id/share`,
  POST creates / DELETE revokes all).
- SHA-256 chain (`chain_records`) plus 11 immutability triggers.
- Drift detection: `GET /api/intelligence/integrity/:vehicleId` recomputes
  hashes for available files and surfaces mismatches. Missing files are
  reported as `unavailable`, never as verified.
- **Disclaimer:** a matching hash proves the stored file is unchanged; it does
  **not** prove the original uploaded document was genuine. Blockchain is
  explicitly not claimed.

## 5. Rate limiting, malware scanning, signed URLs

| Control | Status |
| --- | --- |
| Login-attempt tracking + lockout data | ✅ `login_attempts` table |
| Per-IP rate limiting | ✅ `lib/server/ratelimit.ts` (sliding window, 13 routes) + `app/ratelimit.py` (auth). In-process only; gateway/Redis for multi-instance. |
| Signed/expiring download URLs | ✅ `lib/server/signed.ts` — HMAC token with scope + id + expiry, wired to `files/[...key]` and `reports/[id]/download` |
| Malware scanning hook | ⚙️ `lib/server/scan.ts` — submits to `TD_MALWARE_SCAN_URL` when configured; otherwise `not_configured`, never claimed clean |
| Audit logs | ✅ `audit_logs` + immutable chain events |
| Structured JSON logs | ✅ both runtimes |
| Backup/restore procedure | ✅ `docs/DEPLOYMENT.md` |

These three ⚠️ items are genuine residual gaps and are recorded in
`BUGS_AND_GAPS.md` and `IMPLEMENTATION_STATUS.md`. They are **not** claimed as
working. For production, place the app behind a gateway that enforces per-IP
rate limits, add a scan hook before `store privately` in the 18-step pipeline,
and issue short-lived signed download URLs.

## 6. AI safety

- No LLM sets or adjusts the trust score. The score is additive and
  deterministic with exact per-feature attribution (`app/explain.py`).
- No LLM invents a verification result: offline it returns **no conclusion**.
  When a provider is configured, output is validated against source records
  before display (`app/llm.py::validate_grounding`).
- Detector findings are leads for human review, never proof of fraud.
- High-impact unresolved findings go to the `human_review_queue` and require an
  authorised inspector decision (`POST /api/intelligence/review/{id}/resolve`).
- Missing data is reported as **unverified coverage**, never penalised as fraud.
- India vehicle data: no external registry is queried. VIN/registration checks
  are against the local database only, respecting consent constraints.

## 7. Internal service boundary

The intelligence service is not a public API. When `TD_SERVICE_TOKEN` is set it
requires the `X-Service-Token` header; otherwise it is intended for localhost
only (CORS is restricted to the local web origin). It never authenticates end
users and never bypasses the Next.js RBAC layer.

## 8. Reporting a vulnerability

Do not commit secrets. Rotate `JWT_SECRET` and `TD_SERVICE_TOKEN` immediately if
exposure is suspected; revoke all sessions and share tokens; restore from the
last verified backup. Record the incident as an immutable audit event.
