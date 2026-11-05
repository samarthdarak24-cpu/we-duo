"""DB-backed background job worker.

A slow AI task must not block a normal dashboard request. Jobs are persisted in
the shared `background_jobs` table with status, attempts, timeout, idempotency,
progress and failure handling. Redis/Celery is the documented production target;
the local default is this worker sharing the same database (`python -m app.worker`).
"""
from __future__ import annotations

import json
import time
from typing import Any, Callable

from sqlalchemy import text

from . import agent, db, detectors, explain, extract, llm, ocr
from .config import settings
from .logging import emit

WORKER_VERSION = "worker-1.0.0"
JOB_TIMEOUT = settings.job_timeout_seconds
MAX_ATTEMPTS = settings.job_max_attempts

HANDLERS: dict[str, Callable[[dict], dict]] = {}


def handler(job_type: str):
    def register(fn: Callable[[dict], dict]):
        HANDLERS[job_type] = fn
        return fn
    return register


def enqueue(job_type: str, vehicle_id: str, payload: dict | None = None,
            idempotency_key: str | None = None) -> str:
    """Idempotent enqueue: the same key never creates two pending jobs."""
    if idempotency_key and db.has_table("background_jobs"):
        cols = db.columns("background_jobs")
        if "idempotency_key" in cols:
            # Any existing row with this key is the same logical job, regardless
            # of terminal status (the column is UNIQUE).
            existing = db.read("background_jobs",
                               where="idempotency_key = :k",
                               params={"k": idempotency_key}, limit=1)
            if existing:
                return str(existing[0]["id"])
    jid = db.new_id("job")
    row = {
        # Real schema CHECK: queued|running|succeeded|failed|dead|cancelled
        "id": jid, "type": job_type, "status": "queued",
        # Real schema uses subject_type/subject_id; the legacy name is kept so
        # the isolated test DB (vehicle_id) also works.
        "subject_type": "vehicle", "subject_id": vehicle_id, "vehicle_id": vehicle_id,
        "priority": 5, "run_after": db.now_iso(),
        "payload": json.dumps(payload or {}), "progress": 0, "attempts": 0,
        "idempotency_key": idempotency_key or jid,
        "max_attempts": MAX_ATTEMPTS,
        "timeout_ms": JOB_TIMEOUT * 1000, "timeout_seconds": JOB_TIMEOUT,
        "created_at": db.now_iso(), "updated_at": db.now_iso(),
    }
    ok, reason = db.insert("background_jobs", row)
    emit("job.enqueued", job_id=jid, type=job_type, vehicle_id=vehicle_id,
         written=ok, reason=reason)
    return jid


def claim_next() -> dict | None:
    if not db.has_table("background_jobs"):
        return None
    cols = db.columns("background_jobs")
    status_col = "status" if "status" in cols else None
    if not status_col:
        return None
    # Atomic-ish claim: select one pending job and immediately mark it running.
    order = "priority ASC, created_at ASC" if "priority" in cols else "created_at ASC"
    with db.engine().begin() as conn:
        row = conn.execute(text(
            f'SELECT * FROM "background_jobs" WHERE status = \'queued\' '
            f'ORDER BY {order} LIMIT 1'
        )).mappings().first()
        if not row:
            return None
        job = dict(row)
        conn.execute(text(
            'UPDATE "background_jobs" SET status = \'running\', '
            'attempts = attempts + 1, updated_at = :t WHERE id = :id'
        ), {"t": db.now_iso(), "id": job["id"]})
    return job


def _finish(job: dict, status: str, result: dict, progress: int = 100) -> None:
    db.update("background_jobs", str(job["id"]), {
        "status": status, "progress": progress,
        "result": json.dumps(result, default=str)[:8000],
        "finished_at": db.now_iso(), "updated_at": db.now_iso(),
    })


def process(job: dict) -> dict:
    jtype = str(job.get("type") or "")
    payload_raw = job.get("payload") or "{}"
    try:
        payload = json.loads(payload_raw) if isinstance(payload_raw, str) else dict(payload_raw)
    except Exception:
        payload = {}
    vehicle_id = str(job.get("vehicle_id") or job.get("subject_id")
                     or payload.get("vehicle_id") or "")
    started = time.monotonic()
    fn = HANDLERS.get(jtype)
    if fn is None:
        result = {"status": "unsupported_job_type", "type": jtype}
        _finish(job, "failed", result)
        return result
    try:
        result = fn({"vehicle_id": vehicle_id, **payload})
        if time.monotonic() - started > JOB_TIMEOUT:
            raise TimeoutError(f"job exceeded {JOB_TIMEOUT}s")
        _finish(job, "succeeded", result)
        emit("job.completed", job_id=str(job["id"]), type=jtype,
             seconds=round(time.monotonic() - started, 3))
        return result
    except Exception as exc:
        attempts = int(job.get("attempts") or 1)
        retry = attempts < MAX_ATTEMPTS
        result = {"status": "error", "error": f"{type(exc).__name__}: {exc}",
                  "attempt": attempts, "will_retry": retry}
        if retry:
            db.update("background_jobs", str(job["id"]),
                      {"status": "queued", "progress": 0,
                       "error": result["error"], "last_error": result["error"],
                       "updated_at": db.now_iso()})
        else:
            _finish(job, "failed", result)
        emit("job.failed", job_id=str(job["id"]), type=jtype,
             attempt=attempts, retry=retry, error=result["error"])
        return result


@handler("document_processing")
def _document(payload: dict) -> dict:
    path = payload.get("path")
    if not path:
        return {"status": "skipped", "reason": "no path supplied"}
    from pathlib import Path
    r = extract.process_document(Path(path), str(payload.get("document_id") or "unknown"),
                                 payload["vehicle_id"], str(payload.get("doc_type") or "rc"))
    return {"status": "succeeded", "confidence": r.confidence, "flags": r.flags,
            "engine": r.engine, "review_id": r.manual_review_id}


@handler("ocr")
def _ocr(payload: dict) -> dict:
    from pathlib import Path
    p = payload.get("path")
    if not p:
        return {"status": "skipped"}
    r = ocr.run_ocr(Path(p))
    return {"status": "succeeded", "engine": r.engine, "method": r.method,
            "is_ocr": r.is_ocr, "warnings": r.warnings}


@handler("document.ocr")
def _ocr_dot(payload: dict) -> dict:
    """Alias for the job type already persisted by the Next.js runtime."""
    return _ocr(payload)


@handler("duplicate_detection")
def _duplicates(payload: dict) -> dict:
    r = detectors.document_findings(payload["vehicle_id"])
    return {"status": "succeeded", "findings": [f.model_dump() for f in r.findings]}


@handler("ai_analysis")
def _analysis(payload: dict) -> dict:
    r = detectors.detect_all(payload["vehicle_id"])
    return {"status": "succeeded", "finding_count": r["finding_count"]}


@handler("damage_detection")
def _damage(payload: dict) -> dict:
    from pathlib import Path
    p = payload.get("path")
    if not p:
        return {"status": "skipped", "reason": "no image path"}
    return {"status": "succeeded", **detectors.damage_signals(Path(p))}


@handler("trust_score_recalculation")
def _trust(payload: dict) -> dict:
    e = explain.compute(payload["vehicle_id"])
    explain.persist(e)
    return {"status": "succeeded", "score": e.score, "version": e.version}


@handler("investigation")
def _investigation(payload: dict) -> dict:
    r = agent.investigate(payload["vehicle_id"],
                          str(payload.get("question") or "Is this vehicle safe to consider buying?"))
    return {"status": "succeeded", "investigation_id": r.investigation_id,
            "orchestrator": r.orchestrator, "human_review": r.human_review}


@handler("notifications")
def _notifications(payload: dict) -> dict:
    ok, reason = db.insert("notifications", {
        "id": db.new_id("notif"), "user_id": str(payload.get("user_id") or ""),
        "title": str(payload.get("title") or "Intelligence update"),
        "body": str(payload.get("body") or ""), "type": "system", "read": 0,
        "created_at": db.now_iso(),
    })
    return {"status": "succeeded" if ok else "degraded", "reason": reason}


@handler("pdf_generation")
def _pdf(payload: dict) -> dict:
    # Report PDFs are owned by the Next.js runtime; this job records the request
    # and points at the real endpoint rather than pretending to render a PDF.
    return {"status": "delegated", "endpoint": f"/api/v1/reports/vehicle/{payload['vehicle_id']}",
            "note": "PDF generation is served by the Next.js report endpoint."}


@handler("blockchain_submission")
def _chain(payload: dict) -> dict:
    return {"status": "not_configured",
            "note": "On-chain submission is optional and disabled. SHA-256 hashes and immutable audit events are local."}


def run_once() -> dict | None:
    job = claim_next()
    if not job:
        return None
    return process(job)


def run_forever() -> None:  # pragma: no cover - long running loop
    emit("worker.started", version=WORKER_VERSION, broker=settings.broker_url or "db-backed")
    while True:
        try:
            ran = run_once()
        except Exception as exc:
            emit("worker.loop_error", error=f"{type(exc).__name__}: {exc}")
            ran = None
        if not ran:
            time.sleep(settings.poll_interval_seconds)


def describe() -> dict:
    return {
        "version": WORKER_VERSION,
        "backend": "celery" if settings.broker_url else "db-backed",
        "broker": settings.broker_url or "none (shared background_jobs table)",
        "max_attempts": MAX_ATTEMPTS,
        "timeout_seconds": JOB_TIMEOUT,
        "job_types": sorted(HANDLERS),
        "capabilities": ["status", "retries", "timeouts", "idempotency",
                         "failure handling", "progress reporting"],
    }


if __name__ == "__main__":
    run_forever()
