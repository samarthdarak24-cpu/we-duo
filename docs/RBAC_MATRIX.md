# TrustDrive — RBAC Matrix

Permissions are enforced **server-side** in `lib/server/http.ts` for every API
route, and mirrored in `PortalShell` navigation. A page being hidden is never
the only protection: direct URL navigation and direct API calls are checked too.

Legend: ✅ allowed · ◑ allowed with ownership/consent constraint · ❌ denied · 🌐 public

## Roles

| Role | Seeded accounts |
| --- | --- |
| `seller` | `samarth@trustdrive.dev`, `aditya@trustdrive.dev` |
| `buyer` | `rohan@trustdrive.dev`, `priya@trustdrive.dev`, `arjun@trustdrive.dev` |
| `admin` | `admin@trustdrive.dev` |
| anonymous | no session |

## Vehicles & evidence

| Action | Anonymous | Buyer | Seller | Admin |
| --- | --- | --- | --- | --- |
| View published marketplace listing | 🌐 | ✅ | ✅ | ✅ |
| View vehicle verification summary | 🌐 QR only | ✅ | ◑ own | ✅ |
| View full vehicle report / PDF | ❌ | ✅ | ◑ own | ✅ |
| Add / edit / archive vehicle | ❌ | ❌ | ◑ own | ✅ moderate |
| Upload / replace / reverify documents | ❌ | ❌ | ◑ own | ✅ |
| Upload vehicle photos | ❌ | ❌ | ◑ own | ✅ |
| Add mileage reading / damage record | ❌ | ❌ | ◑ own | ✅ |
| Read private source documents | ❌ | ❌ consent-granted summary only | ◑ own | ✅ audit-logged |
| Correct history / damage / finding | ❌ | ❌ | ◑ own, audited, never silent | ✅ |
| Overwrite independently verified history | ❌ | ❌ | ❌ | ❌ (immutability triggers) |
| Trigger verification run | ❌ | ✅ | ◑ own | ✅ |

## Marketplace & listings

| Action | Anonymous | Buyer | Seller | Admin |
| --- | --- | --- | --- | --- |
| Search / filter / sort / paginate | 🌐 | ✅ | ✅ | ✅ |
| Create / update / preview listing | ❌ | ❌ | ◑ own | ✅ |
| Publish / pause / resume / mark sold | ❌ | ❌ | ◑ own | ✅ |
| Set price / write description / add photos | ❌ | ❌ | ◑ own | ✅ |
| Create / revoke share link + QR | ❌ | ❌ | ◑ own | ✅ |
| Track listing views / saved count | ❌ | ❌ | ◑ own | ✅ |
| Save / unsave vehicle | ❌ | ◑ own list | ❌ | ✅ |
| Compare 2–4 vehicles (POST only) | 🌐 | ✅ | ✅ | ✅ |
| Report suspicious listing | ❌ | ✅ | ❌ | ✅ |
| Suspend a listing | ❌ | ❌ | ❌ | ✅ |

## Inquiries, reports, notifications

| Action | Anonymous | Buyer | Seller | Admin |
| --- | --- | --- | --- | --- |
| Contact seller / create inquiry | ❌ | ✅ | ❌ | ✅ |
| Read inquiry | ❌ | ◑ **owner only** (403 otherwise) | ◑ own listing | ✅ |
| Reply / negotiate / schedule / accept / reject / close | ❌ | ◑ own | ◑ own listing | ✅ |
| Download report PDF | ❌ | ✅ | ◑ own | ✅ |
| Public QR verification (`/verify/:token`) | 🌐 permitted summary only | ✅ | ✅ | ✅ |
| Read own notifications | ❌ | ✅ | ✅ | ✅ |
| Mark read / read-all | ❌ | ◑ own | ◑ own | ✅ |

## Account & admin

| Action | Anonymous | Buyer | Seller | Admin |
| --- | --- | --- | --- | --- |
| Register / login / reset password / verify email | 🌐 | ✅ | ✅ | ✅ |
| Read / update own profile, avatar, sessions, 2FA | ❌ | ◑ own | ◑ own | ◑ own |
| Submit KYC | ❌ | ❌ | ✅ | ✅ |
| Review KYC / disputes / audit log / review queue | ❌ | ❌ | ❌ | ✅ |
| Resolve a human-review item | ❌ | ❌ | ❌ | ✅ inspector |

## Intelligence service boundary

The Python service is **internal**. It does not authenticate end users and never
bypasses the Next.js RBAC layer. When `TD_SERVICE_TOKEN` is set, all
`/api/intelligence/*` calls require the `X-Service-Token` header; otherwise it
is bound to localhost. Its reads are permission-filtered by the calling app.

## Verified behaviours

- `/api/v1/inquiries/q1` → **403** for a non-owner, **200** for the owner.
- `GET /api/v1/compare` → **405** by design (POST-only).
- `/api/v1/admin/kyc/:userId` → PATCH-only.
- `/api/v1/verification/lookup` → requires `{type, value}`.
- 48/48 portal pages return 200 for the correct role; 40+ endpoints return
  correct 200/400/401/403/405/409/422 semantics.
