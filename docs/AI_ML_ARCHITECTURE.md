# TrustDrive — AI / ML Architecture

## 1. Non-negotiable principles

1. **Rules before models.** Every finding starts as a deterministic, reproducible
   rule. ML only adds an exploratory signal.
2. **No LLM decides.** The LLM writes an explanation from supplied facts; it
   never sets the trust score, never marks a vehicle genuine/safe/stolen-free,
   and never invents a verification result.
3. **Evidence or silence.** Every finding carries `method`, `model_version`,
   `confidence`, `evidence` IDs and a recommended review action. Missing data is
   reported as `unverified`, never as a pass.
4. **Human-in-the-loop.** High-impact unresolved findings go to
   `human_review_queue` and require an authorised reviewer.

## 2. Document intelligence (18 steps)

`app/extract.py::process_document` records the real status of each step:

1 validate extension/MIME/size/magic → 2 store privately → 3 SHA-256 →
4 create job → 5 OCR → 6 extract fields → 7 normalise → 8 compare with vehicle →
9 duplicate detection → 10 date/expiry → 11 metadata signals → 12 confidence →
13 low-confidence flag → 14 manual review → 15 save evidence → 16 notify seller →
17 buyer-safe exposure → 18 persist + complete job.

**Engines (reported honestly):**

| Engine | Active when | Reports |
| --- | --- | --- |
| `paddleocr` | `paddleocr` + `paddlepaddle` installed | `is_ocr=true`, per-line confidence |
| `pymupdf-text-layer` | any PDF with a text layer | `is_ocr=false` (never called OCR) |
| `opencv-preprocess` | image without OCR backend | deskew/denoise/threshold signals, no text |

Extraction is regex + normalisation over the active engine's text; confidence is
a coverage/consistency heuristic, **not** a probability of authenticity.

## 3. Fraud detection

### Mileage (`app/detectors.py::mileage_findings`)
| Rule | Severity | Trigger |
| --- | --- | --- |
| `mileage_decrease` | high | reading < previous reading |
| `implausible_usage` | medium | > max(50,000 km/yr, 4× median) |
| `conflicting_readings` | high | two values on the same date |
| `duplicate_reading_different_dates` | low | same value on multiple dates |
| `statistical_outlier` | medium | Isolation Forest **or** LOF flags a point |

ML features: `(year, km, Δkm)`; contamination 0.15; requires ≥ 8 readings.
No supervised model is fitted because there is no labelled fraud corpus.

### Documents (`document_findings`)
Duplicate SHA-256, repeated invoice/policy numbers, VIN/registration mismatch,
extraction-flag mismatches, documents without a verification status.

### Damage (`damage_signals`)
OpenCV edge density + Laplacian focus + dimensions, plus SHA-256 image hashing
for duplicate photos. **No** severity claim from one photo; inspector validation
required. YOLO is an adapter slot, not active.

## 4. Trust score (`app/explain.py`)

Additive, deterministic, versioned `trust-v2-multicategory`:

```
score = 50 + Σ (weight × ratio)
document_coverage 12 · identity_consistency 10 · mileage_consistency 10
service_history 6 · inspection_evidence 6 · record_integrity 6
```

- `ratio = 0` when the evidence category is **absent** → unverified, not a pass.
- Identity gets 0.75 when VIN/registration exist with no mismatch finding.
- Negative evidence reduces the relevant ratio; unresolved anomalies are listed
  beside the score rather than double-penalised.
- Every contribution is returned with `factor, weight, ratio, points, evidence,
  status` — exact attribution, so SHAP is unnecessary.
- Snapshots persist to `trust_scores` with weights, factors, positive/negative/
  unverified JSON and `computed_at`.

## 5. 15/16-node conditional investigator (`app/agent.py`)

```
VehicleResolver → RecordRetrieval → DocumentAnalysis → MileageAnalysis →
DamageAnalysis → VerificationRules → AnomalyDetection → EvidenceCorrelation →
ConflictDetection → Explanation → HumanReview → ResultPersistence
```

- **Orchestration:** LangGraph + `MemorySaver` when installed; otherwise the same
  twelve node functions run sequentially and the payload reports
  `orchestrator: "sequential-fallback"`.
- **State:** vehicle id, question, thread id, retrieved records, findings,
  evidence/sources, conflicts, missing records, explanation, review state.
- **Guardrails:** facts are permission-filtered DB reads; the LLM output is
  validated against supplied numbers/IDs (`validate_grounding`) and rejected if
  it introduces unsupported claims; no tool mutates verified history, price or
  roles; every investigation is persisted and audited.
- **Human review:** high-severity conflicts create a `human_review_queue` row
  and the investigation status becomes `awaiting_review`.
- **Host note:** `langgraph 1.2.20` is active on this host with a `MemorySaver`
  checkpointer (`orchestrator: "langgraph"`, `checkpointing: true`). During one
  install window the host's Application Control policy briefly blocked
  `_uuid_utils` (`DLL load failed`); `build_graph()` captures any such load error
  and falls back to the sequential executor, reporting `agent.error` with the
  exact cause instead of crashing.

## 6. Evaluation

| What | How | Result |
| --- | --- | --- |
| Mileage rules | seeded rollback (58,000 → 25,000 km) | detected, high severity, both readings cited |
| Duplicate docs | two documents with identical SHA-256 | detected |
| Trust score | seeded vehicle with mixed evidence | 86/100, 6 contributions, 1 unverified area |
| 18-step pipeline | generated PDF with reg/VIN/odometer | 18 steps, reg + 72,450 km, confidence 0.83 |
| Grounding | LLM validator with fabricated numbers | rejected |
| Agent | seeded vehicle | 15/16 conditional nodes, `awaiting_review`, evidence IDs returned |
| Grounded chat | `scripts/eval_llm.py`, 10 cases | **10/10 passed**; 2 LLM narratives, 8 deterministic fallbacks; no forbidden safety claim |

**Not evaluated:** supervised fraud precision/recall (no labelled corpus), YOLO
damage mAP (no weights), LLM answer quality (no provider configured).

## 7. Known limitations

- OCR confidence is not calibrated; low confidence routes to review, not trust.
- Isolation Forest/LOF are exploratory; they never assert fraud.
- Document metadata checks are signals only, never proof of forgery.
- Damage detection cannot establish hidden structural damage from one photo.
- The LLM adapter is offline by default and returns **no conclusion**.

## 7b. Grounded chat endpoint

`POST /api/intelligence/chat` is the model behind the in-app assistant
(`/api/v1/ai/assistant` proxies to it, then falls back to the deterministic
answer if the service is down).

1. Builds facts from the shared DB: vehicle, trust score, documents, findings,
   mileage readings, missing records, source IDs.
2. Calls the configured LLM with those facts plus a deterministic draft.
3. Applies four gates before returning `answer`:
   **policy** (no safety/authenticity judgement), **coherence**, **contradiction**
   (no denial of a recorded finding), **citation** (opt-in inline IDs).
4. On rejection or no provider, returns a deterministic, source-cited narrative
   with `provider: "deterministic"` and `llm_rejected: true`.

The response always includes `citations`, `provider`, `model`, `grounded` and
the deterministic answer. The LLM never sets the trust score.

## 8. Adapter files and activation

| Capability | File | Activates when | Inactive behaviour |
| --- | --- | --- | --- |
| RapidOCR (images) | `app/ocr.py::RapidOcrBackend` | `rapidocr-onnxruntime` installed | PDF text layer / OpenCV path, engine named |
| PaddleOCR | `app/ocr.py::PaddleOcrBackend` | `paddleocr` importable | RapidOCR / PDF text / OpenCV |
| Mileage XGBoost | `app/intelligence/mileage/xgboost_adapter.py` | `xgboost` + `models/mileage_xgb.json` | deterministic rules only |
| Damage YOLO (ONNX) | `app/intelligence/damage/yolo.py` | `models/car_damage.onnx` + onnxruntime | OpenCV signals, `available:false` |
| Damage YOLO (Ultralytics) | same | `models/car_damage.pt` + `ultralytics` | **active** (MIT weights) |
| Retrieval embeddings | `app/intelligence/retrieval/embeddings.py` | `sentence-transformers` (+ optional pgvector) | keyword-overlap backend |
| LangGraph | `app/agent.py::build_graph` | package importable | sequential 15/16-node conditional executor |
| LLM (local) | `app/llm.py` | `TD_LLM_PROVIDER=local` + torch/transformers | deterministic evidence-only answer |
| LLM (HTTP) | same | `TD_LLM_*` configured | deterministic evidence-only answer |
| Vehicle registry | `app/integrations/vehicle_data/` | authorised provider configured | demo provider, `demo:true` |
| Insurance | `app/integrations/insurance/` | authorised provider configured | demo provider, `status:"unknown"` |
| Storage | `app/integrations/storage/` | `TD_S3_*` + boto3 | local private filesystem |

`GET /health` exposes `intelligence: {damage, xgboost, retrieval}` and
`integrations: {vehicle_data, insurance, storage}` with `available` + reason.

Governed downloads: `scripts/fetch_models.py` (licence required, SHA-256
recorded, 800 MB cap). Training: `scripts/train_mileage_xgb.py`. Full research
notes: `docs/MODEL_ASSETS.md`; licences: `ASSET_REGISTER.md`.
