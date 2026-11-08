# Integrations & Blockers Report

Covers: XGBoost fraud (§5), storage/AV (§7), notifications (§8), LLM narrative (§9), external registry (§11), blockchain (§10), 3D models (§12).
Each item carries an honest status and the exact blocker.

---

## §5 XGBoost Fraud Model — DEMO ONLY

- `backend/app/intelligence/fraud/` exposes `GET /ai/fraud/model-status` and scoring endpoints.
- `mileage_xgb.json` (XGBoost) is loaded when available; Python deps `xgboost`, `sklearn` are installed.
- **Live status response is honest:**
  ```json
  { "mode": "experimental", "training_data": "synthetic-demo", "metrics": null }
  ```
- **Verdict:** The pipeline runs, but the model is trained on **synthetic data** and publishes **no metrics**. Scores must not be used for underwriting or go/no-go decisions. Re-train on licensed, labelled data and publish precision/recall/AUC before any production claim.

## §7 Storage & Malware/AV Scanning — PARTIAL

- Uploads go to `.data/uploads` (local) with SHA-256 + size tracking.
- A malware/AV scan runs on upload: a **local** scanner is implemented; a **remote** AV provider is configurable but **not configured** (`storage:local`, `notifications:log-only` style fallback).
- `GET /system/storage` reports `storage:local`.
- **Verdict:** Local scanning is real. Remote/cloud AV (e.g. virus-scan SaaS) is not wired — provider credentials absent. Add a provider + key to move to `storage:remote-scanned`.

## §8 Notifications — DEMO ONLY

- `backend/app/integrations/notifications.py` implements an in-app notification store + a **log-only** delivery adapter.
- `GET /system/notifications` reports `notifications:log-only`.
- **Verdict:** Buyers/sellers see in-app events. **No email, SMS, or WhatsApp delivery** is configured. Wire a provider (e.g. SES/SMTP/Twilio) + templates to exit demo mode.

## §9 LLM Trust Narrative — DEMO ONLY

- The trust narrative is grounded in real findings (deterministic explain engine) with a templated fallback.
- A live LLM call is supported via `TD_LLM_PROVIDER`, but **no key is configured** (`TD_LLM_PROVIDER=none` in CI). When unset, the system returns the grounded template — never a fabricated story.
- **Verdict:** Safe by construction (no hallucinated claims). To enable generative narrative, supply a provider key and re-test the `ai-assistant-wiring` path.

## §11 External Registry (VAHAN / Insurer / Theft DB) — BLOCKED

- `backend/app/integrations/registry.py` provides a registry interface with **mock** adapters.
- `GET /system/registry` reports `registry:mock-*`.
- **Verdict:** No API credentials for VAHAN (India vehicle registry), insurer verification, or stolen-vehicle databases were provided. The interface is real; **every call is a mock**. Do not present registry checks as verified until credentials + contracts are in place and live calls pass contract tests.

## §10 Blockchain Anchoring — BLOCKED

- A blockchain interface/anchor module exists as a stub; no chain (testnet or mainnet), wallet, or RPC credentials are configured.
- **Verdict:** Cannot anchor trust records on-chain without credentials. Interface present; live anchoring blocked.

## §12 3D Inspection Models — PARTIAL

- `frontend/public/models/car.glb` and `vehicles/trustdrive-sedan.glb` are **real** meshes (11.7 MB each).
- `frontend/public/models/vehicles/scooter.glb` is a **10 KB schematic placeholder** (not a true mesh).
- The 3D viewer is category-aware (M2 in `live-audit.spec` asserts a two-wheeler never renders the car mesh).
- **Verdict:** Car/sedan inspection is production-ready. Two-wheelers, three-wheelers, and commercial vehicles render a schematic stand-in. Commission/author real GLB assets per category to complete.

---

## Blocker summary (what is needed to exit DEMO/BLOCKED)

| Item | Blocker | Exit condition |
|------|---------|----------------|
| Fraud model | Synthetic training data | Licensed dataset + published metrics |
| Storage/AV | No remote AV provider | Provider key configured |
| Notifications | No delivery provider | Email/SMS/WhatsApp wired + templates |
| LLM narrative | No provider key | `TD_LLM_PROVIDER` + key |
| External registry | No API credentials | VAHAN/insurer/theft contracts + keys |
| Blockchain | No chain credentials | Wallet/RPC + anchoring tests |
| 3D (non-car) | No real meshes | Per-category GLB assets |
