# TrustDrive — AI/ML Integration Report

**Date:** 2026-11-07 · **Result: PASS for deterministic AI/ML paths; production ML and LLM narrative BLOCKED.**
**Stack:** Python FastAPI (`:8000`) + LangGraph + RapidOCR + deterministic rules + local adapters; Next.js persists results to the shared SQLite DB.

## 1. Active AI/ML components

| Component | State | Honest label |
|---|---|---|
| Rules/findings engine | Active | deterministic, versioned; no LLM sets the score |
| Trust score | Active | `trust-v2-multicategory`, additive deterministic weights |
| LangGraph investigator | Active | `investigator-2.0.0-multicategory`, 15/16 conditional nodes |
| RapidOCR | Active | `rapidocr-onnx-crnn` |
| Retrieval | Active | keyword-overlap over relational evidence; embeddings not required |
| YOLO damage adapter | Weights present (`car_damage.pt`), adapter reports ready | not exercised as an end-to-end photo→damage flow; UI damage is human-entered |
| XGBoost mileage model | Present, `training.dataset_label="synthetic-demo"` | demo; must not be presented as production fraud detection |
| LLM narrative | Inactive (`TD_LLM_PROVIDER=none`) | no conclusion is generated |
| Blockchain | Not configured | local SHA-256 only; no on-chain claim |

## 2. What was tested live

| Test | Observed | Result |
|---|---|---|
| AI investigation from Seller UI | 200, `source=python-intelligence` | PASS |
| Orchestrator | `langgraph` | PASS |
| Conditional nodes | 15 combustion / 16 EV | PASS |
| `EVBatteryAnalysisNode` | only EV profiles | PASS |
| Findings/citations | 2 findings / 6 citations; persisted | PASS |
| Human review | `required:true`, review id/policy returned | PASS |
| Persistence | `ai_runs.graph=langgraph-conditional`, model/rule versions stored | PASS |
| Fallback | only on Python failure, labelled `next-deterministic-fallback` | PASS |
| Mileage rollback rule | 52,000 → 41,000 km flagged, 40 points | PASS |
| Trust score | deterministic score/coverage/open findings rendered | PASS |
| OCR | real RapidOCR extraction and failure states | PASS |

## 3. XGBoost / YOLO honesty

- `/health` reports the XGBoost model as available but its own training block says `synthetic-demo`, 600 rows, precision/recall/F1 1.0 on a hold-out split, with the warning “validate on a larger, real corpus before production.” It must be treated as a demo adapter, not production fraud detection.
- `/health` reports the YOLO damage adapter and `car_damage.pt` ready, but the tested upload path stores human-entered damage records and 3D hotspots. No claim is made that a photo was classified by YOLO.
- No labelled real fraud corpus exists; no supervised production classifier was validated.

## 4. Safety and evidence rules

1. Missing data is `unavailable`/`pending`, never a clean verification.
2. The trust score is never set by an LLM.
3. Every finding carries an evidence reference, rule version and status.
4. Human review is required for high-impact unresolved findings; no automated decision is final.
5. When the LLM is disabled, the response says so and the deterministic explanation is used.

## 5. Verdict

- **Deterministic AI/ML pipeline: PASS.**
- **LangGraph investigation: PASS** (details in `LANGGRAPH_INTEGRATION_REPORT.md`).
- **OCR: PASS** (details in `AI_OCR_VERIFICATION_REPORT.md`).
- **Production XGBoost / YOLO end-to-end / LLM narrative: BLOCKED.**
