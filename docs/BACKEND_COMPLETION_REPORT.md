# TrustDrive — Backend Completion Report

> Gate review for "do not start the full frontend until the backend gate passes".
> Verified 2026-11-05 against the running service and the live database.

## 1. Gate checklist

| Gate item | Status | Evidence |
| --- | --- | --- |
| Every backend feature in the gap matrix implemented or blocked with reason | ✅ | `docs/FEATURE_GAP_MATRIX.md` (⛔ rows: signed URLs, malware scan, external registry — reasoned) |
| Every required table/model has a migration | ✅ | 51 tables live; Alembic additive revision `0001_intelligence_tables`; `docs/DATABASE_ERD.md` |
| Every Seller/Buyer action has a documented API | ✅ | 137 OpenAPI paths; `docs/API_SPECIFICATION.md` §5/§8 |
| Every endpoint has request/response schemas and permission checks | ✅ | Pydantic models per route; `Depends(require_role)` / owner checks; `test_security` |
| Business logic in service modules, not duplicated in routes | ✅ | `repository.py`, `extract.py`, `detectors.py`, `explain.py`, `agent.py`, `worker.py`; routers are thin adapters |
| OCR/AI jobs asynchronous where slow | ✅ | `background_jobs` + worker; `POST /documents/{id}/reprocess` → 202 + job id |
| AI findings have evidence references and uncertainty | ✅ | `method`, `model_version`, `confidence`, `evidence`, `recommended_review_action` on every finding |
| Seed data works on a clean database | ✅ | `npm run seed:reset` → 13 vehicles, 7 users, 80 documents, 111 chain records |
| Backend tests pass | ✅ | **88 passed** (`python -m pytest -q`) |
| API docs generated and reviewed | ✅ | `/openapi.json`, `/docs`; hand-written Next.js surface in `docs/API_SPECIFICATION.md` |
| No critical authorization/security defect remains | ✅ | `tests/test_security.py` (15 tests) — RBAC, IDOR, QR privacy, uploads, injection, rate limit |
| `docs/BACKEND_COMPLETION_REPORT.md` records actual results | ✅ | this file |

**Gate result: PASS**, with the explicit blockers in §4.

## 2. Backend file inventory (actual)

```
services/intelligence/
  requirements.txt · README.md · Dockerfile · alembic.ini
  alembic/env.py · script.py.mako · versions/0001_intelligence_tables.py
  app/
    __init__.py · config.py · logging.py · db.py · security.py · ratelimit.py
    repository.py · ocr.py · extract.py · detectors.py · explain.py · llm.py
    agent.py · worker.py · tasks.py · main.py
    routers/
      __init__.py · auth.py · users.py · vehicles.py · marketplace.py
      inquiries.py · reports.py · notifications.py · audit.py · v1.py
    integrations/
      vehicle_data/{interface,demo_provider}.py
      insurance/{interface,demo_provider}.py
      llm/{interface,provider}.py
      storage/{interface,local_storage,s3_storage}.py
    intelligence/
      rules/ · mileage/xgboost_adapter.py · damage/yolo.py
      scoring/ · evaluation/metrics.py · retrieval/embeddings.py
  tests/
    conftest.py · test_api.py · test_detectors.py · test_pipeline.py
    test_backend.py · test_security.py · test_models.py
models/README.md · scripts/fetch_models.py · scripts/train_mileage_xgb.py
```

Web backend (Next.js) remains `app/api/v1/*` (102 `route.ts` files) + `lib/server/*`
(including `signed.ts`, `scan.ts`, `ratelimit.ts`, `evidence.ts`).

## 3. Test evidence

| Suite | Result |
| --- | --- |
| `test_api.py` | health, capabilities, fraud, trust, 12-node investigation, jobs, review, integrity, damage, upload validation |
| `test_detectors.py` | mileage rules, duplicates, additive score, missing-data policy, offline LLM, grounding, damage adapter |
| `test_pipeline.py` | extraction, magic bytes, 18 steps, real PDF text layer, worker idempotency, agent persistence |
| `test_backend.py` | auth, vehicle CRUD + duplicates, mileage flag, listing lifecycle, saved, compare, inquiry thread, real PDF, share/verify, notifications, append-only correction, verification persistence, admin KYC |
| `test_security.py` | unauthenticated, buyer→seller, cross-seller, private docs, QR privacy, magic bytes, oversize, SHA, SQLi, stored markup, rate limit, v1 contract |
| `test_models.py` | demo providers labelled, storage traversal guard, S3 inactive, LLM offline, YOLO/XGBoost inactive, retrieval, metrics |

`pytest -q` → **88 passed**. `scripts/eval_llm.py` → **10/10 passed** (2 LLM
narratives, 8 deterministic fallbacks; no forbidden safety claim). Real-DB smoke: real scrypt logins, 7 seller
vehicles, 12 marketplace listings, save/inquiry/reply, real PDF, share→verify,
audit RBAC, 137 OpenAPI paths.

## 4. Blockers (explicit)

| Blocker | Impact | Status / workaround |
| --- | --- | --- |
| Real labelled fraud corpus | XGBoost is **synthetic-demo** only | findings use rules + IForest/LOF; retrain with `--dataset-label real-labelled` |
| Authorised RTO/insurer API | registry/insurance checks are demo | providers labelled `demo:true`, `verified:false`; set the provider URL when authorised |
| LLM quality | local 0.5B demo model is limited | four guardrails (policy, coherence, contradiction, citation); deterministic answer is primary; set `TD_LLM_MODEL` to a larger model |
| Rate-limit / scanner scope | in-process bucket; scanner optional | gateway/Redis limit + `TD_MALWARE_SCAN_URL` for production |

**Resolved in this pass:** MIT-licensed YOLO11m damage weights (40.5 MB, six
classes, verified inference), RapidOCR image OCR, XGBoost model, local LLM
(Qwen2.5-0.5B / SmolLM2-360M) with guardrails, signed download URLs, malware-scan
adapter, per-IP rate limiting, and the `REPO_ROOT` path bug that pointed the
service at an empty `services/.data` database.

## 5. Run the backend

```bash
python -m pip install -r services/intelligence/requirements.txt
npm run intel:migrate
npm run intel:serve      # http://127.0.0.1:8000/docs
npm run intel:worker
npm run intel:test       # 80 tests
```
