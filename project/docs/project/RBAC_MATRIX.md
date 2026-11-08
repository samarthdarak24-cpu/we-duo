# TrustDrive — RBAC Matrix

Permissions are enforced **server-side** in `lib/server/http.ts` (Next.js) and
`backend/app/security.py` (FastAPI) for every route. A page being hidden in the
navigation is never the only protection — direct URL navigation *and* direct API
calls are both checked.

Legend: ✅ allowed · ◑ allowed with ownership/consent constraint · ❌ denied · 🌐 public

## Roles (seeded, password `demo1234`)

| Role | Accounts |
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
| Add / edit / archive vehicle | ❌ | ❌ | ◑ own | ✅ |
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
| Set price / description / photos | ❌ | ❌ | ◑ own | ✅ |
| Create / revoke share link + QR | ❌ | ❌ | ◑ own | ✅ |
| Track views / saved count | ❌ | ❌ | ◑ own | ✅ |
| Save / unsave vehicle | ❌ | ◑ own list | ❌ | ✅ |
| Compare 2–4 vehicles (POST) | 🌐 | ✅ | ✅ | ✅ |
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
| Register / login / reset / verify email | 🌐 | ✅ | ✅ | ✅ |
| Read / update own profile, avatar, sessions, 2FA | ❌ | ◑ own | ◑ own | ◑ own |
| Submit KYC | ❌ | ❌ | ✅ | ✅ |
| Review KYC / disputes / audit / review queue | ❌ | ❌ | ❌ | ✅ |
| Resolve a human-review item | ❌ | ❌ | ❌ | ✅ inspector |

## Intelligence service boundary

The Python service (`/api/intelligence/*`) is **internal**. It does not authenticate
end users and never bypasses the Next.js RBAC layer. When `TD_SERVICE_TOKEN` is set,
every intelligence call requires the `X-Service-Token` header; otherwise it is bound to
localhost. Reads it performs are permission-filtered by the calling app.

## Verified behaviours (live inspection, 2026-11-05)

- Inquiries table carries both `buyer_id` and `seller_id`; a non-owner read returns **403**
  while the owner gets **200** (enforced in `lib/server/http.ts`).
- The buyer explore query (`listings.status='published'`) returns the **same 12 rows**
  that sellers `samarth@`/`weduo@` own — one shared DB, no separate buyer store.
- 48/48 portal pages return 200 for the correct role; 40+ API calls return correct
  200/400/401/403/405/409/422 semantics.
- `GET /api/v1/compare` → **405** by design (POST-only).
- Independently verified history rows cannot be overwritten: append-only writes +
  `audit_logs` + 11 immutability triggers.
