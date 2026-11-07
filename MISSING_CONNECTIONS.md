# Missing Connections — TrustDrive

Date: **2026-11-06**. This file lists only what is still **not** genuinely
connected. Everything else is proven in `FEATURE_INTEGRATION_MATRIX.md` and the
live artefacts under `qa/live-browser/`.

## Closed in this pass

| Was missing | Fix | Proof |
| --- | --- | --- |
| Upload → OCR → DB → UI | `frontend/lib/server/document-ocr.ts` calls Python synchronously, persists `documents.extracted` + `document_extractions`, surfaces engine/method/confidence/flags | 11/11 positive, 10/10 negative |
| AI investigation used only the Next fallback | Next route calls the Python agent first, persists `ai_runs`, returns orchestrator/nodes/human review; labelled fallback only on failure | 9/9, `orchestrator=langgraph`, 15 nodes |
| Demo theft row counted as a clean check | `theftAssessment` ignores demo sources; missing evidence is `pending`/`unavailable` | `lib/server/data.ts`, `lib/server/ai.ts` |
| Marketplace search ignored registration/VIN/TrustDrive ID | `getMarketplace` matches all three | live search `q=MH12QA7132` → 1 item |
| Document listing had no consent/ownership gate | Buyer sees consented docs of published listing; other seller 403; raw bytes owner/admin only | Security 13/13 |
| Duplicate RC re-upload re-verified silently | Python duplicate detection → `needs_correction` + `duplicate_of` | OCR negative 10/10 |
| Vehicle page type error | removed invalid `Icon style` prop | `tsc --noEmit` |

## Still not connected (honest status)

| # | Capability | Status | What actually happens | What is required |
| --- | --- | --- | --- | --- |
| M1 | Government RC / VAHAN registry | **MISSING EXTERNAL CONFIGURATION** | `provider_checks` has no live row for new vehicles; UI shows “unavailable”, never “verified” | authorised API credentials + adapter + rate-limit/consent policy |
| M2 | Insurer / policy validation | **MISSING EXTERNAL CONFIGURATION** | insurance document OCR is real; policy validity is not checked against an insurer | insurer API or licensed data broker |
| M3 | Theft / stolen-vehicle registry | **MISSING EXTERNAL CONFIGURATION** | demo rows are ignored; new vehicles show `unavailable` | police/registry integration; never infer “clean” from absence |
| M4 | Blockchain anchoring | **MISSING EXTERNAL CONFIGURATION** | `chain_records` is an internal hash-chained audit ledger, **not** a public blockchain | chain node, wallet/key management, anchor contract, audit |
| M5 | YOLO damage-photo inference | **MISSING EXTERNAL CONFIGURATION** | damage records are human-entered with deterministic component anchors; no photo model output is claimed | wire weights, validate on labelled data, expose model version + confidence |
| M6 | XGBoost fraud probability | **PARTIALLY CONNECTED — DEMO DATA** | model loads and scores, but was trained on synthetic demo rows; UI/report must label it demo | licensed/labelled fraud corpus, retraining, calibration, drift monitoring |
| M7 | PaddleOCR | **MISSING EXTERNAL CONFIGURATION** | RapidOCR is the active engine and is named in every payload | install PaddleOCR + models if required; do not silently switch |
| M8 | Durable LangGraph checkpoints | **PARTIALLY CONNECTED** | graph runs and checkpoints **in memory**; a process restart loses checkpoints | Postgres/Redis checkpointer + retention policy |
| M9 | External anti-virus | **MISSING EXTERNAL CONFIGURATION** | local signature + heuristic scan (`local-signature-v1`) | ClamAV/VirusTotal adapter with quota |
| M10 | Object storage (S3/R2) | **MISSING EXTERNAL CONFIGURATION** | uploads live on local disk under `TD_UPLOAD_DIR` | bucket credentials, signed URLs, lifecycle rules |
| M11 | Email / SMS delivery | **MISSING EXTERNAL CONFIGURATION** | in-app notifications persist and mark read; no outbound provider is configured | SMTP/SES/Twilio credentials + templates + bounce handling |
| M12 | Postgres deployment | **BLOCKED** | Next uses `node:sqlite`; FastAPI reads the same file. A split deploy cannot share a disk | Next data-layer migration to Postgres (schema exists conceptually, not implemented) |
| M13 | Payments / escrow | **NOT IN SCOPE** | inquiries and offers are messages; no payment is taken | payment provider, KYC, escrow design, legal review |
| M14 | Real-time chat transport | **PARTIALLY CONNECTED** | messages persist; the thread refreshes by polling/refetch, not WebSocket/SSE | event stream or WebSocket gateway if real-time is required |
| M15 | LLM-as-decider | **DELIBERATELY ABSENT** | local Qwen adapter can summarise only with supplied facts; it never sets the trust score or certifies a record | this must stay absent by product rule (AGENTS.md §2) |

## Verification rules that remain in force

1. Missing provider data is **unverified coverage**, not proof of fraud.
2. A matching SHA-256 proves file integrity, **not** document authenticity.
3. `verified` on a document means automated extraction checks passed; it is not
   a government or insurer confirmation.
4. An AI finding always carries evidence IDs, method and model/rule version; a
   missing LLM yields **no conclusion**, not a guess.
5. No screen may render a provider, chain or model result that did not actually
   run.
