#!/usr/bin/env bash
# Combined Render supervisor: Next.js (public port) + FastAPI + DB worker.
set -euo pipefail

PORT="${PORT:-10000}"
export TD_INTELLIGENCE_URL="${TD_INTELLIGENCE_URL:-http://127.0.0.1:8000}"

echo "[start] next.js on 0.0.0.0:${PORT}"
HOSTNAME=0.0.0.0 PORT="${PORT}" node server.js &
WEB_PID=$!

# Wait for the web process to create/upgrade the SQLite schema before the API
# and worker touch it.
for _ in $(seq 1 90); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/v1/health/ready" >/dev/null 2>&1; then
    echo "[start] web ready"
    break
  fi
  sleep 1
done

echo "[start] fastapi on 127.0.0.1:8000"
(
  cd /app/backend
  exec python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
) &
API_PID=$!

WORKER_PID=""
if [ "${TD_WORKER_MODE:-process}" = "inline" ]; then
  # FastAPI starts the same DB-backed loop as a daemon thread. This saves a
  # whole Python interpreter, which matters on a 512 MB single-container host.
  echo "[start] worker inline in FastAPI"
else
  echo "[start] worker"
  (
    cd /app/backend
    exec python -m app.worker
  ) &
  WORKER_PID=$!
fi

cleanup() {
  kill "${WEB_PID}" "${API_PID}" ${WORKER_PID:+"${WORKER_PID}"} 2>/dev/null || true
}
trap cleanup TERM INT EXIT

# Exit if any process dies so Render can restart the service.
if [ -n "${WORKER_PID}" ]; then
  wait -n "${WEB_PID}" "${API_PID}" "${WORKER_PID}"
else
  wait -n "${WEB_PID}" "${API_PID}"
fi
