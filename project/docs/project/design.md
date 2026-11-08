# TrustDrive — Design System & Coding Agent Rules

> **Read this file before editing any UI, API or workflow** (Coding Agent Rule 1).
> This is the single source of truth for the TrustDrive visual language and the
> operating rules for the coding agent. Keep it in sync with the code.

---

## 1. Design tokens

Tokens are CSS variables defined in `app/globals.css` and mapped to semantic
Tailwind classes in `tailwind.config.ts`. **Semantic classes** (`bg-bg`,
`bg-surface`, `text-ink`, `text-muted`, `border-border`, `text-primary`,
`bg-success/warning/danger/info`, `bg-success-bg` …) are theme-aware: they render
dark on dark pages and light inside the portals.

### 1.1 Dark theme — default (homepage, auth, dark vehicle/verify report pages)
| Token | Value | Use |
|---|---|---|
| `--bg` | `#08090A` | main black canvas |
| `--surface` | `#111315` | panel surface |
| `--surface-tint` | `#1E2226` | raised neutral surface |
| `--primary` (gold) | `#C5A46D` | champagne gold — primary action, accents |
| `--primary-600` | `#D6B882` | gold hover |
| `--text` | `#F5F5F5` | metallic white |
| `--muted` | `#9299A2` | secondary text |
| `--border` | `#23262A` | hairline border |
| `--success` | `#36B982` | integrity green |
| `--warning` | `#E7A83E` | amber |
| `--danger` | `#D95757` | issue red |
| `--info` | `#C5A46D` | info (gold) |
| `--on-primary` | `#08090A` | text painted on a gold fill |

### 1.2 Light portal canvas (`.portal-canvas` scope — buyer/seller/admin content)
The portal `<main>` keeps a **black navigation** (sidebar + topbar live outside
this scope) but renders content on a clean white surface by overriding the same
tokens inside `.portal-canvas`:
bg `#F4F6F9`, surface `#FFFFFF`, text `#0F172A`, primary `#B8923E`, muted
`#64748B`, border `#E6E8EC`, success `#16A34A`, warning `#D97706`, danger
`#DC2626`, info `#B8923E`, on-primary `#FFFFFF`.

### 1.3 Typography
- **Display / headings:** Sora (`--font-sora`)
- **Body:** Inter (`--font-inter`)
- **Alt:** Plus Jakarta Sans (`--font-jakarta`)
- **Preset sizes (do not shrink):** title 24/700, card-title 18/600, body
  14/1.5, caption 12/500, metric 48/800. Body text must stay **≥14px** — no tiny
  typography (Rule 6).

### 1.4 Radii / shadows / spacing
- Radii: card `14px`, pill & input `10px`.
- Shadow: card `0 12px 32px rgba(0,0,0,.28)`; hover `0 18px 44px rgba(0,0,0,.5),
  0 0 0 1px rgba(197,164,109,.06)`.
- Spacing scale: `1`=4px, `2`=8px, `3`=12px, `4`=16px, `5`=20px, `6`=24px,
  `8`=32px.

### 1.5 Approved utilities (use these — don't reinvent)
`.card`, `.card-hover`, `.pill`, `.app-shell` (260px + 1fr grid; collapses to a
76px icon rail ≤1279px and a single column ≤767px), `.portal-glass`, `.glass-nav`,
`.cinema-card`, `.text-gold-gradient`, `.text-silver-gradient`,
`.border-cinema-gold`, `.skeleton` (shimmer). Focus ring: 2px gold
`outline` on `:focus-visible`.

---

## 2. Component & layout rules (Rule 6)
- **Avoid generic dashboard templates.** Build bespoke, on-brand layouts.
- **Avoid excessive cards** stacked in uniform grids — prefer purposeful sections.
- **Avoid unnecessary gradients** beyond the approved gold/silver text gradients
  and the app-shell radial glow.
- **Avoid tiny typography** — keep body ≥14px using the preset scale.
- **Every visible button must do something** (Rule 7). No inert controls.
- **All forms** require validation, loading, success and error states (Rule 7).
- **No mock data in production flows** (Rule 8); clearly label any dev/demo data.

## 3. Media & asset rules (Rules 11, 12)
- **Do not show a fake 3D car.** Use a real licensed GLB/GLTF model, or a clearly
  labelled fallback poster (`public/frames/ezgif-frame-001.jpg` is the current
  video-poster fallback) until a licensed asset is configured.
- **Do not claim** government, insurer, theft or market-data integrations exist
  unless authorized credentials **and** a working adapter are configured.

## 4. TrustDrive Coding Agent Rules (16)
1. Read `design.md` before editing any UI, API or workflow.
2. Audit the repository and record actual stack/routes/schema in `ARCHITECTURE.md`
   before changing architecture.
3. Preserve existing functionality and use the existing stack unless a migration
   is justified and documented.
4. Two primary roles only: **Seller** and **Buyer**. Enforce resource ownership
   and RBAC on the server.
5. Use the supplied references in `assets/references/`; redesign one page at a time.
6. Follow the tokens and component rules in `design.md`. Avoid generic dashboard
   templates, excessive cards, unnecessary gradients and tiny typography.
7. No visible button may be inert. All forms require validation, loading, success
   and error behavior.
8. Do not use mock data in production flows. Clearly label development/demo data.
9. Do not call seller-submitted documents independently verified. Missing data is
   **unknown, not clean**.
10. AI findings require evidence references, model/rule version and review state. AI
    cannot silently certify records or mutate verified history.
11. Do not show a fake 3D car. Use a real licensed GLB/GLTF model or a clearly
    labelled fallback poster until an asset is configured.
12. Do not claim government, insurer, theft or market-data integrations exist
    unless authorized credentials and a working adapter are configured.
13. Use the optional skills in `SKILLS_SETUP.md` only when supported by the current
    coding environment.
14. After every phase: run tests, open the app in a browser, capture screenshots at
    required sizes, fix visual defects and update `IMPLEMENTATION_STATUS.md`.
15. Do not mark a feature complete until its acceptance criteria pass.
16. Never commit secrets, private customer documents or unlicensed vehicle models.

## 5. Day / Night theme
- **Day (default):** champagne-gold / black cinematic UI.
- **Night:** premium deep-sapphire-blue + white (`#061329` canvas, `#4C8DFF`
  accent, `#F7FAFF` ink).
- Applied via `data-theme` on `<html>`; an inline no-flash init script
  (`THEME_INIT_SCRIPT` in `lib/theme.ts`) runs before paint; toggled client-side
  and persisted in `localStorage` (`trustdrive.theme`). Non-DOM surfaces
  (canvas 2D, WebGL, charts) read `THEME_COLORS` from `lib/theme.ts`.

---

See `SKILLS_SETUP.md` for the optional design/QA tooling and `ARCHITECTURE.md`
for the stack, routes and data schema.
