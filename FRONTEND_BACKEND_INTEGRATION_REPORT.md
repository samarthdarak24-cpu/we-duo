# TrustDrive — Frontend ↔ Backend Integration Report

**Date:** 2026-11-07 · **Verdict: PASS for all exercised core chains; external providers remain BLOCKED.**

This report traces the actual request path for each feature:

```text
UI action → client handler → Next.js API route → server service/business rule
→ SQLite write/read (and/or FastAPI call) → API response → React state/SSR refresh → visible UI
```

## 1. Integration matrix

| Feature | UI trigger | Client handler | API endpoint | Server service | DB / external | Visible result | Status |
|---|---|---|---|---|---|---|---|
| Seller login | Login form submit | `login/page` form | `POST /api/v1/auth/login` | `lib/server/auth.ts` | `users`, `sessions` | Redirect `/seller` | PASS |
| Buyer login | Login form submit | same form | same | same, buyer role check | `sessions` | Redirect `/buyer` | PASS |
| Add vehicle | Wizard “Create draft” | `AddVehicleStepper.tsx` | `POST /api/v1/seller/vehicles` | `createVehicleDraft()` | `vehicles`, `listings` | Vehicle in My Vehicles, survives refresh | PASS |
| Edit vehicle | Save details | `VehicleManager` / editor | `PATCH /api/v1/seller/vehicles/:id` | ownership + validation | `vehicles` | Updated values after reload | PASS |
| Upload RC + OCR | File picker + Upload | `DocumentsManager.tsx` | `POST /api/v1/vehicles/:id/documents` | `document-ocr.ts` → FastAPI `/documents/process` | `documents`, `document_extractions`, `audit_logs` | Engine, confidence, fields visible | PASS |
| Replace/reverify document | New version / Re-verify | `DocumentsManager` | `/documents/:id/replace`, `/reverify` | OCR bridge | immutable document history | New version/status visible | PASS (suite) |
| Consent document | Share checkbox | `DocumentsManager` | `/documents/:id/consent` | ownership + published-listing gate | `documents.consent` | Buyer sees only consented docs | PASS |
| Mileage rollback | Add reading | `HistoryManager.tsx` | `POST /vehicles/:id/mileage` | `engine.ts` rollback rule | `mileage_readings`, `findings` | “Odometer rollback detected” | PASS |
| AI investigation | Run investigation | `InvestigationPanel.tsx` | `POST /vehicles/:id/ai-investigations` | `intelligence.ts` → LangGraph agent | `ai_runs`, `findings`, `evidence_nodes` | Node timeline, findings, citations, human review | PASS |
| Damage record | Add damage | `DamageEditor.tsx` | `POST /vehicles/:id/damage` | component registry + audit | `damage_records` | Damage row and 3D hotspot | PASS |
| Publish listing | Publish button | listing editor | `POST /seller/listings/:id/publish` | `publishGate()` | `listings`, `listing_images`, `documents` | Published badge; buyer-visible | PASS |
| Marketplace search | Search box | `FilterPanel.tsx` | `GET /marketplace/listings?q=` | `getMarketplace()` | `vehicles` + `listings` | Matching card; registration/VIN/TrustDrive ID all searchable | PASS |
| 3D viewer | Open vehicle page | `VehicleViewer3D.tsx` | `GET /vehicles/:id/3d-model`, `/components`, `/damage` | asset manifest + DB hotspots | `damage_records` | GLB for car; labelled schematic for 2W; hotspot opens damage | PASS |
| Buyer inquiry | Contact seller | `ContactSeller` block | `POST /inquiries` | ownership/listing checks | `inquiries`, `inquiry_messages` | Seller inbox shows inquiry | PASS |
| Seller reply | Reply box | `Inbox.tsx` | `POST /inquiries/:id/messages` | participant check | `inquiry_messages` | Buyer thread shows 2 messages | PASS |
| PDF report | Download report | report button | `POST /reports/vehicle/:id`, `GET /reports/:id/download` | `pdf.ts` | `reports` | Real `%PDF` download | PASS |
| Verification lookup | Verify form | verification page | `GET /verification/lookup`, `/verify/:token` | token/vehicle lookup | `vehicles`, `qr_tokens` | Report/verify page | PASS (suite) |
| Notifications | Bell/read | notification page | `/notifications`, `/:id/read` | notification service | `notifications` | Read state persists | PASS (suite) |
| Saved/compare | Save/compare buttons | buyer components | `/saved`, `/compare` | user-scoped service | `saved_vehicles`, `saved_comparisons` | Saved list/comparison | PASS (suite) |

## 2. Proof chains (focused run `MW5ATBQ1`)

### RC upload + OCR — 11/11 checks
`DocumentsManager` file input → multipart `POST /documents` → Next stores file, computes SHA-256 → FastAPI RapidOCR → 8 fields → `documents.status=verified` → UI shows `rapidocr` / `rapidocr-onnx-crnn` / `0.778` / `MH12QA7132`. SQL read-back confirmed the document and extraction rows.

### Mileage — 6/6 checks
`POST /mileage` accepted 52,000 km then 41,000 km. The rules engine returned `{ok:true, flagged:true}`, persisted `ODOMETER_ROLLBACK` with 40 penalty points, and the seller UI rendered the finding.

### AI investigation — 9/9 checks
`POST /ai-investigations` returned `source=python-intelligence`, `orchestrator=langgraph`, 15 executed nodes, 2 findings / 6 citations and a human-review requirement. `ai_runs.graph=langgraph-conditional` and the UI timeline both showed 15 nodes.

### Damage + marketplace + 3D — 13/13 checks
Damage `d-1793989213056` was stored at `front_bumper`; listing `l-1793989218038` was published with 3 photos; search by `MH12QA7132` found it; the buyer page rendered the 3D hotspot; clicking the hotspot opened the matching damage text.

### Buyer inquiry + reply + PDF — 10/10 checks
Inquiry `q-1793989445140` was stored, the seller replied, the buyer thread showed 2 messages, and report `rep-1793989494948` downloaded as a 45,266-byte real PDF with `reports.status=ready`.

## 3. Cross-cutting integration facts

- **One database:** `/health` reports `shared_with_nextjs: true`, 55 tables; Next and FastAPI read the same `.data/trustdrive.db`.
- **Server-side RBAC:** all tested protected routes returned 401 (anonymous) or 403 (wrong role/owner). The browser redirect is not the only control.
- **Consent gate:** buyer sees only consented document metadata on a published listing; 0 unconsented documents were exposed; raw bytes are owner/admin only.
- **Honest fallbacks:** Python failure → Next deterministic review labelled `next-deterministic-fallback`; OCR unavailable → document stays `pending` with a real reason; demo theft source → `unavailable`, never `verified`.
- **No inert buttons:** every action exercised in the six-feature and broad runs produced a real API call and a database write.

## 4. Unconnected / blocked integrations

| Integration | Status | Evidence |
|---|---|---|
| Government/VAHAN registry | BLOCKED | no credentials; provider panel says unavailable |
| Insurer / theft registry | BLOCKED | demo rows ignored; `provider_checks=0` |
| Blockchain anchoring | BLOCKED | no on-chain adapter; local SHA-256 chain only |
| YOLO photo damage | BLOCKED | weights not wired; damage is human-entered |
| Production XGBoost | BLOCKED | synthetic demo training |
| LLM narrative | BLOCKED | provider `none`; deterministic evidence-only text |
| S3 / email / SMS / Postgres | BLOCKED | local disk / in-app / SQLite only |

**Conclusion:** the implemented seller and buyer workflows are genuinely connected end to end. The remaining gaps are external dependencies or deliberately unimplemented categories, not hidden mock endpoints.
