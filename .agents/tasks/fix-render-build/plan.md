# Implementation Plan: Fix Render Build Failure

## Root Cause Confirmed

Render is running `npm ci && npm run build` in the `frontend/` directory during the Node.js build phase. The `render.yaml` specifies `runtime: docker` and `dockerfilePath: ./Dockerfile.render`, which should use Docker, but Render's Node.js builder is ignoring this and running a native Node.js build instead.

During the build phase:
1. Environment variables from `render.yaml` (including `TD_DB_FILE=/data/trustdrive.db`) are injected
2. Next.js attempts to analyze pages marked `force-dynamic`
3. Some pages call `getDb()` indirectly during build-time analysis (e.g., `getUsersByRole()`, `getLatestRun()`, `getQrToken()`)
4. `getDb()` tries to create `/data` directory but lacks permissions, causing the build to fail

## Current State Analysis

### Files that need changes:
- `frontend/lib/server/db.ts` — `getDb()` function lacks build-time guard
- `Dockerfile.render` — `TD_DB_FILE` is already correctly set only in runtime stage (verified ✓)
- `render.yaml` — already has `runtime: docker` and `dockerfilePath` set (verified ✓)

### Pages analysis:
All 24+ pages that import from `lib/server/db` or `lib/server/data` already have `export const dynamic = "force-dynamic"` set. No pages use `generateStaticParams` with DB access. The pages are correctly configured for dynamic rendering.

**However**: Next.js build-time analysis may still invoke the component function to check exports, and synchronous calls to `getUsersByRole()`, `getLatestRun()`, etc. inside the component body will trigger `getDb()` during build.

## Implementation Plan

- [ ] **1. Add build-time guard to `getDb()` in `frontend/lib/server/db.ts`**

  Add an explicit check at the very beginning of the `getDb()` function that detects Next.js build phase and throws a descriptive error.

  **Exact change:**
  - Location: Right after the function signature `export function getDb(): DatabaseSync {`
  - Add:
    ```typescript
    // Guard: never access DB during Next.js build phase (all pages must be force-dynamic)
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      throw new Error(
        'getDb() called during Next.js build phase. All page routes must be dynamic (no SSG DB access). ' +
        'Set export const dynamic = "force-dynamic" on any page that imports server code.'
      );
    }
    ```
  
  **Files:** `frontend/lib/server/db.ts` (line ~580, before the globalThis check)
  
  **Verify:** Run `npm run build` locally in `frontend/` directory. The build should succeed because all pages already have `force-dynamic` set. If the build fails with the new error, it means a page is missing the `force-dynamic` export — that page must be fixed before proceeding.

- [ ] **2. Improve error handling for `fs.mkdirSync` in `getDb()`**

  Wrap the `fs.mkdirSync(dbDir, { recursive: true })` call in a try/catch block that provides actionable error messages.

  **Exact change:**
  - Location: Around line ~590 in `frontend/lib/server/db.ts`, where `fs.mkdirSync(dbDir, { recursive: true })` is called
  - Replace the bare `fs.mkdirSync(dbDir, { recursive: true });` with:
    ```typescript
    try {
      fs.mkdirSync(dbDir, { recursive: true });
    } catch (err) {
      throw new Error(
        `Cannot create database directory ${dbDir}: ${err instanceof Error ? err.message : String(err)}. ` +
        `Set TD_DB_FILE to a writable path.`
      );
    }
    ```
  
  **Files:** `frontend/lib/server/db.ts` (around line ~590)
  
  **Verify:** Same as step 1 — `npm run build` should succeed.

- [ ] **3. Verify no pages are missing `force-dynamic`**

  All 24 pages that import from `lib/server/db` or `lib/server/data` already have `export const dynamic = "force-dynamic"` set (confirmed by grep). No action needed.

  **Confirmed pages with `force-dynamic`:**
  - `app/page.tsx`
  - `app/login/page.tsx`
  - `app/register/page.tsx`
  - `app/marketplace/page.tsx`
  - `app/verify/[token]/page.tsx`
  - `app/print/report/[id]/page.tsx`
  - `app/buyer/page.tsx`
  - `app/buyer/explore/page.tsx`
  - `app/buyer/search/page.tsx`
  - `app/buyer/saved/page.tsx`
  - `app/buyer/history/page.tsx`
  - `app/buyer/risk/page.tsx`
  - `app/buyer/verification/page.tsx`
  - `app/buyer/compare/page.tsx`
  - `app/buyer/reports/page.tsx`
  - `app/buyer/notifications/page.tsx`
  - `app/buyer/settings/page.tsx`
  - `app/seller/page.tsx`
  - `app/seller/add-vehicle/page.tsx`
  - `app/seller/verification/page.tsx`
  - `app/admin/users/page.tsx`
  - `app/admin/audit/page.tsx`
  - `app/admin/kyc/page.tsx`
  - `app/admin/queue/page.tsx`
  - `app/admin/notifications/page.tsx`
  - `app/admin/settings/page.tsx`

  **Verification:** None needed — this is a confirmation step based on grep results.

- [ ] **4. Confirm `Dockerfile.render` does NOT set `TD_DB_FILE` in build stage**

  **Current state (verified ✓):**
  - The `node-build` stage sets only: `NEXT_OUTPUT=standalone`, `NEXT_TELEMETRY_DISABLED=1`, `NODE_OPTIONS=--max-old-space-size=4096`
  - The `runtime` stage sets `TD_DB_FILE=/data/trustdrive.db` (correct)

  **No changes needed.** The Dockerfile is already correctly structured.

  **Files:** `Dockerfile.render` (no changes)

  **Verify:** Visual inspection (already done).

- [ ] **5. Confirm `render.yaml` specifies `runtime: docker`**

  **Current state (verified ✓):**
  ```yaml
  services:
    - type: web
      name: trustdrive
      runtime: docker
      dockerfilePath: ./Dockerfile.render
  ```

  **No changes needed.** The `render.yaml` is already correctly configured to use Docker.

  **Files:** `render.yaml` (no changes)

  **Verify:** Visual inspection (already done).

- [ ] **6. Test the build locally with isolated Next build directory**

  Run the build using the verification command from `AGENTS.md` that uses an isolated build directory to ensure no cross-contamination from a dev server.

  **Command:**
  ```bash
  cd frontend
  set NEXT_DIST_DIR=.next_verify
  npm run build
  ```

  **Expected outcome:**
  - Build completes successfully
  - All pages show as `ƒ` (dynamic) in the build output
  - No pages show as `○` (static) or `●` (SSG)
  - No errors about DB access during build

  **If the build fails:**
  - The error message from Fix 1 will identify which page is calling `getDb()` during build
  - Add `export const dynamic = "force-dynamic"` to that page
  - Re-run the build

  **Files:** None (verification only)

  **Verify:** Check the terminal output for the Next.js build summary table showing route types.

- [ ] **7. Test the runtime behavior locally**

  Start the built Next.js server and verify that the DB initialization works correctly at runtime.

  **Commands:**
  ```bash
  cd frontend
  set TD_DB_FILE=.data/trustdrive.db
  set NODE_ENV=production
  npm run start
  ```

  Open `http://localhost:3000` and verify:
  - The home page loads
  - Login works (`admin@trustdrive.dev` / `demo1234`)
  - The buyer/seller portals load
  - No errors in the server console about DB access

  **Files:** None (verification only)

  **Verify:** Manual browser testing.

## Summary of Required Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `frontend/lib/server/db.ts` | Add guard | Build-time phase detection in `getDb()` |
| `frontend/lib/server/db.ts` | Improve error | Wrap `fs.mkdirSync` in try/catch with clear message |
| `Dockerfile.render` | **No change** | Already correct — `TD_DB_FILE` only in runtime stage |
| `render.yaml` | **No change** | Already correct — `runtime: docker` is set |
| All pages | **No change** | All pages already have `force-dynamic` set |

## Render Service Configuration Status

**Current configuration:** ✅ Already correct
- `runtime: docker` is set
- `dockerfilePath: ./Dockerfile.render` is set
- `disk.mountPath: /data` is configured
- No `buildCommand` override (would bypass Docker)
- No `startCommand` override (would bypass Docker CMD)

**Issue:** Render's platform may still be running the native Node.js build despite `runtime: docker` being set. The build-time guard in Fix 1 will fail fast with a clear error message if Render's build environment tries to access the DB.

## Build vs Runtime Behavior

| Phase | Environment | TD_DB_FILE | Expected Behavior |
|-------|-------------|------------|-------------------|
| **Local dev** (`npm run dev`) | Local machine | `.data/trustdrive.db` | ✅ DB created in `.data/` directory |
| **Local build** (`npm run build`) | Local machine | `.data/trustdrive.db` | ✅ No DB access (all pages are `force-dynamic`) |
| **Local prod** (`npm start`) | Local machine | `.data/trustdrive.db` | ✅ DB accessed at runtime |
| **Render build** (Node.js) | Render builder | `/data/trustdrive.db` | ✅ **NEW:** Build fails fast with clear error if DB accessed |
| **Render runtime** (Docker) | Render container | `/data/trustdrive.db` | ✅ DB created in mounted `/data` volume |

## Verification Commands

After implementing the changes:

```bash
# 1. TypeScript check
cd frontend
npx tsc --noEmit

# 2. Build with isolated directory (per AGENTS.md)
set NEXT_DIST_DIR=.next_verify
npm run build

# 3. Runtime test
set TD_DB_FILE=.data/trustdrive.db
set NODE_ENV=production
npm run start

# 4. Unit tests (if any touch db.ts)
npm test
```

## Expected Outcome

After these changes:

1. **Local builds** continue to work (all pages are already `force-dynamic`)
2. **Render builds** will either:
   - Succeed because Docker is used (correct behavior)
   - Fail fast with a clear error message pointing to the exact issue if Node.js build phase tries to access DB
3. **Runtime** behavior is unchanged — `getDb()` works normally after the build phase
4. **Error messages** are actionable and guide developers to the fix

## Next Steps After Plan Approval

1. Implement Fix 1 (build-time guard)
2. Implement Fix 2 (improved error handling)
3. Run local verification (steps 1-3 above)
4. Commit changes
5. Push to trigger Render deployment
6. Monitor Render build logs for success
