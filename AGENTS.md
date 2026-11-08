# AGENTS.md — Mandatory rules for coding agents

Derived from `project/docs/project/newdesign (3).md` §0 and
`project/docs/project/design.md`. Read that specification fully before making
changes. These rules override convenience.

## 1. Preserve first

1. **Do not rebuild blindly.** Inspect the existing source and preserve working
   functionality. The Next.js app is the system of record for portals, REST and
   the relational DB. The Python intelligence service is additive.
2. **Never remove a working feature** to make a new one fit. No silent removal.
3. **Do not overwrite independently verified history.** Corrections go through
   audited endpoints; 11 immutability triggers enforce this.
4. Keep **one shared database**. Both runtimes read the same file/URL.

## 2. Evidence and honesty (the product's core promise)

5. **All displayed data must be real or visibly labelled demo data.** Seed data
   carries demo labels. Never hardcode production dashboard statistics.
6. **No fake results.** Every visible action must write to a real backend. No
   `setTimeout` success, no decorative buttons, no placeholder actions.
7. **All AI findings cite evidence IDs, method and model/rule version.** A PDF
   text layer is never reported as OCR; a fallback is never reported as the
   primary engine; a missing LLM returns *no conclusion*.
8. **Never claim an unavailable integration works.** Implement an adapter and
   label demo/local data explicitly. Report the active engine in every payload.
9. **A matching SHA-256 proves file integrity, not document authenticity.**
   Blockchain anchoring is not claimed.
10. **Missing data is unverified coverage, not proven fraud.** The trust score is
    additive, deterministic and versioned; no LLM sets it.

## 3. Design system (Rule 5 / §2)

11. Use the tokens in `project/docs/project/design.md` and
    `frontend/app/globals.css`. Graphite sidebar,
    champagne-gold accent in Day mode; blue-and-white portal in Night mode.
12. Build reusable components before duplicating page markup. Redesign **one
    page at a time**, checking both desktop and mobile.
13. Realistic vehicle imagery only. **Real GLB for the 3D viewer** — never ship a
    primitive placeholder as the final vehicle. A 3D hotspot must map to an
    actual database damage record, not a decorative marker.
14. Loading skeletons, empty states and error states are required, not optional.
    No overcrowding, no random icon sizes, no excessive gold, no unnecessary
    animations.

## 4. Security and permissions

15. **Server-side RBAC on every endpoint** (`frontend/lib/server/http.ts`), verified for
    direct URL navigation *and* direct API calls. Private documents are
    consent-gated. Input validated on both sides. See `project/docs/RBAC_MATRIX.md`.

## 5. Definition of done (§20)

16. A feature is COMPLETE only when: UI matches the approved design · backend
    API exists · DB operation works · permissions enforced server-side ·
    loading/empty/error states work · input validation works · tests pass ·
    data persists after refresh · no placeholder action remains · no fake result
    is presented as real · the related Seller/Buyer workflow works.

**Sequence:** do not skip phases. Do not move ahead when core functionality is
broken. After each phase run typecheck, tests, build and update
`project/docs/IMPLEMENTATION_STATUS.md`. Do not mark a feature complete on a visual
placeholder.

## 6. Verification commands

```bash
npm run typecheck              # frontend TypeScript
npm test                       # frontend Vitest suites
npm run test:backend           # backend Pytest suites
npm run build                  # NEXT_DIST_DIR=.next_verify for an isolated build
npm run test:integration       # gated S3/SMTP/SMS/ClamAV suites
npm run render:validate        # deployment config consistency
npm run test:e2e               # needs a running, seeded app
```

Never run `next dev` and `next start` against the same `.next` directory —
it corrupts manifests. Do not delete `.workbuddy-ai/` (project data, not cache),
`.data/` (live database), `.kilo/worktrees/` (registered git worktrees) or the
`.wbapp_*.genie` app card.

## 7. Repository layout rules

- `frontend/` and `backend/` are the only places application code may live; both
  resolve the repository root from their own directory.
- AI/ML code lives in `services/ai/`. `backend/app/intelligence/` only
  re-exports it — add new model code under `services/ai/` and extend the shim.
- Everything else (docs, QA harnesses, helper scripts, tests support,
  Docker/Render config) lives under `project/`. Do not add new top-level folders.
- Run `npm run render:validate` after touching any Dockerfile, compose file or
  `render.yaml`; it fails when a COPY source or build context is wrong.
