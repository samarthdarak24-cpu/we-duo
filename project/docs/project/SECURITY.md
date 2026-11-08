# Security

Companion: `docs/SECURITY.md` (detailed) and `docs/THREAT_MODEL.md` (T1–T12).

## Authentication

- Passwords: **scrypt** (`lib/server/auth.ts`, shared by both runtimes).
- Tokens: **HS256 JWT**, 7-day access, httpOnly `td_token` cookie; refresh token
  in a separate httpOnly cookie.
- Secret resolution: `JWT_SECRET` wins; otherwise a random per-install secret is
  written to `TD_DATA_DIR/jwt-secret` (mode 0600). **Production throws** if no
  secret can be resolved — it never falls back to a constant.
- Soft-deleted users: login, refresh, `getAuth` and `current_user` all reject.

## Authorisation

- Roles: `buyer`, `seller`, `admin`.
- `requireRole` on every mutating route; ownership checks for vehicles,
  documents, listings and reports.
- Public reads are limited to published listings, signed QR tokens and reports
  explicitly shared.
- RBAC matrix: `docs/RBAC_MATRIX.md`.

## Uploads

- Allowed: PDF, PNG, JPEG, WebP; size limits 10 MB (docs) / 6 MB (images).
- Magic-byte sniffing; a renamed executable is rejected.
- **Local malware scan** by default: EICAR, PDF `/JavaScript` and `/Launch`,
  Office auto-open macros, download-and-run commands, MZ headers.
- Files are stored privately (`TD_UPLOAD_DIR`); downloads use HMAC-signed,
  expiring URLs (`DOWNLOAD_SIGNING_SECRET`).
- Production should set `TD_MALWARE_SCAN_URL` for a full AV engine.

## Secrets

| Secret | Required in production |
| --- | --- |
| `JWT_SECRET` | yes |
| `TD_SERVICE_TOKEN` | yes (internal web↔API) |
| `DOWNLOAD_SIGNING_SECRET` | yes |
| `QR_SIGNING_SECRET` / `TD_SHARE_SECRET` | recommended |
| `TD_LLM_API_KEY` | only for hosted LLM |
| `TD_PROVIDER_TOKEN` | only for provider checks |
| `TD_S3_*` | only for S3 storage |

`.env` is gitignored; `.env.example` holds placeholders. No secret is exposed
through `NEXT_PUBLIC_*`.

## Rate limiting and abuse

- Auth routes: `app/ratelimit.py` (per-IP, configurable window).
- Write routes: `lib/server/ratelimit.ts` (in-process token bucket). Multi-instance
  deployments must move the bucket to Redis/gateway.
- Login attempts recorded in `login_attempts`.

## Data integrity and honesty

- Append-only audit log; 11 triggers block silent edits to verified history.
- Local SHA-256 chain detects byte drift. It is **not** an on-chain anchor and the
  payload says so (`anchoring_claimed:false`).
- A finding is cleared only by admin review or a deterministic re-check.
- Missing data is reported as unknown, never as clean.

## Deployment hardening checklist

- [ ] `JWT_SECRET` 32+ random bytes, identical for web and API.
- [ ] `TD_SEED_DEMO=0`; bootstrap admin via `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
- [ ] HTTPS only; cookies `secure` in production.
- [ ] `TD_UPLOAD_DIR` on a persistent disk (Render disk) or S3.
- [ ] `TD_MALWARE_SCAN_URL` configured for full AV.
- [ ] Restrict CORS to the deployed origin (`app/main.py` currently allows
      localhost only; add the Render hostname).
- [ ] Rotate `TD_SERVICE_TOKEN` and signing secrets on staff changes.
- [ ] Back up the SQLite file/disk daily; test restore.
- [ ] Review `docs/THREAT_MODEL.md` before exposing new endpoints.

## Known residual risks

- SQLite is single-writer; two web instances on one file will corrupt/lock.
- In-process rate limiting is per-instance.
- The local LLM is a 0.5B demo model; guardrails, not model quality, are the control.
- Demo providers (RTO/insurance) return `unavailable`/demo data until configured.
