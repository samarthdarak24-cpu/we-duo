# TrustDrive — Threat Model

## 1. Assets

| Asset | Sensitivity | Where |
| --- | --- | --- |
| Password hashes / sessions | critical | `users`, `sessions`, `auth_tokens` |
| Private vehicle documents (RC, insurance, PUC, invoices, KYC) | critical | `documents` + `.data/uploads` |
| Personal data (email, phone, KYC) | high | `users`, `seller_profiles` |
| Verified history / evidence / hash chain | high integrity | `history_events`, `verification_*`, `chain_records` |
| Trust score / findings | high integrity | `trust_scores`, `findings`, `ai_analysis` |
| Listings / inquiries | medium | `listings`, `inquiries`, `inquiry_messages` |
| Reports / QR tokens | medium | `reports`, `qr_tokens`, `report_access` |
| Service credentials | critical | environment only |

## 2. Threats and controls

| # | Threat | Control (implemented) | Residual risk |
| --- | --- | --- | --- |
| T1 | Credential stuffing / brute force | scrypt hashing, generic 401, `login_attempts`, **rate limiter on auth routes (429 + Retry-After)** | per-IP limit is in-process; add gateway limit for multi-instance |
| T2 | Session theft | httpOnly sameSite cookie, HS256 with `JWT_SECRET`, server-side `sessions` with revocation | token replay until expiry; short TTL recommended |
| T3 | Horizontal privilege escalation (buyer reads seller data) | server-side role + ownership checks on every route (`test_security`) | — |
| T4 | IDOR on documents/reports/investigations | owner/admin checks; private files served only through consent-gated routes | signed expiring URLs not implemented |
| T5 | Public QR leaks personal data | QR returns only make/model/year/reg/trustdrive id + trust band; `test_security` asserts no email/phone/hash | — |
| T6 | Malicious upload (executable, oversized, polyglot) | extension allow-list, **magic-byte validation**, 25 MB cap, SHA-256, private storage, `scan.ts` adapter | scanner inactive unless `TD_MALWARE_SCAN_URL` is set |
| T7 | SQL injection | parameterised queries only (`node:sqlite` prepared, SQLAlchemy `text()` binds); identifiers from schema, never input | — |
| T8 | Stored XSS | React escaping; no `dangerouslySetInnerHTML` on user data; markup stored/returned as data | rich-text fields would need sanitisation |
| T9 | CSRF | sameSite cookies + JSON POST/PATCH/DELETE; no state change on GET | add explicit CSRF token if cross-site forms are introduced |
| T10 | Tampering with verified history | 11 immutability triggers; corrections append a superseding event; audit log | direct DB access bypasses app controls |
| T11 | Evidence forgery / duplicate docs | SHA-256 hashing, duplicate detection, hash re-verification before report download | hash proves bytes, not authenticity |
| T12 | AI overreach (LLM declares a car safe) | deterministic score; local/HTTP LLM output passes four gates (policy, coherence, contradiction, citation) before display; rejected output falls back to the deterministic answer; human review queue | a larger model may still be wrong — the gates are the control |
| T13 | Job abuse / resource exhaustion | queue with timeouts, max attempts, idempotency; slow work off the request path | no per-user job quota |
| T14 | Secret leakage | secrets only in env; `.env.example` names only; `.env` gitignored; structured logs omit secrets | operator error |
| T15 | Supply chain | pinned lockfile; minimal dependency surface; `npm ci` in CI | no SCA scanner wired |

## 3. Trust boundaries

1. Browser ↔ Next.js (cookie session) — untrusted input, Zod validation.
2. Browser/partner ↔ FastAPI (Bearer JWT) — untrusted input, Pydantic validation.
3. Next.js ↔ FastAPI — internal; optional `X-Service-Token`.
4. App ↔ database — least-privilege expectation; SQLite file permissions.
5. App ↔ external providers (OCR/LLM/registry) — adapters; unavailable providers
   are reported as unavailable, never assumed to pass.

## 4. Residual risks (explicit)

- Signed download URLs exist (`signed.ts`, 15-min HMAC scope+id+exp) but the
  signing secret must be rotated and kept out of the repo.
- Malware scanning is an adapter: unless `TD_MALWARE_SCAN_URL` is configured,
  uploads are validated by type/size/magic bytes only and the response says
  `not_configured` — it never claims a file was scanned.
- Per-IP rate limiting is in-process only (Next.js buckets + Python limiter); a
  reverse proxy/gateway should enforce it at the edge for multi-instance deploys.
- `users` and `documents` are hard-deleted on request; a formal retention
  schedule and encrypted backups are required in production.
- Backups contain private documents and must be encrypted and access-controlled.
- On-chain anchoring is not implemented; SHA-256 integrity is local only.

## 5. Verification

`services/intelligence/tests/test_security.py` covers: unauthenticated rejection,
buyer→seller API denial, cross-seller edit denial, private-document denial, QR
privacy, invalid magic bytes, oversized upload, invalid SHA-256, SQL-injection
login, stored-markup-as-data, rate limiter behaviour, and the v1 contract paths.
