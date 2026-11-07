# AI Services

All AI functionality is **internal to the FastAPI service** at
`services/intelligence`. No separate microservice is deployed: OCR, ML, the
agent and the worker share one process image, one database and one model cache.
This keeps deployment to a single Render service and avoids duplicating auth,
storage and schema logic.

## Module map

| Logical service | Actual path |
| --- | --- |
| Document OCR | `app/ocr.py` (PaddleOCR, RapidOCR, PyMuPDF, OpenCV) |
| Field extraction | `app/extract.py` |
| 18-step document pipeline | `app/main.py` + extraction routes |
| Mileage anomaly | `app/detectors.py`, `app/intelligence/mileage/xgboost_adapter.py` |
| Fraud / duplicate documents | `app/detectors.py`, `lib/server/evidence.ts` (web side) |
| Damage detection | `app/intelligence/damage/yolo.py`, `models/car_damage.pt` |
| Retrieval / embeddings | `app/intelligence/retrieval/embeddings.py` |
| Scoring | `app/intelligence/scoring/`, `lib/server/engine.ts` |
| LangGraph agent | `app/agent.py` (15/16 conditional nodes), `app/intelligence/rules/` |
| Explanation + LLM | `app/explain.py`, `app/llm.py`, `app/integrations/llm/` |
| Integrity / blockchain | `app/blockchain/` |
| Model evaluation | `app/intelligence/evaluation/metrics.py`, `scripts/eval_llm.py` |
| Worker | `app/worker.py`, `app/tasks.py` |
| Model registry | `models/MODEL_REGISTER.json` |

## Activation

Each adapter reports `available: true|false` with a reason in `/health`.
A capability is only marked active when its dependency and weights exist.

```bash
curl -s http://127.0.0.1:8000/health | python -m json.tool
curl -s http://127.0.0.1:8000/api/intelligence/capabilities | python -m json.tool
```

## Models

| Model | File | Licence | Notes |
| --- | --- | --- | --- |
| YOLO11m damage | `models/car_damage.pt` | MIT | 6 classes, 40.5 MB |
| XGBoost mileage | `models/mileage_xgb.json` | internal | synthetic-demo labels |
| PaddleOCR det/rec | `~/.paddlex/official_models` | Apache-2.0 | auto-download |
| Embeddings | Hugging Face cache | Apache-2.0 | `all-MiniLM-L6-v2` |
| Local LLM | Hugging Face cache | Qwen licence | Qwen2.5-0.5B-Instruct |

## Runtime profiles

- **Full** (`requirements.txt`): torch, ultralytics, paddle, transformers —
  all adapters active, ~3 GB RAM.
- **Slim** (`requirements-render.txt`): RapidOCR, OpenCV, ONNX, XGBoost, sklearn
  — used in the Render image; heavy adapters report inactive.

See `AI_ARCHITECTURE.md` for pipelines, guardrails and evaluation results.
