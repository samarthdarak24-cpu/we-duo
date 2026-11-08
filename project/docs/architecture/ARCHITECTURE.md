# TrustDrive — Architecture

> Audit of the actual repository. Keep this in sync with the code.
> **Last audited:** 2026-11-05 · supersedes the 2026-01-05 audit.
> Companion docs: `TECH_STACK.md`, `IMPLEMENTATION_STATUS.md`, `BUGS_AND_GAPS.md`,
> `design.md` (coding-agent rules), `newdesign (3).md` (portal spec).

## 1. Stack

**Application runtime (web, portals, REST API, persistence)**
- Next.js `14.2.35` App Router, React `18`, TypeScript `5`, Tailwind CSS `3.4`.
- Motion/3D: GSAP `3.15` + ScrollTrigger, three `0.169`,
  `@react-three/fiber` `8`, `@react-three/drei` `9`, Recharts `3`.
- Client state/validation: Zustand `5`, Zod `4`, clsx. Icons: lucide-react. QR: qrcode.
- Tests: Vitest `1.6` (`npm test` → `vitest run --pool=forks --no-file-parallelism`).
- Database: Node's built-in **`node:sqlite`** (`DatabaseSync`) — requires Node 22.5+.
  `SCHEMA_VERSION = 3`, `PRAGMA user_version` stamped after a successful seed.
  No ORM (Prisma/Drizzle are not used).

**Intelligence runtime (document AI, fraud ML, agent, jobs)** — `services/intelligence`
- Python `3.12`, FastAPI, Pydantic v2, SQLAlchemy `2.x`, Alembic, LangGraph.
- OpenCV + PyMuPDF for document ingestion; PaddleOCR behind an adapter.
- scikit-learn detectors (Isolation Forest / LOF) with deterministic rules first.
- Shares the **one** relational database with the Next.js app (§4).
- PostgreSQL / Redis / Celery / S3 are the documented production targets and are
  selected by environment variables (`TD_DB_URL`, `TD_BROKER_URL`, `TD_S3_*`);
  the local default is the SQLite file + the in-process job worker so the demo
  runs with no daemons. See `docs/DEPLOYMENT.md`.

## 2. Directory layout

```
app/                      # App Router: pages (48) + REST API (app/api/v1/*)
  page.tsx                # homepage — pinned 291-frame scrollytelling hero + 13 sections
  globals.css             # design tokens, theme scopes, utility classes
components/
  public/                 # marketing: CinematicCarScrollytelling(+Lazy), HeroSection,
                          # Navbar, sections, ThreeCarViewer, ContactForm, Newsletter…
  buyer/ seller/ admin/   # portal feature components
  shared/                 # cross-portal: PortalShell, AuthForm, Sidebar, Topbar,
                          # Viewer3D, AiAssistant, SecurityCenter, SettingsForm, ReportActions…
  theme/                  # ThemeProvider, ThemeToggle, GlobalThemeToggle
lib/
  cn.ts format.ts theme.ts trust.ts
  seed.ts                 # demo dataset
  server/                 # server-only domain layer (§5)
services/intelligence/    # Python FastAPI: document AI, fraud detectors,
                          # LangGraph investigator, job worker, Alembic, pytest
public/
  frames/ezgif-frame-001..291.jpg   # scrollytelling hero frames
  videos/hero-car.mp4               # legacy hero asset (component still exists, unmounted)
  models/                            # GLB inspection assets (§8)
tests/                    # Vitest: engine, chain, api.readonly, public-site
docs/                     # ERD, API_SPECIFICATION, SECURITY, DEPLOYMENT, TESTING
scripts/                  # build-night-theme.mjs, seed/model asset generators
```

## 3. Design system

- `:root` carries the black/champagne-gold dark palette; `.portal-canvas` (the
  portal `<main>`) re-declares the same CSS variables to the ivory light scheme,
  so portals read as light surfaces under a graphite nav. Semantic Tailwind
  tokens (`ink`, `muted`, `primary`, `surface-tint`, `success-bg`, `card`,
  `rounded-pill`, `rounded-card`, `text-title`…) make every component theme-aware.
- Day/Night is orthogonal to the dark/light canvas and toggles `data-theme` on
  `<html>` (`lib/theme.ts`, `THEME_INIT_SCRIPT` runs pre-hydration).
- Tokens, spacing and component recipes are enumerated in `TECH_STACK.md` §3.

## 4. Routes

**Public/marketing:** `/`, `/about`, `/technology`, `/marketplace`,
`/vehicle/[id]`, `/inspection`, `/contact`, `/faq`, `/resources`,
`/resources/[slug]`.
**Auth:** `/login`, `/register`, `/forgot-password`, `/reset-password/[token]`,
`/verify-email/[token]`.
**Public lookup:** `/verify/[token]` (QR), `/print/report/[id]`.
**Buyer (12):** `/buyer` overview, `explore`, `search`, `saved`, `compare`,
`reports`, `inquiries`, `inquiries/[id]`, `verification`, `history`, `risk`,
`notifications`, `settings`.
**Seller (13):** `/seller` overview, `listings`, `listings/[id]`, `vehicles`,
`vehicles/[id]`, `add-vehicle`, `documents`, `history`, `fraud`, `verification`,
`inquiries`, `inquiries/[id]`, `notifications`, `settings`.
**Admin (4):** `/admin/queue`, `/admin/kyc`, `/admin/notifications`,
`/admin/settings`. `/admin/disputes/[id]` and `/admin/listings/[id]` are
API-only today — tracked in `BUGS_AND_GAPS.md`.

## 5. Data layer (`lib/server/`)

`db.ts` opens `.data/trustdrive.db`, migrates, seeds and exports typed accessors.
`data.ts` is the **data service**: it composes raw rows with the deterministic
engine into the exact shapes both REST handlers and server-rendered dashboards
consume, so every number on screen is DB-driven (never hardcoded).

**Modules:** `auth.ts` `session.ts` `accounts.ts` (JWT HS256 + scrypt, RBAC) ·
`engine.ts` (deterministic verification, evidence weights, bands 85/65/40,
publish gate, listing state machine) · `ai.ts` (grounded assistant: intent,
citations, confidence, actions, disclaimer) · `trust.ts` · `chain.ts`
(SHA-256 append-only hash chain) · `qr.ts` (HMAC-signed revocable tokens) ·
`pdf.ts` (dependency-free PDF writer) · `files.ts` (magic-byte sniffing,
consent-gated serving) · `totp.ts` · `validate.ts` · `http.ts` (`ok/created/fail`,
`requireRole`, `{data}`/`{error}` envelope) · `page.ts` (`portalUser`, demo ids).

**31 tables:** `users`, `vehicles`, `documents`, `findings`, `mileage_readings`,
`pricing`, `listings`, `listing_images`, `inquiries`, `inquiry_messages`,
`saved_vehicles`, `saved_searches`, `notifications`, `activity`, `history_events`,
`damage_records`, `chain_records`, `verification_runs`, `verification_results`,
`reports`, `auth_tokens`, `sessions`, `login_attempts`, `report_access`,
`disputes`, `theft_checks`, `listing_events`, `qr_tokens`, `audit_logs`,
`contact_messages`, `newsletter_subscribers`.
15 indexes, 7 triggers (immutability on `chain_records`; verified-guard on
`documents`, `history_events`, `damage_records`). Entity↔spec mapping and the ER
diagram live in `docs/ERD.md`.

## 6. Auth & RBAC

Roles `buyer` / `seller` / `admin` are checked **server-side** in `http.ts`
(`requireRole`) and `lib/server/auth.ts`, on every mutating route and every
ownership-scoped read. Sessions are httpOnly `td_token` + `td_refresh` cookies;
`/api/v1/auth/refresh` rotates. Optional-auth endpoints (AI assistant,
verification lookup, QR report) return consent-filtered payloads.

## 7. Verification, evidence, AI and trust

- Verification is **deterministic** (`engine.ts`); findings carry evidence refs.
- AI never mints a verification result and never decides the trust score; it
  explains records that already exist. Missing data = *unknown*, not *clean*.
- Trust score is a versioned, explainable weighted model (score, method,
  positive evidence, negative findings, unverified areas, last updated).
- `chain_records` make history tamper-evident; `/api/v1/chain/:vehicleId` verifies.

## 8. 3D inspection

`components/shared/Viewer3D.tsx` renders the inspection viewer; `public/models/`
holds the glTF-binary assets with **stable component IDs**
(`front_bumper`, `rear_bumper`, `door_fl`, … `suspension`) so raycast selection,
highlighting and exploded view map onto real `damage_records` rows. See §12 of
`IMPLEMENTATION_STATUS.md`.

## 9. How to run

```bash
npm install && npm run dev        # web app  → http://localhost:3000
npm run build && npm start        # production web app
npm test                          # vitest

cd services/intelligence
pip install -r requirements.txt
alembic upgrade head              # additive schema for intelligence entities
uvicorn app.main:app --port 8000  # document AI / fraud / agent / OpenAPI
python -m app.worker              # job worker (Redis+Celery when TD_BROKER_URL is set)
pytest                            # backend tests
```

## 10. Environment caveats (verified)

- Never run `next dev` and `next start` against the same `.next` directory; the
  manifests collide and every route 500s (`Cannot find module for page: /_document`).
- `tsconfig.json` excludes `precedent/` — that co-located Vite project is not part
  of TrustDrive and its missing dev deps otherwise fail the TrustDrive typecheck.
- Portal routes 500 only if the SQLite file is missing/unseeded; deleting
  `.data/trustdrive.db` re-seeds on next boot.
- The Python intelligence service is optional for the web app: every call site
  degrades to the deterministic engine and labels the result, it never fakes an
  AI conclusion.
