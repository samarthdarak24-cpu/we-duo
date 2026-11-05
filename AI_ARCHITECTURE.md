# AI Architecture

All AI runs **inside the FastAPI service** (`services/intelligence`). There are
no separate microservices; the modules share one database and one process.

## Capability matrix (actual)

| Capability | Engine | Default state | Weights / deps |
| --- | --- | --- | --- |
| Image OCR | PaddleOCR 3.7 (oneDNN off) → RapidOCR 1.2 fallback | active | auto-downloaded / ONNX |
| PDF text | PyMuPDF | active | — |
| Damage CV | YOLO11m (MIT) | active when `ultralytics` + weights | `models/car_damage.pt` |
| Anomaly ML | rules + Isolation Forest + LOF + XGBoost | active | `models/mileage_xgb.json` (synthetic demo) |
| Retrieval | sentence-transformers `all-MiniLM-L6-v2` | active when installed | ~90 MB |
| Agent | LangGraph, 12 nodes | active | `langgraph` |
| LLM | Qwen2.5-0.5B / SmolLM2-360M (local) | opt-in (`TD_LLM_PROVIDER=local`) | torch + transformers |
| LLM (hosted) | OpenAI-compatible | opt-in | API key |
| Blockchain | local SHA-256 chain | active (integrity only) | none |

Every adapter reports `available:false` with a reason when its dependency is
missing; nothing is reported as active unless it can run.

## Document pipeline

1. Validate type/size; magic-byte sniff.
2. Local malware scan (`local-signature-v1`) or external AV.
3. Store privately; compute SHA-256; create `documents` row.
4. OCR / text layer → field extraction (RC, insurance, PUC, service).
5. Deterministic checks: VIN/reg match, expiry, duplicate, near-duplicate,
   tampering (hash/chain), required fields.
6. Persist fields, confidence, flags, `document_extractions`, findings.
7. Queue verification / human review when confidence is low.

## Detectors

- **Mileage**: ordered readings, rollback, implausible jumps, cross-modal
  (service invoice vs odometer), claimed-vs-verified.
- **Documents**: VIN mismatch, expired insurance/PUC, duplicate hash,
  near-duplicate text, missing required record.
- **Risk**: additive trust score (never a black box), coverage, unverified areas.

## 12-node investigator

`resolve_vehicle → retrieve_records → analyze_documents → analyze_mileage →
analyze_damage → correlate_evidence → detect_conflicts → score_trust → explain →
human_review → persist → summarize`

- Persists runs in `ai_runs` / `agent_investigations`.
- Returns citations (evidence IDs); hidden evidence is excluded.
- A finding is cleared only by an admin review or a deterministic re-check.

## LLM guardrails

The LLM never sets the trust score. Four gates run before any text is shown:

1. **Policy** — rejects “safe to buy”, “genuine”, “accident-free”, “no fraud”,
   “vehicle has been verified”, “verified by TrustDrive”.
2. **Coherence** — rejects fragments/JSON garbage.
3. **Contradiction** — rejects “no mileage decrease” when findings exist.
4. **Citation** — opt-in inline IDs; the chat API attaches citations structurally.

On rejection the deterministic, source-cited answer is returned with
`llm_rejected: true`. `scripts/eval_llm.py` covers 10 cases (10/10 pass: 2 LLM
narratives, 8 deterministic fallbacks).

## Models and provenance

- `models/car_damage.pt` — YOLO11m, MIT, 40.5 MB, 6 classes.
- `models/mileage_xgb.json` — synthetic-demo; retrain on real labels.
- `models/MODEL_REGISTER.json` — source, licence, SHA-256, size.
- PaddleOCR `PP-OCRv6_medium_det/rec` — auto-downloaded, Apache-2.0, registered.

## Evaluation

| Test | Result |
| --- | --- |
| Pytest (`services/intelligence`) | 88 passed |
| LLM eval (`scripts/eval_llm.py`) | 10/10 |
| OCR | PaddleOCR 0.975 confidence on a rendered plate |
| YOLO | 6 detections on `data/yolo_sample.png` |
| Retrieval | top match 0.586 for odometer query |

## Deployment note

The Render image installs `requirements-render.txt` (no torch/paddle/ultralytics).
OCR falls back to RapidOCR, damage to OpenCV, retrieval to keyword, LLM to the
deterministic answer. To enable the heavy adapters, build the full
`requirements.txt` image (needs ≥ 2 GB RAM).
