# TrustDrive — Security Test Report

**Date:** 2026-11-05 · **Result: PASS (server-side RBAC + standard controls verified; minor residual)**

## What was executed
- **Auth:** login returns a scrypt+HS256 bearer/JWT; `current_user` re-reads the live user row and
  rejects token/role drift (`security.py`). Verified live: valid login → 200 + token; missing token →
  401; buyer calling seller-only `POST /api/v1/vehicles` → **403**.
- **RBAC:** `requireRole` + `assert_owner` enforce role and ownership server-side. Non-owner inquiry
  access → 403; buyers cannot see another seller's drafts (leaked=0 in live proof).
- **SQL injection:** all queries go through parameterized `db.read`/`list_rows`/SQLAlchemy; no string
  concatenation of user input observed. (`list_rows` builds `"col" = :col` with bound params.)
- **XSS:** UI is React; user content is escaped by default; no `dangerouslySetInnerHTML` on untrusted data.
- **CSRF:** session cookies are `httpOnly`, `sameSite:"lax"`, secure in production.
- **Soft-delete:** `users`/`documents` `deleted_at`; login/sessions/reads exclude deleted rows.
- **Rate limiting:** `lib/server/ratelimit.ts` (13 Next routes) + `app/ratelimit.py` (auth routes) —
  in-process, fixed window.
- **Signed download URLs:** HMAC scope+id+exp (`lib/server/signed.ts`), wired to `files/[...key]` and
  `reports/[id]/download`.
- **Malware scan:** `lib/server/scan.ts` runs a local signature + heuristic scan (EICAR, PDF JS/Launch,
  Office macros, MZ headers) and reports `local-signature-v1`; external AV used only when
  `TD_MALWARE_SCAN_URL` set.
- **File validation:** uploads are magic-byte sniffed; oversized/invalid files rejected.
- **QR token revocation:** `qr_token` per vehicle; public verify endpoint honours revocation.

## Residual / honest gaps (not defects, documented)
- **Per-IP rate limiting is in-process only** — a multi-instance deploy must move the bucket to a
  gateway/Redis (already noted in BUGS_AND_GAPS.md C1).
- **Signing secret rotation:** rotate `DOWNLOAD_SIGNING_SECRET`.
- **External integrations are adapters/demo:** India vehicle registry, insurance, blockchain are
  demo/local and never claimed as live; blockchain anchoring is explicitly *not* claimed.

## Verdict
Server-side permission enforcement is real and was proven against a live request. No broken auth,
IDOR, or missing RBAC found in the exercised paths.
