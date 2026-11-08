"""Exercise every AI service for real, against a disposable copy of the database.

Nothing is mocked: OCR runs on a real image and a real PDF, YOLO on a real
photo, XGBoost on the shipped model, the investigator runs the actual graph.
The live `.data/trustdrive.db` is copied with VACUUM INTO first, so the checks
can write (reviews, investigations) without touching real records.

Usage:  node project/scripts/setup/py.mjs project/qa/test_ai_services.py
"""
from __future__ import annotations

import json
import os
import shutil
import sqlite3
import sys
import tempfile
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
BACKEND = REPO / "backend"
LIVE_DB = REPO / ".data" / "trustdrive.db"
UPLOADS = REPO / ".data" / "uploads"
SAMPLE_DIR = REPO / "services" / "ai" / "shared" / "data"

# --- isolate: copy the database, keep uploads read-only --------------------
tmpdir = Path(tempfile.mkdtemp(prefix="td-ai-test-"))
tmp_db = tmpdir / "trustdrive.db"
if LIVE_DB.is_file():
    src = sqlite3.connect(f"file:{LIVE_DB}?mode=ro", uri=True)
    dst = sqlite3.connect(tmp_db)
    src.backup(dst)
    dst.close()
    src.close()

os.environ["TD_DB_URL"] = f"sqlite+pysqlite:///{tmp_db.as_posix()}"
os.environ["TD_UPLOAD_DIR"] = str(UPLOADS)
os.environ["TD_ENV"] = "local"
os.environ.setdefault("TD_LLM_PROVIDER", "none")
sys.path.insert(0, str(BACKEND))

RESULTS: list[dict] = []


def check(name: str, fn, *, detail_keys: tuple[str, ...] = ()) -> None:
    started = time.time()
    try:
        value = fn()
        RESULTS.append({
            "name": name,
            "status": "PASS",
            "ms": round((time.time() - started) * 1000),
            "detail": value,
        })
    except Exception as exc:  # noqa: BLE001 - report, never abort the sweep
        RESULTS.append({
            "name": name,
            "status": "FAIL",
            "ms": round((time.time() - started) * 1000),
            "detail": f"{type(exc).__name__}: {exc}",
        })


def main() -> int:
    from app import agent, categories, config, db, detectors, extract, llm, worker
    from app.intelligence import status as intelligence_status
    from app.intelligence import ocr as doc_ocr
    from app.intelligence.damage import yolo
    from app.intelligence.mileage import xgboost_adapter
    from app.intelligence.retrieval import embeddings

    # 1. configuration + database reachability
    def _config():
        st = config.settings
        return {
            "environment": st.environment,
            "db_url": str(st.db_url).replace(str(tmpdir), "<tmp>"),
            "model_dir": str(st.model_dir),
            "model_dir_exists": Path(st.model_dir).is_dir(),
            "llm_provider": st.llm_provider,
            "checkpoint_backend": st.checkpoint_backend,
            "upload_dir": str(st.upload_dir),
        }
    check("config + model dir", _config)

    def _db():
        rows = db.read("vehicles", limit=3)
        return {"vehicles_visible": len(rows), "tables": len(db.table_names()) if hasattr(db, "table_names") else None}
    check("database readable", _db)

    # 2. capability snapshot
    check("intelligence.status()", lambda: intelligence_status())

    # 3. document OCR
    check("ocr.status()", doc_ocr.status)
    check("ocr installed engines", doc_ocr.installed_engines)

    def _ocr_image():
        img = SAMPLE_DIR / "paddle_test.png"
        assert img.is_file(), f"missing sample {img}"
        out = doc_ocr.ocr_image(img)
        assert out.get("available"), out.get("reason")
        text = out.get("text", "")
        assert text.strip(), "OCR returned no text"
        fields = doc_ocr.extract_fields(text)
        return {
            "engine": out.get("engine"),
            "method": out.get("method"),
            "is_ocr": out.get("is_ocr"),
            "chars": len(text),
            "sample": text.strip().splitlines()[:2],
            "fields_recovered": {k: v for k, v in fields.items() if v},
        }
    check("OCR on real image", _ocr_image)

    def _ocr_pdf():
        pdfs = sorted(UPLOADS.rglob("*.pdf"), key=lambda p: p.stat().st_size, reverse=True)
        assert pdfs, "no PDF in uploads"
        out = doc_ocr.ocr_image(pdfs[0])
        assert out.get("available"), out.get("reason")
        return {
            "file": pdfs[0].name,
            "engine": out.get("engine"),
            "is_ocr": out.get("is_ocr"),
            "chars": len(out.get("text", "")),
        }
    check("OCR/PDF text layer", _ocr_pdf)

    # 4. YOLO damage detection
    check("yolo.status()", yolo.status)

    def _yolo():
        img = SAMPLE_DIR / "yolo_sample.png"
        assert img.is_file(), f"missing sample {img}"
        out = yolo.detect(img)
        return {
            "available": out.get("available"),
            "engine": out.get("version"),
            "detections": len(out.get("detections") or []),
            "labels": [d.get("label") for d in (out.get("detections") or [])][:5],
            "limitations": (out.get("limitations") or [])[:2],
        }
    check("YOLO detect on real photo", _yolo)

    # 5. XGBoost mileage model
    check("xgboost.status()", xgboost_adapter.status)

    def _xgb():
        st = xgboost_adapter.status()
        assert st["available"], st.get("reason")
        out = xgboost_adapter.predict([{
            "year": 2020, "km": 42000, "delta": -38000, "age_years": 6, "km_per_year": 7000,
        }])
        return {"model": st.get("version"), "prediction": out}
    check("XGBoost predict", _xgb)

    # 6. Retrieval / embeddings
    check("retrieval.status()", embeddings.status)

    def _retrieval():
        docs = [
            {"id": "d1", "text": "Odometer rollback detected between 2022 and 2023 readings."},
            {"id": "d2", "text": "Insurance policy expired before the sale date."},
            {"id": "d3", "text": "Front bumper repainted after a minor collision."},
        ]
        out = embeddings.search("odometer rollback", docs, top_k=2)
        return {"backend": out.get("backend"), "hits": [r.get("id") for r in out.get("results", [])]}
    check("retrieval.search()", _retrieval)

    # 7. LLM (deterministic or configured provider)
    check("llm.describe()", llm.describe)

    def _llm():
        facts = {
            "make": "BMW", "model": "3 Series", "year": 2015, "regNo": "MH01XY4321",
            "trustScore": 42, "band": "caution", "openFindings": 2,
            "evidenceCoverage": 0.62,
        }
        res = llm.generate_explanation("Explain the trust score for this vehicle.", facts)
        return {
            "available": res.available,
            "provider": res.provider,
            "model": res.model,
            "grounded": res.grounded,
            "conclusion_generated": bool(res.conclusion),
            "conclusion_chars": len(res.conclusion or ""),
            "reason": (res.reason or "")[:160],
            "unsupported_claims": res.unsupported_claims,
        }
    check("llm.generate_explanation()", _llm)

    # 8. Document pipeline (writes go to the disposable copy)
    def _pipeline():
        pdfs = sorted(UPLOADS.rglob("*.pdf"), key=lambda p: p.stat().st_size, reverse=True)
        assert pdfs, "no PDF in uploads"
        doc_id = db.new_id("qa-doc")
        out = extract.process_document(pdfs[0], doc_id, "v-seller", "rc")
        payload = out.model_dump() if hasattr(out, "model_dump") else dict(out)
        return {
            "engine": payload.get("engine"),
            "method": payload.get("method"),
            "is_ocr": payload.get("is_ocr"),
            "confidence": payload.get("confidence"),
            "low_confidence": payload.get("low_confidence"),
            "flags": payload.get("flags"),
            "workflow_steps": len(payload.get("workflow") or []),
            "warning": (payload.get("warning") or "")[:80],
        }
    check("document pipeline", _pipeline)

    # 9. Deterministic detectors
    def _detectors():
        out = detectors.detect_all("v-seller")
        findings = [f for r in out.get("reports", []) for f in (r.get("findings") or [])]
        return {
            "finding_count": out.get("finding_count"),
            "high_severity": out.get("high_severity_count"),
            "codes": [f.get("code") for f in findings][:6],
            "reports": len(out.get("reports") or []),
            "agent_nodes": (out.get("capabilities") or {}).get("agent_nodes"),
        }
    check("detect_all(v-seller)", _detectors)

    # 10. LangGraph investigator
    def _investigate():
        res = agent.investigate("v-seller", "Is this vehicle safe to buy?")
        payload = res.model_dump() if hasattr(res, "model_dump") else dict(res)
        return {
            "orchestrator": payload.get("orchestrator"),
            "status": payload.get("status"),
            "findings": len(payload.get("findings") or []),
            "review_required": bool(payload.get("human_review")),
            "answer_chars": len(payload.get("answer") or ""),
        }
    check("investigator (LangGraph)", _investigate)

    # 11. Category resolution
    def _category():
        profile = categories.resolve_vehicle_category("v-seller")
        return {"id": profile.get("id"), "label": profile.get("label"), "class": profile.get("class")}
    check("category resolution", _category)

    # 12. Background worker
    check("worker.describe()", worker.describe)

    def _worker():
        ran = worker.run_once()
        return {"pending_job_processed": ran is not None, "job": (ran or {}).get("status")}
    check("worker.run_once()", _worker)

    # --- report ------------------------------------------------------------
    print()
    for r in RESULTS:
        icon = "PASS" if r["status"] == "PASS" else "FAIL"
        print(f"[{icon}] {r['name']:32} {r['ms']:>6} ms")
        detail = r["detail"]
        if r["status"] == "PASS":
            print(f"        {json.dumps(detail, default=str)[:300]}")
        else:
            print(f"        {detail}")

    failed = [r for r in RESULTS if r["status"] != "PASS"]
    print(f"\nTOTAL {len(RESULTS)}  PASS {len(RESULTS) - len(failed)}  FAIL {len(failed)}")
    (REPO / "project" / "qa" / "ai-services-results.json").write_text(
        json.dumps(RESULTS, indent=2, default=str), encoding="utf-8")
    shutil.rmtree(tmpdir, ignore_errors=True)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
