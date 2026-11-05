"""Audit logs, background jobs and admin moderation."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import db, repository
from ..security import require_role

router = APIRouter(prefix="/api/backend", tags=["audit"])


class DisputeResolve(BaseModel):
    decision: str  # upheld | rejected
    note: str = ""


@router.get("/audit")
def list_audit(limit: int = 50, offset: int = 0, action: str | None = None,
               entity_type: str | None = None,
               admin: dict = Depends(require_role("admin"))) -> dict:
    return repository.list_rows("audit_logs", filters={"action": action,
                                                       "entity_type": entity_type},
                                limit=limit, offset=offset, order_by="at")


@router.get("/jobs")
def list_jobs(limit: int = 50, offset: int = 0, status: str | None = None,
              admin: dict = Depends(require_role("admin"))) -> dict:
    return repository.list_rows("background_jobs", filters={"status": status},
                                limit=limit, offset=offset, order_by="created_at")


@router.post("/jobs/{job_id}/retry")
def retry_job(job_id: str, admin: dict = Depends(require_role("admin"))) -> dict:
    job = repository.get_row("background_jobs", job_id)
    if str(job.get("status")) not in ("failed", "dead", "cancelled"):
        raise HTTPException(status_code=409,
                            detail="Only failed, dead or cancelled jobs can be retried.")
    updated = repository.update_row("background_jobs", job_id, {
        "status": "queued", "progress": 0, "error": None, "finished_at": None,
    })
    repository.audit(str(admin["id"]), "job.retried", "background_job", job_id)
    return {"job": updated}


@router.get("/admin/queue")
def review_queue(limit: int = 100,
                 admin: dict = Depends(require_role("admin"))) -> dict:
    rows = db.read("human_review_queue", where="status IN ('open','assigned')",
                   limit=min(limit, 200))
    return {"items": rows, "total": len(rows)}


@router.get("/admin/disputes")
def list_disputes(limit: int = 100, admin: dict = Depends(require_role("admin"))) -> dict:
    rows = db.read("disputes", limit=min(limit, 200))
    return {"items": rows, "total": len(rows)}


@router.post("/admin/disputes/{dispute_id}/resolve")
def resolve_dispute(dispute_id: str, req: DisputeResolve,
                    admin: dict = Depends(require_role("admin"))) -> dict:
    if req.decision not in ("upheld", "rejected"):
        raise HTTPException(status_code=422, detail="decision must be upheld | rejected")
    updated = repository.update_row("disputes", dispute_id, {
        "status": req.decision, "reviewed_by": admin["id"], "review_note": req.note,
    })
    repository.audit(str(admin["id"]), "dispute.resolved", "dispute", dispute_id,
                     {"decision": req.decision})
    return {"dispute": updated}


@router.post("/admin/listings/{listing_id}/suspend")
def suspend_listing(listing_id: str, admin: dict = Depends(require_role("admin"))) -> dict:
    updated = repository.update_row("listings", listing_id, {"status": "suspended"})
    repository.audit(str(admin["id"]), "listing.suspended", "listing", listing_id)
    return {"listing": updated}
