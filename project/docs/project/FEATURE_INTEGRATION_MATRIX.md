# Feature Integration Matrix — TrustDrive

Date: **2026-11-06** · Runtime: Next.js 14 (`frontend/`) + FastAPI intelligence
(`backend/`) + one SQLite database (`.data/trustdrive.db`, 55 tables, schema v3).

> **Status note (2026-11-07):** this matrix is the 2026-11-06 snapshot. The final
> classification for every feature is in **`FEATURE_BY_FEATURE_AUDIT.md`**.
> Entries below marked `PARTIALLY CONNECTED` mean “not re-driven end-to-end in
> that pass”, not “broken”; the six mandatory features and security remain PASS.
> The broad 2026-11-07 run then exercised all six categories end-to-end
> (272/272 checks), and the focused run exercised six core chains (49/49).

Legend — `PASS` requires a live browser action, a real API response, a database
row and a UI refresh, not just HTTP 200. `PARTIALLY CONNECTED` means the chain
exists but one leg is untested or degraded. `MISSING EXTERNAL CONFIGURATION`
means no honest live result is possible yet.

## 1. Mandatory proof table

| # | Feature | Role | Route | Component | Endpoint | Method | Backend service | DB tables | External / AI | Status | Live evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | RC upload + OCR | Seller | `/seller/documents` | `DocumentsManager.tsx` | `/api/v1/vehicles/:id/documents` | POST | `lib/server/document-ocr.ts` → Python `POST /api/intelligence/documents/process` | `documents`, `document_extractions`, `audit_logs` | RapidOCR (`rapidocr-onnx-crnn`), OpenCV preprocess, PyMuPDF text layer | **PASS** | 11/11, `doc-1793989171647`, engine `rapidocr`, confidence 0.778, 8 extraction rows, UI shows engine after refresh |
| 2 | Mileage detection | Seller | `/seller/vehicles/:id` | `HistoryManager.tsx` | `/api/v1/vehicles/:id/mileage` | POST, GET | `lib/server/engine.ts` rollback rule | `mileage_readings`, `findings` | none (deterministic) | **PASS** | 6/6, 52,000 km → 41,000 km flagged, `ODOMETER_ROLLBACK` persisted and rendered |
| 3 | AI investigation | Seller | `/seller/fraud?vehicle=:id` | `InvestigationPanel.tsx` | `/api/v1/vehicles/:id/ai-investigations` | POST, GET | `backend/app/agent.py` (LangGraph) via `lib/server/intelligence.ts` | `ai_runs`, `findings`, `evidence_nodes` | LangGraph 0.4.10, 15-node conditional graph, local Qwen adapter (advisory only) | **PASS** | 9/9, `orchestrator=langgraph`, 15 nodes, 2 findings / 6 citations, `ai_runs.graph=langgraph-conditional`, UI `15/15` |
| 4 | Damage inspection | Seller | `/seller/vehicles/:id` | `DamageEditor.tsx` | `/api/v1/vehicles/:id/damage` | POST, GET | `lib/server/db-intelligence.ts` + component registry | `damage_records` | deterministic component anchor (no YOLO claim) | **PASS** | 4/4, `d-1793989213056`, zone `front_bumper`, component anchor, UI renders description |
| 5 | Marketplace | Seller → Buyer | `/seller/listings`, `/buyer/explore`, `/vehicle/:id` | `ListingDetailEditor.tsx`, `VehicleCard.tsx`, `FilterPanel.tsx`, `VehicleViewer3D.tsx` | `/api/v1/seller/listings`, `/publish`, `/photos`, `/api/v1/marketplace/listings`, `/api/v1/vehicles/:id/3d-model` | POST, GET | Next listing service + Three.js GLB | `listings`, `listing_images`, `vehicles`, `damage_records` | real GLB `/models/vehicles/trustdrive-sedan.glb` | **PASS** | 9/9, published `l-1793989218038`, 3 photos, search by registration `MH12QA7132`, 3D hotspot opens `MW5ATBQ1` |
| 6 | Buyer inquiries | Buyer → Seller | `/vehicle/:id`, `/seller/inquiries` | `ContactSeller` block, `Inbox.tsx` | `/api/v1/inquiries`, `/api/v1/inquiries/:id/messages`, `/api/v1/reports/vehicle/:id` | POST, GET | Next inquiry service + PDF generator | `inquiries`, `inquiry_messages`, `reports` | none | **PASS** | 10/10, buyer message → seller UI reply → buyer thread 2 messages; PDF 45 KB `%PDF`, `reports.status=ready` |

## 2. Seller features

| Feature | Route | Component | Endpoint | Tables | Status | Note |
| --- | --- | --- | --- | --- | --- | --- |
| Seller dashboard KPIs | `/seller` | `seller/page.tsx` | `/api/v1/seller/overview` | `vehicles`, `listings`, `inquiries` | PARTIALLY CONNECTED | Real aggregates; not re-tested in this pass |
| My vehicles list / archive | `/seller/vehicles` | `VehicleManager.tsx` | `/api/v1/seller/vehicles`, `/:id/archive` | `vehicles`, `chain_records` | PARTIALLY CONNECTED | Prior live pass; archive is soft delete |
| Add vehicle wizard | `/seller/add-vehicle` | `AddVehicleStepper.tsx` | `/api/v1/vehicles` | `vehicles`, `chain_records` | PARTIALLY CONNECTED | Real POST; category validation |
| Documents + consent | `/seller/documents` | `DocumentsManager.tsx` | `/api/v1/vehicles/:id/documents`, `/api/v1/documents/:id/consent`, `/replace`, `/reverify` | `documents`, `document_extractions` | **PASS** | Upload/OCR/duplicate/consent proven; replace/reverify API verified earlier |
| Mileage timeline | `/seller/vehicles/:id` | `HistoryManager.tsx` | `/api/v1/vehicles/:id/mileage` | `mileage_readings`, `findings` | **PASS** | Includes rollback UI |
| Fraud / investigation | `/seller/fraud` | `InvestigationPanel.tsx`, `ProviderChecksPanel.tsx` | `/ai-investigations`, `/provider-checks` | `ai_runs`, `findings`, `provider_checks` | **PASS** | LangGraph; unavailable providers labelled |
| Damage records | `/seller/vehicles/:id` | `DamageEditor.tsx` | `/api/v1/vehicles/:id/damage`, `/api/v1/damage/:id/correction` | `damage_records` | **PASS** | Corrections audited |
| Listings + publish | `/seller/listings`, `/seller/listings/:id` | `ListingDetailEditor.tsx` | `/api/v1/seller/listings`, `/:id/:action`, `/share` | `listings`, `listing_images` | **PASS** | Publish gate: 3 photos + verified RC + required fields |
| Inquiries inbox | `/seller/inquiries` | `Inbox.tsx` | `/api/v1/inquiries/:id`, `/:id/messages` | `inquiries`, `inquiry_messages` | **PASS** | Reply visible to buyer |
| Reports | `/seller/reports` | reports page | `/api/v1/reports`, `/download` | `reports` | PARTIALLY CONNECTED | Buyer-side generation proven; seller list page not re-tested |
| Seller settings | `/seller/settings` | settings page | `/api/v1/me`, preferences | `users` | PARTIALLY CONNECTED | Not re-tested |
| Notifications | `/seller/notifications` | notifications page | `/api/v1/notifications`, `/:id/read` | `notifications` | PARTIALLY CONNECTED | Mark-read tested in earlier pass |

## 3. Buyer features

| Feature | Route | Component | Endpoint | Tables | Status | Note |
| --- | --- | --- | --- | --- | --- | --- |
| Buyer dashboard | `/buyer` | buyer page | `/api/v1/buyer/overview` | `saved_vehicles`, `inquiries` | PARTIALLY CONNECTED | Not re-tested |
| Explore marketplace | `/buyer/explore` | `VehicleCard.tsx` | `/api/v1/marketplace/listings` | `listings`, `vehicles` | **PASS** | Published vehicle appears |
| Search + filters | `/buyer/search` | `FilterPanel.tsx` | `/api/v1/marketplace/listings?q=` | `vehicles`, `listings` | **PASS** | Registration/VIN/TrustDrive ID + SQL-metachar safe |
| Vehicle detail + trust | `/vehicle/:id` | vehicle page | `/api/v1/vehicles/:id`, `/trust`, `/provider-checks` | `vehicles`, `findings` | **PASS** | Missing providers shown unavailable |
| 3D damage viewer | `/vehicle/:id`, `/inspection` | `VehicleViewer3D.tsx` | `/api/v1/vehicles/:id/3d-model`, `/components`, `/damage` | `damage_records` | **PASS** | Real GLB + DB hotspot |
| Inquiry thread | `/vehicle/:id`, `/buyer/inquiries` | contact block, thread | `/api/v1/inquiries` | `inquiries`, `inquiry_messages` | **PASS** | Buyer sees seller reply |
| PDF report | `/vehicle/:id` | PDF button | `/api/v1/reports/vehicle/:id`, `/download` | `reports` | **PASS** | 45 KB real PDF |
| Verification portal | `/buyer/verification` | lookup form | `/api/v1/verification/lookup`, `/verify/:token` | `vehicles`, `chain_records` | PARTIALLY CONNECTED | QR/VIN path tested earlier; not re-run |
| History timeline | `/buyer/history` | history page | `/api/v1/vehicles/:id/history` | `history_events` | PARTIALLY CONNECTED | Not re-tested |
| Saved / compare | `/buyer/saved`, `/buyer/compare` | saved/compare pages | `/api/v1/saved`, `/api/v1/compare` | `saved_vehicles`, `saved_comparisons` | PARTIALLY CONNECTED | Not re-tested |
| Buyer settings / notifications | `/buyer/settings`, `/buyer/notifications` | settings pages | `/api/v1/me`, `/notifications` | `users`, `notifications` | PARTIALLY CONNECTED | Not re-tested |

## 4. Cross-cutting integrations

| Integration | Endpoint / module | Status | Evidence |
| --- | --- | --- | --- |
| Server-side RBAC | `lib/server/http.ts` `requireRole` | **PASS** | Security 13/13 |
| Ownership + consent gates | `documents` routes, `inquiries/[id]` | **PASS** | 403 for other seller/admin-only raw bytes; buyer sees consented metadata |
| Shared database | `TD_DB_FILE` both runtimes | **PASS** | `/health` `shared_with_nextjs: true`, 55 tables |
| OCR bridge | `lib/server/document-ocr.ts` | **PASS** | 11/11 positive, 10/10 negative |
| LangGraph agent | `backend/app/agent.py` | **PASS** | `/health` `orchestrator=langgraph`, checkpointing true |
| Deterministic trust score | `lib/server/engine.ts` | **PASS** | additive rules; no LLM input |
| PDF generation | `lib/server/pdf.ts` | **PASS** | `%PDF` magic, `reports` row |
| Three.js GLB | `VehicleViewer3D.tsx` | **PASS** | real 11.8 MB GLB, DB hotspot |
| Government / insurer / theft registry | `provider_checks` | MISSING EXTERNAL CONFIGURATION | no credentials; demo source ignored |
| Blockchain anchoring | none | MISSING EXTERNAL CONFIGURATION | not claimed; SHA-256 = integrity only |
| YOLO photo damage model | `models/` | MISSING EXTERNAL CONFIGURATION | weights not wired to upload path; damage is human-entered |
| S3 / external AV | `files.ts`, `scan.ts` | MISSING EXTERNAL CONFIGURATION | local disk + local signature scan |
| PostgreSQL deployment | `db.ts` | BLOCKED | `node:sqlite` is the system of record; migration not done |
| PaddleOCR | `backend` | MISSING EXTERNAL CONFIGURATION | not installed; RapidOCR is active and labelled |

## 5. Test runs referenced

| Run | Command | Result | Artefact |
| --- | --- | --- | --- |
| Six-feature live proof | `TD_BASE_URL=http://127.0.0.1:3100 node qa/live-browser/prove_six.mjs` | 6/6 PASS (49 checks) | `qa/live-browser/six_features_results.json`, `shots-six/*.png` |
| OCR negative paths | `node qa/live-browser/ocr_negative.mjs` | 10/10 PASS | `qa/live-browser/ocr_negative_results.json` |
| Security / RBAC | `node qa/live-browser/security.mjs` | 13/13 PASS | `qa/live-browser/security_results.json` |
| Evidence snapshot | `node qa/live-browser/collect_evidence.mjs` | generated | `qa/live-browser/evidence_summary.json` |
