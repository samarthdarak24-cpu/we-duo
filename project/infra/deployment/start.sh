#!/bin/sh
# Full-stack TrustDrive entry point for the published single-port sandbox.
# Everything (Next.js API routes + SQLite) lives in this directory; no external
# database, cache or AI service is required for seller/buyer features to work.
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# Portable paths: the sandbox is Linux, so the local Windows .env values must
# never be used here. node:sqlite creates the directory on first open.
# Never ship a repo-readable signing key: anyone who could read this script
# would otherwise be able to forge an admin JWT. Require the operator to set
# JWT_SECRET; fall back to a random per-boot value so the sandbox still starts,
# with an explicit warning that sessions will not survive a restart.
if [ -z "${JWT_SECRET:-}" ]; then
  JWT_SECRET="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
  export JWT_SECRET
  echo "[start] WARNING: JWT_SECRET was not set; generated an ephemeral secret. Sessions will be invalidated on restart. Set JWT_SECRET in the environment for stable sessions." >&2
fi
export TD_DATA_DIR="$ROOT/.data"
export TD_DB_FILE="$ROOT/.data/trustdrive.db"
export TD_UPLOAD_DIR="$ROOT/.data/uploads"
export TD_SEED_DEMO=1
export TD_LLM_PROVIDER=none
# No Python intelligence service in this sandbox; the AI stack reports itself
# as disconnected instead of claiming a live engine.
export TD_INTELLIGENCE_URL=""
export PORT="${PORT:-3000}"
export NEXT_DIST_DIR=.next

# The hosting platform kills a service whose port is not answering within
# ~30s. `npm run build` takes longer than that, so boot.mjs binds PORT
# immediately, builds in the background and proxies to Next.js once healthy.
# Set TD_SKIP_BUILD=1 only when a valid prebuilt .next is already present.
if [ -f "$ROOT/.next/BUILD_ID" ] && [ "${TD_FORCE_BUILD:-0}" != "1" ]; then
  echo "[start] reusing existing production build"
  export TD_SKIP_BUILD=1
else
  echo "[start] no production build found; boot.mjs will build it"
fi

exec node boot.mjs
