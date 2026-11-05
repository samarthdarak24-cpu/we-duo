"""Optional Celery tasks.

A Celery app that cannot reach a broker is a silent failure mode, so it is
created ONLY when TD_BROKER_URL is set. Otherwise the DB-backed worker in
`app/worker.py` runs the exact same handler functions.
"""
from __future__ import annotations

from typing import Any

from .config import settings

celery_app: Any = None
ACTIVE = False

if settings.broker_url:
    try:
        from celery import Celery  # type: ignore

        celery_app = Celery(
            "trustdrive",
            broker=settings.broker_url,
            backend=settings.broker_url,
        )
        celery_app.conf.update(
            task_serializer="json",
            result_serializer="json",
            accept_content=["json"],
            timezone="UTC",
            enable_utc=True,
            task_acks_late=True,
            task_reject_on_worker_lost=True,
            worker_prefetch_multiplier=1,
            task_time_limit=settings.job_timeout_seconds + 30,
            task_soft_time_limit=settings.job_timeout_seconds,
        )
        ACTIVE = True

        @celery_app.task(bind=True, name="trustdrive.process_job", max_retries=2)
        def process_job(self, job_id: str) -> dict:
            """Reuse the same DB-backed job processor; no duplicate business logic."""
            from . import db, worker
            rows = db.read("background_jobs", where="id = :id", params={"id": job_id}, limit=1)
            if not rows:
                return {"status": "not_found"}
            return worker.process(rows[0])

    except ImportError:
        celery_app = None
        ACTIVE = False


def describe() -> dict:
    return {
        "active": ACTIVE,
        "broker": settings.broker_url or "not configured",
        "fallback": "app.worker (DB-backed background_jobs table)",
        "note": "Install celery + redis and set TD_BROKER_URL to activate. Never reported as active without a broker.",
    }
