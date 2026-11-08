# TrustDrive — AI / OCR Verification Report

**Date:** 2026-11-07 · **Result: PASS for the active local pipeline; external authenticity/providers BLOCKED**
**Active OCR:** RapidOCR (`rapidocr-onnx-crnn`); PyMuPDF text-layer extraction; OpenCV preprocessing
**Active agent:** LangGraph `investigator-2.0.0-multicategory`, conditional 15-node (combustion) / 16-node (EV) graph
**LLM:** `TD_LLM_PROVIDER=none` — no narrative LLM is claimed; findings and trust remain deterministic
**Shared DB:** `.data/trustdrive.db`, 55 tables, schema v3

## 1. OCR positive path — 6 categories, 6/6 PASS

| Category | RC type | Engine / method | Confidence | Extraction rows | Document status |
|---|---|---|---:|---:|---|
| `petrol_motorcycle` | `rc_2w` | RapidOCR | 0.786 | 9 | `verified` |
| `petrol_scooter` | `rc_2w` | RapidOCR | 0.785 | 9 | `verified` |
| `electric_scooter` | `rc_2w` | RapidOCR | 0.779 | 9 | `verified` |
| `electric_motorcycle` | `rc_2w` | RapidOCR | 0.787 | 9 | `verified` |
| `passenger_car` | `rc` | RapidOCR | 0.778 | 8 | `verified` |
| `electric_car` | `rc` | RapidOCR | 0.776 | 8 | `verified` |

Focused car proof (`MW5ATBQ1`, `doc-1793989171647`):

- Upload → HTTP 201; SHA-256 `034295a54b…beef`.
- OCR status `processed`; engine `rapidocr`; method `rapidocr-onnx-crnn`; `isOcr: true`; confidence `0.778`; flags `[]`.
- Extracted registration `MH12QA7132` matched the vehicle; VIN `MAT3989149185KLJS` matched the vehicle.
- 8 `document_extractions` rows persisted; `documents.status=verified`; `verified_at` set.
- UI after refresh showed engine `rapidocr` and registration `MH12QA7132` (`SCREENSHOTS/feat1-rc-ocr.png`).

The extraction is **machine-read text, not proof of authenticity**. Every extraction carries:

> “Extracted values are machine-read text, not proof that the document is genuine. OCR extraction is not verification of authenticity.”

For two-wheelers the compared identity field is the chassis/frame number; for cars it is the 17-character VIN. The OCR field map is category-aware and was verified on all six categories.

## 2. OCR negative paths — 10/10 PASS

`node qa/live-browser/ocr_negative.mjs` · evidence `qa/live-browser/ocr_negative_results.json`, `SCREENSHOTS/ocr-negative.png`

| Case | Expected honest outcome | Observed | Result |
|---|---|---|---|
| Unsupported text file | rejected, no document row | HTTP 415; no row | PASS |
| Corrupt PDF | `needs_correction`, no fake extraction | `needs_correction` with reason | PASS |
| Blank image | low confidence / `needs_correction` | low-confidence `needs_correction` | PASS |
| Clean RC | real OCR, auto-verified | RapidOCR, `verified` | PASS |
| Duplicate of existing document | duplicate flagged, not verified clean | `needs_correction`, `duplicate_of` set | PASS |

No failure was converted into a success. When the Python service is unavailable, the Next upload route keeps the document `pending` and stores an honest `status_reason` instead of fabricating an extraction.

## 3. AI investigation — LangGraph, 6/6 categories

| Assertion | Observed | Result |
|---|---|---|
| Python agent actually answers | `source: "python-intelligence"` | PASS |
| Orchestrator reported honestly | `orchestrator: "langgraph"` | PASS |
| Conditional graph size | 15 nodes combustion / 16 nodes EV | PASS |
| EV-only node | `EVBatteryAnalysisNode` only in EV runs | PASS |
| Findings and citations | 2 findings / 6 citations in focused run; findings persisted | PASS |
| Human review | `required: true`, review id + policy returned | PASS |
| Run persisted | `ai_runs.graph="langgraph-conditional"`, model `investigator-2.0.0-multicategory`, rules `fraud-rules-2.0.0-multicategory` | PASS |
| UI timeline | rendered executed nodes (`15/15`) and orchestrator badge | PASS |
| Honest fallback | only when Python call fails, labelled `next-deterministic-fallback` / `deterministic-next` | PASS |

The deterministic trust score remains additive and versioned; no LLM sets it. Missing records remain `unavailable`/`pending` and are never converted into a clean verification or a fraud finding.

## 4. Engine inventory at final verification

| Engine | State | Honest label |
|---|---|---|
| RapidOCR | available | active OCR engine |
| PyMuPDF text layer | available | digital-PDF text extraction |
| OpenCV preprocessing | available | image preprocessing |
| PaddleOCR | unavailable | `paddleocr=false` in `/health`; not claimed |
| LangGraph | available (0.4.10 in `backend/.venv`) | `orchestrator=langgraph` |
| Local Qwen LLM | not active in final runtime (`TD_LLM_PROVIDER=none`) | no LLM narrative claimed |
| YOLO damage model | not wired | manual damage records only |
| XGBoost fraud model | synthetic demo training | demo-labelled, not production |
| Durable checkpoint store | not configured | in-memory checkpointing |

## 5. Verdict

- **OCR extraction: PASS** on all six categories, with genuine RapidOCR output, confidence, flags, duplicate detection and DB persistence.
- **OCR negative handling: PASS** — invalid/corrupt/blank/duplicate inputs fail honestly.
- **AI investigation: PASS** — real LangGraph execution, evidence citations, human review and persisted runs.
- **LLM narrative: BLOCKED** — no provider configured; deterministic evidence-only output is used.
- **External document authenticity / government verification: BLOCKED** — no authorised registry integration exists.
