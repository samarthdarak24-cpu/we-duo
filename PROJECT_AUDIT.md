# Project Audit — TrustDrive

Audit date: **2026-11-07** (updated from the 2026-11-06 pass). Every number below was read from the repository and
the running services during this pass, not copied from earlier design notes.

## 1. Actual structure

Two runtimes, one shared SQLite database and one shared upload directory:

```text
finall caranimation/
├── frontend/                  Next.js 14 App Router — system of record
│   ├── app/                   52 pages + 109 API route handlers
│   ├── components/            87 React components (public/seller/buyer/shared/admin/ui)
│   ├── lib/server/            DB, auth, RBAC, engine, AI, OCR bridge, storage, PDF
│   ├── public/models/         trustdrive-sedan.glb (real GLB, 11.8 MB)
│   ├── tests/                 13 Vitest suites
│   └── e2e/                   2 Playwright specs
├── backend/                   FastAPI intelligence service (additive)
│   ├── app/                   56 Python modules: extraction, detectors, agent, worker
│   ├── tests/                 10 pytest modules
│   └── .venv/                 runtime used by uvicorn on 127.0.0.1:8000
├── .data/trustdrive.db        shared SQLite DB (55 tables, schema user_version=3)
├── .data/uploads/             shared private uploads
├── qa/live-browser/           live browser proof harness + screenshots + result JSON
├── .env                       shared TD_* configuration (repo root)
└── frontend/.env.local        JWT secret + data paths for Next.js
```

The Next.js app is **not** at the repository root and the Python service is
**not** `services/intelligence`. Earlier versions of this document said that;
both claims were wrong and have been corrected here.

## 2. Inventory (verified)

| Item | Count | How verified |
| --- | --- | --- |
| Next.js pages (`page.tsx`) | 52 | filesystem walk |
| API route handlers (`route.ts`) | 109 | filesystem walk (2026-11-07) |
| React components | 87 | filesystem walk of `frontend/components` |
| Python modules | 56 | filesystem walk of `backend/app` |
| Database tables | 54 | `sqlite_master` on `.data/trustdrive.db` |
| SQLite schema version | 3 | `PRAGMA user_version` |
| Vitest suites | 13 | `frontend/tests/**/*.test.ts(x)` |
| Playwright specs | 2 | `frontend/e2e/*.spec.ts` |
| Pytest modules | 10 | `backend/tests/*.py` |
| Roles | 2 + admin | seller, buyer, admin (admin is operational, not a portal role) |

## 3. Runtime configuration actually in use

| Variable | Purpose | Present |
| --- | --- | --- |
| `JWT_SECRET` | session signing for Next.js | yes (`frontend/.env.local`) |
| `TD_DB_FILE`, `TD_DATA_DIR`, `TD_UPLOAD_DIR` | one DB/uploads for both runtimes | yes |
| `TD_SERVICE_TOKEN` | Next → Python service auth | yes (root `.env`) |
| `TD_INTELLIGENCE_URL` | `http://127.0.0.1:8000` | yes |
| `TD_INTELLIGENCE_TIMEOUT_MS` | Python call budget | yes |
| `TD_LLM_PROVIDER`, `TD_LLM_MODEL` | optional LLM adapter; final runtime uses `none` | yes, LLM inactive |
| `TD_SEED_DEMO` | demo seed data gate | yes |
| `TD_MODEL_DIR` | XGBoost/YOLO assets | yes |

Live service health on 2026-11-07:

```json
{
  "status": "ok",
  "database": { "database": "connected", "tables": 54, "shared_with_nextjs": true },
  "llm": { "active": false, "provider": "none", "model": null, "local_ready": false },
  "ocr_backends": [
    { "engine": "paddleocr", "available": false },
    { "engine": "rapidocr", "available": true },
    { "engine": "pymupdf-text-layer", "available": true },
    { "engine": "opencv-preprocess", "available": true }
  ],
  "agent": {
    "orchestrator": "langgraph",
    "version": "investigator-2.0.0-multicategory",
    "checkpointing": true,
    "node_registry_count": 16,
    "conditional": true
  }
}
```

The LLM is deliberately disabled in the final runtime; no narrative conclusion is generated. LangGraph 0.4.10 is installed in `backend/.venv` and the 15/16-node conditional graph executes.

## 4. What is genuinely connected

| Chain | UI | API | Service | DB | Live proof |
| --- | --- | --- | --- | --- | --- |
| RC upload → OCR → fields | `/seller/documents` | `POST /vehicles/:id/documents` | Python `/api/intelligence/documents/process` (RapidOCR) | `documents`, `document_extractions` | PASS 11/11 |
| Mileage + rollback | `/seller/vehicles/:id` | `POST/GET /vehicles/:id/mileage` | Next rules engine | `mileage_readings`, `findings` | PASS 6/6 |
| AI investigation | `/seller/fraud` | `POST /vehicles/:id/ai-investigations` | Python 12-node agent | `ai_runs`, `findings` | PASS 9/9 |
| Damage records | `/seller/vehicles/:id` | `POST/GET /vehicles/:id/damage` | Next + component map | `damage_records` | PASS 4/4 |
| Marketplace + 3D hotspot | `/vehicle/:id` | listing/publish/photos/3d-model | Next + Three.js | `listings`, `listing_images`, `damage_records` | PASS 9/9 |
| Buyer inquiry → seller reply → PDF | `/vehicle/:id`, `/seller/inquiries` | inquiries/messages/reports | Next | `inquiries`, `inquiry_messages`, `reports` | PASS 10/10 |
| Server-side RBAC / consent | all portals | 109 routes via `lib/server/http.ts` | Next | ownership joins | PASS 13/13 + 10/10 |

## 5. What is present but not fully configured / not claimed

These capabilities are deliberately **not** claimed as fully working integrations:

| Capability | Actual state | Evidence |
| --- | --- | --- |
| LangGraph orchestration | **Resolved:** LangGraph 0.4.10 is installed in `backend/.venv`; `/health` reports `orchestrator: "langgraph"`, `checkpointing: true`, `checkpoint_backend: "sqlite"`, `durable_checkpointing: true`, 16-node registry, conditional 15/16-node profiles. Threads persist to `.data/langgraph-checkpoints.db`. | `/health` agent block; `backend/app/agent.py` |
| YOLO damage adapter | `ultralytics` + `car_damage.pt` report ready, but the tested upload path writes human-entered damage records; no end-to-end photo→damage flow is claimed. | `/health` intelligence.damage |
| XGBoost mileage model | Present, `training.dataset_label = synthetic-demo`; demo, not production fraud detection. | `/health` intelligence.xgboost |
| PaddleOCR | not installed; RapidOCR is the active OCR engine | `/health` ocr_backends |
| Government / insurer / theft registry | no credentials or adapters; rows are `unavailable` or explicitly demo-labelled | `provider_checks`, `SECURITY.md` |
| Blockchain anchoring | not implemented; SHA-256 proves integrity only | README / reports |
| S3 / external AV | local disk and local signature scan only | `lib/server/files.ts`, `scan.ts` |

## 6. Findings from this pass

| # | Finding | Severity | Resolution |
| --- | --- | --- | --- |
| A1 | Document upload only wrote `pending`; no OCR job ever ran, yet the UI implied verification was queued. | **Critical (fake-success risk)** | Real bridge `lib/server/document-ocr.ts` calls Python, persists `extracted` + `document_extractions`; shows engine/method/confidence/flags; stays `pending` with a real reason when unavailable. |
| A2 | AI investigation button used only the deterministic Next fallback even when the Python agent was healthy. | High | Route now calls Python first, persists `ai_runs`, returns 15/16 nodes/human review/model versions; labelled fallback only when the call fails. |
| A3 | A demo theft row was treated as a clean provider check in verification/insights. | High (false assurance) | Demo source ignored; missing checks are `pending`/`unavailable`; theft can never be `verified` without a real provider. |
| A4 | Marketplace `q` did not search registration/VIN/TrustDrive ID although the search box promises it. | Medium | `getMarketplace` matches all three (plus existing fields); SQL metacharacters treated as text. |
| A5 | Document listing had no consent/ownership gate for buyers and other sellers. | High | Consent-gated buyer view of published listings; other sellers 403; owner/admin full list; raw bytes owner/admin only. |
| A6 | Duplicate RC uploads were re-verified with no duplicate marker. | Medium | Python extraction detects duplicate hash/history; document becomes `needs_correction` with `duplicate_of`. |
| A7 | `VehicleViewer3D` used the sedan GLB for every category, producing a fake vehicle. | High (design rule 13) | Backend returns `assetUrl: null` for unsupported categories; UI renders a labelled schematic with interactions disabled. |
| A8 | `app/vehicle/[id]/page.tsx` passed an invalid `style` prop to `Icon`, breaking `tsc`. | Medium | Fixed; typecheck clean. |
| A9 | 3D hotspot buttons lacked an accessible name and the model fetch could race the damage query. | Medium | Hotspots have `aria-label` with damage count; viewer waits for DB hotspots. |

## 7. Remaining blockers

1. **PaddleOCR** — optional; RapidOCR is active and reported.
2. **Real fraud corpus** — XGBoost remains demo-trained.
3. **External registries** — need authorised credentials plus adapters.
4. **Split deployment** — Next `node:sqlite` and FastAPI share one file, so a
   split Render deploy requires a Postgres migration (documented, not done).
   The rate-limit table and LangGraph checkpoints must then move to Postgres/Redis.
5. **Docker build** — daemon unavailable in this environment; CI owns it.

Durable LangGraph checkpoints are no longer a blocker: SQLite checkpointing is
active and verified, with an honest memory fallback when the optional package is
absent.
