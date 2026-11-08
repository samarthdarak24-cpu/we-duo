# TrustDrive — Model Assets

> What is actually installed, what is an adapter, and why no model weights are
> bundled. Every adapter reports `available` and its active engine at runtime.

## 1. Activation matrix

| Capability | Code | Runtime present | Weights present | Active now |
| --- | --- | --- | --- | --- |
| OCR (PDF text) | `app/ocr.py::PdfTextBackend` | PyMuPDF ✅ | n/a | ✅ |
| OCR (image, real) | `app/ocr.py::RapidOcrBackend` | rapidocr-onnxruntime 1.2.3 ✅ | bundled ONNX | ✅ |
| OCR (image preprocess) | `app/ocr.py::OpenCVPreprocessBackend` | OpenCV ✅ | n/a | ✅ |
| OCR (PaddleOCR) | `app/ocr.py::PaddleOcrBackend` | paddleocr 3.7.0 ✅ (oneDNN disabled) | auto-downloaded | ✅ active |
| Mileage rules | `app/detectors.py` | stdlib ✅ | n/a | ✅ |
| Mileage ML (IForest/LOF) | `app/detectors.py` | scikit-learn ✅ | n/a | ✅ |
| Mileage XGBoost | `app/intelligence/mileage/xgboost_adapter.py` | xgboost 3.4.1 ✅ | `models/mileage_xgb.json` (synthetic-demo) | ✅ demo (not used by findings) |
| Damage CV (OpenCV) | `app/detectors.py::damage_signals` | OpenCV ✅ | n/a | ✅ |
| Damage YOLO (ONNX) | `app/intelligence/damage/yolo.py` | onnxruntime ✅ | `models/car_damage.onnx` absent | ⚙️ optional alternative |
| Damage YOLO (Ultralytics) | same | ultralytics 8.4.202 ✅ | `models/car_damage.pt` ✅ (40.5 MB, MIT) | ✅ active |
| Agent (LangGraph) | `app/agent.py` | langgraph 1.2.20 ✅ + MemorySaver | n/a | ✅ (sequential fallback retained) |
| LLM (local) | `app/llm.py` | torch 2.15 + transformers 5.22 ✅ | SmolLM2-360M-Instruct ✅ | ✅ demo, guardrailed |
| LLM (HTTP) | same | any OpenAI-compatible endpoint | n/a | ⚙️ configure `TD_LLM_*` |
| Retrieval (embeddings) | `app/intelligence/retrieval/embeddings.py` | sentence-transformers 6.2.0 ✅ | all-MiniLM-L6-v2 | ✅ active |
| Trust score | `app/explain.py` | stdlib ✅ | n/a | ✅ |

**PaddleOCR CPU note:** PaddleOCR 3.7 crashes in the oneDNN instruction path on
some CPUs (`ConvertPirAttribute2RuntimeAttribute not support`). The workaround
actually used in code is `FLAGS_use_mkldnn=0` + `FLAGS_use_onednn=0` in
`app/ocr.py` and `enable_mkldnn=False` in the `PaddleOCR(...)` constructor
(there is no `FLAGS_use_onnx` flag in Paddle 3.x — the earlier note used that
name loosely). On this host the plate fixture `data/paddle_test.png` reads as
`MHO1AB1234` at **0.975** confidence via `paddleocr-v3-predict`.

The automated regression is
`test_models.py::test_paddleocr_backend_reads_rendered_text` (asserts the flags,
`engine=paddleocr`, method, plate text, confidence and SHA-256). The
auto-downloaded weights (`PP-OCRv6_medium_det/rec`, Apache-2.0, ~134 MB in
`~/.paddlex/official_models`) are recorded with size + SHA-256 in
`models/MODEL_REGISTER.json` → `auto_downloaded` and are **not** committed.

**Cross-host re-verification (still open).** One CPU host has been verified
(Windows 11, AMD64 Family 25 Model 80, paddleocr 3.7.0 / paddle 3.3.1 —
`data/paddleocr_host_check.json`). On any other host run:

```bash
python scripts/verify_paddleocr.py --fixture data/paddle_test.png
python scripts/verify_paddleocr.py --fixture data/paddle_test.png --json \
  > data/paddleocr_host_check_<host>.json
```

It prints the CPU, library versions, active flags, engine/method, decoded text
and confidence, and exits non-zero if real OCR did not run. Attach the JSON to
the register entry before removing the workaround. If a future Paddle build
fixes the oneDNN path, drop the flags only after that second host passes.

## 2. Hugging Face research (2026-11-05)

Searched the HF API for car/vehicle damage models. Findings:

| Repo | Real weights? | Licence | Usable here |
| --- | --- | --- | --- |
| `ReverendBayes/YOLO11m-Car-Damage-Detector` | **Yes** — `trained.pt` 40.5 MB (LFS) | **MIT** | ✅ **bundled** |
| `Mariofm02/YOLOv8m_Car_Parts_Damaged` | **No** — repo contains only `.gitattributes` | none | ❌ |
| `AdamGie/CV_damaged_car_detection` | Yes — `model_custom_VGG16_2_classes.hdf5` (214 MB) | `unlicense` | ❌ Keras classifier, needs TensorFlow, no ONNX |
| `gg-insoore/detr-finetuned-cardamage-v2` | Yes — DETR | none listed | ❌ needs torch/transformers |
| `tumul31/rtdetr-v2-r50-cardamage-40ep` | Yes — RT-DETR | none listed | ❌ needs torch |
| `Densus100/Car_Damage_Segmentation` | **No** — README only | `other` | ❌ |

**Decision:** one **MIT-licensed** model is bundled: YOLO11m from
`ReverendBayes/YOLO11m-Car-Damage-Detector`, fine-tuned on CarDD_COCO for six
classes (dent, scratch, crack, shattered_glass, broken_lamp, flat_tire). Verified
inference on a sample returns 6 detections (dent 0.94, scratch 0.87, …). It is
assistive: every detection requires inspector validation and never establishes
severity. The ONNX adapter remains as an alternative when a `.onnx` is supplied.

## 3. Fetching a model (governed)

```bash
python scripts/fetch_models.py --list

# Hugging Face
python scripts/fetch_models.py --hf <owner/repo> --file car_damage.onnx \
  --name car_damage.onnx --license "Apache-2.0" --purpose "damage detection"

# Direct URL with integrity check
python scripts/fetch_models.py --url https://.../car_damage.onnx \
  --name car_damage.onnx --license "MIT" --sha256 <64-hex>
```

The script **refuses** to download without `--license`, caps size at 800 MB,
records size + SHA-256 + source + timestamp in `models/MODEL_REGISTER.json`, and
deletes the file on a hash mismatch.

Optional class names: `models/car_damage_classes.json` (array of strings). If
absent, detections are labelled `damage`.

## 4. XGBoost training (active, synthetic demo)

```bash
python scripts/build_mileage_dataset.py --synthetic 600
python scripts/train_mileage_xgb.py data/mileage_training.csv \
  --dataset-label synthetic-demo
```

The shipped model was trained on **600 synthetic rows** (balanced) and reports
precision/recall/F1 = 1.0 on a hold-out split — an artifact of learnable
synthetic patterns, **not** evidence of real fraud-detection quality. The
provenance is written to `models/mileage_xgb.meta.json` and surfaced by
`xgboost_adapter.status()["training"]`. The findings engine does **not** call
this model; deterministic rules + Isolation Forest/LOF remain authoritative.
Retrain on a real labelled corpus before any production use.

For weakly-labelled real rows: `python scripts/build_mileage_dataset.py --from-db`.

## 4b. Local LLM (active demo)

`TD_LLM_PROVIDER=local` loads a local instruct model through `transformers` +
CPU `torch`. Verified with `Qwen/Qwen2.5-0.5B-Instruct` (Apache-2.0, recommended)
and `HuggingFaceTB/SmolLM2-360M-Instruct` (Apache-2.0, lighter fallback). Both
are **demo-scale** models: output is validated before display, with four gates:

1. **Policy filter** — any safety/authenticity judgement (“safe to buy”,
   “genuine”, “accident-free”, “no fraud”, “guaranteed”…) rejects the whole
   answer.
2. **Coherence gate** — fragments, JSON fragments and low-letter-ratio output
   are rejected.
3. **Contradiction gate** — if findings exist, “no mileage decrease / no
   anomalies / nothing suspicious” is rejected.
4. **Citation gate** — when sources are supplied, the answer must cite at least
   one source id.

On rejection the deterministic evidence-only answer is used. A larger model can
be selected with `TD_LLM_MODEL`; an OpenAI-compatible endpoint can be selected
with `TD_LLM_PROVIDER`/`TD_LLM_BASE_URL`/`TD_LLM_API_KEY`. The LLM never sets
the trust score.

## 5. LangGraph status on this host

`langgraph 1.2.20` is **active**: `build_graph()` compiles the real graph with a
`MemorySaver` checkpointer and `interrupt_before=["HumanReviewNode"]`, and the
health endpoint reports `orchestrator: "langgraph"`, `checkpointing: true`.

During one install window the host's Application Control policy briefly blocked
`_uuid_utils` (`DLL load failed`); `build_graph()` captures any such load error
and falls back to the sequential executor, reporting `agent.error` with the
exact cause. The fallback is retained as resilience, not as the default.

## 6. API surface

`GET /health` and `GET /api/intelligence/capabilities` return
`intelligence: { damage, xgboost, retrieval }` and
`integrations: { vehicle_data, insurance, storage }`, each with `available`,
active engine and reason.
