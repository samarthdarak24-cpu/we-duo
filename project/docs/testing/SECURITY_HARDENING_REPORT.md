# TrustDrive — Security Hardening Report

**Date:** 2026-11-08

## Security Principles

1. **Fail closed:** Authentication failures, missing secrets, and unavailable scanners all deny access rather than grant it.
2. **Never log secrets:** Secret *names* may appear in diagnostics; secret *values* never do.
3. **Server-side RBAC:** Every API route enforces role and ownership; page-level guards are secondary.
4. **No guest/demo access to private records:** Anonymous visitors see only redacted public summaries of published vehicles.
5. **Honest integrations:** Unavailable providers report `unavailable`, never `verified` or `clean`.

## Authentication Hardening

| Control | Status | Implementation |
|---------|--------|----------------|
| JWT signing | PASS | HS256 with `node:crypto`; secret from `JWT_SECRET` or persisted `.data/jwt-secret` (mode 0600) |
| Password hashing | PASS | scrypt (salt + 64-byte key) with timing-safe comparison |
| Token verification | PASS | Algorithm confusion rejected (`alg:none`, non-HS256 rejected); expiry enforced |
| Soft-delete revocation | PASS | Deleted users lose access even with valid JWT |
| Service token isolation | PASS | `svc` claim tokens excluded from user API access |
| Session rotation | PASS | Refresh tokens rotated on use; old hash invalidated |
| Login throttling | PASS | 5 attempts → 15-minute lockout per email+IP |
| Rate limiting | PASS | Shared `rate_limit_hits` table; 429 + `Retry-After` |

## Authorization Hardening

| Control | Status | Implementation |
|---------|--------|----------------|
| Role-based guards | PASS | `requireRole("seller" \| "buyer" \| "admin")` on every API route |
| Ownership enforcement | PASS | `vehicle.owner_id === actorId` on all mutation paths |
| Document ownership | PASS | `vehicle.owner_id` checked before document access |
| Cross-user isolation | PASS | Seller A cannot read Seller B's vehicles/documents/damage |
| Page-level guards | PASS | Middleware redirects anonymous/wrong-role to `/login` |
| Portal isolation | PASS | Buyer cannot render seller/admin portal shells |

## Production Startup Validation

| Control | Status | Implementation |
|---------|--------|----------------|
| `TD_ENV=production` check | PASS | `validateProductionConfig()` runs at DB bootstrap |
| Secret strength check | PASS | All 5 secrets ≥16 chars, not placeholder patterns |
| `TD_SEED_DEMO=0` enforcement | PASS | Forced to `0` in production; demo seeding skipped |
| Data directory writable | PASS | `fs.accessSync(W_OK)` fails fast |
| No secret logging | PASS | Only secret *names* joined in error messages |

## Data Protection

| Control | Status | Implementation |
|---------|--------|----------------|
| Password storage | PASS | scrypt hashes; plaintext never stored |
| Upload path safety | PASS | Path-traversal check: resolved path must be under upload root |
| File type validation | PASS | Magic-byte + extension checks on upload |
| File size limits | PASS | 6 MB photos, 10 MB documents |
| SHA-256 content addressing | PASS | Every upload hashed; chain records reference hashes |
| Signed downloads | PASS | `DOWNLOAD_SIGNING_SECRET` required; fail closed in production |
| Private document consent | PASS | Buyer document view is consent-gated |

## Audit Trail

| Control | Status | Implementation |
|---------|--------|----------------|
| Audit log table | PASS | `audit_logs` with actor, action, entity, before/after, IP, timestamp |
| Auth audit | PASS | Login, password reset, email verification, session events |
| Provider audit | PASS | External registry checks audited with source/provenance |
| Notification audit | PASS | Every notification send audited |
| Immutable audit rows | PASS | `trg_ai_analysis_nodelete` trigger prevents deletion |

## Integrity

| Control | Status | Implementation |
|---------|--------|----------------|
| SHA-256 chain | PASS | Append-only chain records; drift detection |
| Chain verification | PASS | `verifyChain()` validates hash links |
| Not blockchain | PASS | Explicitly labelled: integrity ≠ authenticity |
| Tamper detection | PASS | `recordIntegrity.intact` reported in passport |

## Known Limitations (BLOCKED / NOT IMPLEMENTED)

| Limitation | Classification | Mitigation |
|------------|---------------|------------|
| No S3 credentials | BLOCKED | Local filesystem storage |
| No SMTP/SMS | BLOCKED | In-app notifications only |
| No ClamAV/external AV | BLOCKED | Local signature/heuristic scan |
| No VAHAN/insurer/theft | BLOCKED | Adapters report `unavailable` |
| No blockchain signer | NOT IMPLEMENTED | Local SHA-256 chain only |
| No PaddleOCR | BLOCKED | RapidOCR active and labelled |
| No production XGBoost | DEMO ONLY | Synthetic data; `mode: experimental` |
| No LLM provider | DEMO ONLY | `TD_LLM_PROVIDER=none`; deterministic text |
| No Postgres | BLOCKED | SQLite shared database |
| Docker daemon unavailable | BLOCKED | CI builds Docker image |

## Security Test Results

| Test | Result |
|------|--------|
| Anonymous 401 | PASS |
| Wrong role 403 | PASS |
| Tampered JWT 401 | PASS |
| Cross-user vehicle 403 | PASS |
| Cross-user document 403 | PASS |
| Service token rejected | PASS |
| Demo seeding disabled (`TD_SEED_DEMO=0`) | PASS |
| Startup fails on weak secrets | PASS |
| No secret values in logs | PASS |
