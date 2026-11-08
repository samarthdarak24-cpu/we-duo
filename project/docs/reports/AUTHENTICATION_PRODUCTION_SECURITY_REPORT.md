# Authentication & Production Security Report

**Status:** PASS · **Audit basis:** source review of `frontend/lib/server/{auth,http,db,backend}.ts`, `render.yaml`, live login + RBAC tests.

## 1. Secrets & production configuration guard (Phase 1)

`frontend/lib/server/db.ts::validateProductionConfig()` runs at the top of `getDb()` and is **gated on `TD_ENV === "production"`**:

- Forces `TD_SEED_DEMO="0"` — demo seeding (photos, fake vehicles) is disabled in prod so no synthetic data ships to buyers.
- Throws if any of `JWT_SECRET`, `DOWNLOAD_SIGNING_SECRET`, `QR_SIGNING_SECRET`, `TD_SHARE_SECRET`, `TD_SERVICE_TOKEN` is missing, too short, or a known placeholder.
- Throws if the data directory is not writable.
- Never logs secret values.

`render.yaml` was corrected to `TD_SEED_DEMO: "0"` and persistent storage at `/data/trustdrive` (mounted disk `trustdrive-data`, 10 GB).

## 2. Session token handling (proxy-safe `getAuth`)

`getAuth(req)` (lib/server/http.ts) accepts a session from **either** the `Authorization: Bearer` header **or** the `td_token` httpOnly cookie, and:

1. Verifies the JWT against `JWT_SECRET`.
2. Looks the user up in the live account row (defence-in-depth — a forged/legacy token with a mismatched `role` claim is rejected; SEC-001).
3. Rejects service tokens (`svc` claim) for user APIs — service tokens are strictly for the Next.js → Python internal hop.

This reversal is what makes the AI proxy routes safe: the Next.js proxy forwards the **user's own** `td_token` cookie as a `Bearer` to Python (`callBackendAsUser`), so Python's `current_user`/`require_role` guards evaluate the real caller, never the service identity.

## 3. RBAC

`requireRole(req, ...roles)` → 401 if no/invalid token, 403 if wrong role. No anonymous fallback anywhere in the seller/buyer/admin boundary. Verified live:
- Buyer cannot open seller routes (R1).
- Seller A cannot read Seller B's private documents (R2).
- Buyer only sees consented documents of a published listing (R3).

## 4. Secret sharing across runtimes

Frontend and Python both resolve `JWT_SECRET` from the same `.data/jwt-secret` file (atomic write, `wx` flag) when env is unset, and both can load `frontend/.env.local`. This guarantees the proxy token signed by Next.js is verifiable by Python.

## 5. Residual items (honest)

- **No rate-limit / lockout on login beyond the shared limiter** — present and tested (`ratelimit.test.ts`), but tuning for prod (thresholds, IP reputation) is not done.
- **No MFA / password breach check** — accounts use scrypt hashing (good); MFA is not implemented.
- **`secure` cookie flag** is enabled only when `NODE_ENV === "production"`. Correct, but ensure TLS terminates before the app in prod (Render handles this).
- **Refresh-token rotation** exists (`td_refresh`, 30-day) but revocation list / device binding is not implemented.

## 6. Verdict

Authentication and the production-config guard are **production-grade for a pilot**. Before a public launch, add login throttling tuning, MFA, and a refresh-token revocation path.
