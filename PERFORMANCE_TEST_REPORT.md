# TrustDrive — Performance & Reliability Test Report

**Date:** 2026-11-05 · **Result: NOT EXECUTED this pass (no load generator in sandbox)**

## What was measured (lightweight, real)
- Vitest suite: 84 tests in **16.86 s** (transform 439 ms, tests 784 ms) — fast unit/component layer.
- Pytest suite: 99 passed/1 skipped in **50.17 s** — includes OCR/detector/agent/API tests.
- Live API latency: FastAPI auth + read endpoints responded in well under 1 s on localhost.
- DB: SQLite with 30 indexes and WAL; simple indexed queries (by `owner_id`, `vehicle_id`,
  `status`) are O(indexed) and cheap at the current data scale.

## Not executed (be honest)
- **k6 / artillery load test** of API endpoints — no load generator installed.
- **Concurrent-user / file-upload throughput / OCR-job throughput** — not scripted.
- **Three.js GPU/resource cleanup** — requires a real browser/GPU; Playwright not installed.
- **Testcontainers** — not used.
- **Redis availability / Celery** — Redis is an adapter; the worker is `db-backed` (broker `none`), so
  no Redis dependency in the local run.

## Recommendations
- Add a `k6` script against `marketplace/listings`, `vehicles/mine`, `verify/{token}` and run in CI.
- Add a memory/leak check for the Three.js viewer across repeated mounts.
- If multi-instance, move rate-limit buckets + worker broker to Redis (already flagged in SECURITY.md).

## Verdict
No performance regression was observed at the unit/integration scale. Sustained-load and browser
rendering performance remain unverified and are listed as remaining blockers.
