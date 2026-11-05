"""Versioned `/api/v1` surface matching the final backend-first checklist.

These routes are thin adapters over the same service functions used by
`/api/backend/*`. They exist so the documented contract paths
(`/api/v1/vehicles/{id}/verification-runs`, `/api/v1/saved-vehicles/{vehicleId}`,
`/api/v1/public/vehicle-verification/{token}`, …) are real, not aspirational.
No business logic is duplicated here.
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from pydantic import BaseModel, Field

from .. import agent, db, repository, worker
from ..config import settings
from ..ratelimit import enforce_auth_limit
from ..security import current_user, optional_user, require_role
from . import auth, inquiries, marketplace, notifications, reports, users, vehicles

router = APIRouter(prefix="/api/v1", tags=["v1"])


# ---- local request models (path supplies the ids) -------------------------
class ListingCreateV1(BaseModel):
    headline: str = Field(min_length=4, max_length=140)
    description: str = ""
    condition: str = "used"
    location: str | None = None
    cover_image: str | None = None


class InquiryCreateV1(BaseModel):
    message: str = Field(min_length=2, max_length=1000)
    type: str = "general"


class ReportCreateV1(BaseModel):
    type: str = "Vehicle verification"


class InvestigationCreate(BaseModel):
    question: str = "Is this vehicle safe to consider buying?"


class InvestigationReview(BaseModel):
    decision: str  # approved | rejected | corrected
    reviewer: str
    note: str = ""


class InspectionRequest(BaseModel):
    scheduled_at: str
    message: str = "I would like to schedule an inspection."


class ImageDelete(BaseModel):
    pass


# ---- health ---------------------------------------------------------------
@router.get("/health/live")
def health_live() -> dict:
    return {"status": "alive"}


@router.get("/health/ready")
def health_ready() -> dict:
    h = db.health()
    if h.get("database") != "connected":
        raise HTTPException(status_code=503, detail="Database is not reachable.")
    return {"status": "ready", "database": h,
            "llm": {"configured": bool(settings.llm_api_key)},
            "worker": "db-backed"}


# ---- auth -----------------------------------------------------------------
@router.post("/auth/register", status_code=201, dependencies=[Depends(enforce_auth_limit)])
def v1_register(req: auth.RegisterRequest) -> dict:
    return auth.register(req)


@router.post("/auth/login", dependencies=[Depends(enforce_auth_limit)])
def v1_login(req: auth.LoginRequest, user_agent: str | None = Header(default=None),
             x_forwarded_for: str | None = Header(default=None)) -> dict:
    return auth.login(req, user_agent, x_forwarded_for)


@router.post("/auth/refresh")
def v1_refresh(req: auth.RefreshRequest) -> dict:
    return auth.refresh(req)


@router.post("/auth/logout", status_code=204, response_class=Response)
def v1_logout(authorization: str | None = Header(default=None)) -> Response:
    return auth.logout(authorization)


@router.post("/auth/password/forgot", status_code=202, dependencies=[Depends(enforce_auth_limit)])
def v1_forgot(req: auth.ForgotRequest) -> dict:
    return auth.forgot_password(req)


@router.post("/auth/password/reset", status_code=204, response_class=Response)
def v1_reset(req: auth.ResetRequest) -> Response:
    return auth.reset_password(req)


@router.get("/users/me")
def v1_me(user: dict = Depends(current_user)) -> dict:
    return users.my_profile(user)


@router.patch("/users/me")
def v1_update_me(req: users.ProfileUpdate, user: dict = Depends(current_user)) -> dict:
    return users.update_profile(req, user)


# ---- vehicles -------------------------------------------------------------
@router.get("/vehicles")
def v1_list_vehicles(limit: int = 50, offset: int = 0, status: str | None = None,
                     user: dict = Depends(current_user)) -> dict:
    return vehicles.list_vehicles(limit, offset, status, user)


@router.post("/vehicles", status_code=201)
def v1_create_vehicle(req: vehicles.VehicleCreate,
                      user: dict = Depends(require_role("seller", "admin"))) -> dict:
    return vehicles.create_vehicle(req, user)


@router.get("/vehicles/mine")
def v1_my_vehicles(limit: int = 50, offset: int = 0,
                   user: dict = Depends(require_role("seller", "admin"))) -> dict:
    return vehicles.list_vehicles(limit, offset, None, user)


@router.get("/vehicles/{vehicle_id}")
def v1_get_vehicle(vehicle_id: str, user: dict = Depends(current_user)) -> dict:
    return vehicles.get_vehicle(vehicle_id, user)


@router.patch("/vehicles/{vehicle_id}")
def v1_update_vehicle(vehicle_id: str, req: vehicles.VehicleUpdate,
                      user: dict = Depends(require_role("seller", "admin"))) -> dict:
    return vehicles.update_vehicle(vehicle_id, req, user)


@router.post("/vehicles/{vehicle_id}/archive")
def v1_archive_vehicle(vehicle_id: str,
                       user: dict = Depends(require_role("seller", "admin"))) -> dict:
    return vehicles.archive_vehicle(vehicle_id, user)


@router.post("/vehicles/{vehicle_id}/images", status_code=201)
def v1_add_image(vehicle_id: str, req: vehicles.PhotoCreate,
                 user: dict = Depends(require_role("seller", "admin"))) -> dict:
    return vehicles.add_photo(vehicle_id, req, user)


@router.delete("/vehicles/{vehicle_id}/images/{image_id}", status_code=204,
               response_class=Response)
def v1_delete_image(vehicle_id: str, image_id: str,
                    user: dict = Depends(require_role("seller", "admin"))) -> Response:
    vehicle = vehicles._vehicle(vehicle_id)
    if user.get("role") != "admin" and str(vehicle.get("owner_id")) != str(user["id"]):
        raise HTTPException(status_code=403, detail="You do not own this vehicle.")
    repository.soft_delete("vehicle_images", image_id)
    repository.audit(str(user["id"]), "vehicle.image_deleted", "vehicle_image", image_id)
    return Response(status_code=204)


# ---- documents ------------------------------------------------------------
@router.post("/vehicles/{vehicle_id}/documents", status_code=201)
def v1_add_document(vehicle_id: str, req: vehicles.DocumentCreate,
                    user: dict = Depends(require_role("seller", "admin"))) -> dict:
    return vehicles.register_document(vehicle_id, req, user)


@router.get("/vehicles/{vehicle_id}/documents")
def v1_list_documents(vehicle_id: str, user: dict = Depends(current_user)) -> dict:
    return vehicles.list_documents(vehicle_id, user)


@router.get("/documents/{document_id}")
def v1_get_document(document_id: str, user: dict = Depends(current_user)) -> dict:
    doc = repository.get_row("documents", document_id)
    if doc.get("deleted_at"):
        raise HTTPException(status_code=404, detail="Document not found.")
    vehicle = repository.get_row("vehicles", str(doc["vehicle_id"]))
    if user.get("role") != "admin" and str(vehicle.get("owner_id")) != str(user["id"]):
        raise HTTPException(status_code=403, detail="Private document.")
    return {"document": doc}


@router.post("/documents/{document_id}/reprocess", status_code=202)
def v1_reprocess_document(document_id: str,
                          user: dict = Depends(require_role("seller", "admin"))) -> dict:
    doc = repository.get_row("documents", document_id)
    if doc.get("deleted_at"):
        raise HTTPException(status_code=404, detail="Document not found.")
    vehicle = repository.get_row("vehicles", str(doc["vehicle_id"]))
    if user.get("role") != "admin" and str(vehicle.get("owner_id")) != str(user["id"]):
        raise HTTPException(status_code=403, detail="You do not own this document.")
    key = doc.get("file_key")
    path = settings.upload_dir / str(key) if key else None
    if not path or not path.is_file():
        raise HTTPException(status_code=409,
                            detail="Source file is not available for reprocessing.")
    jid = worker.enqueue("document_processing", str(doc["vehicle_id"]), {
        "path": str(path), "document_id": document_id, "doc_type": doc.get("type"),
    }, idempotency_key=f"doc:{document_id}:reprocess")
    return {"status": "queued", "job_id": jid}


@router.post("/documents/{document_id}/replace", status_code=201)
def v1_replace_document(document_id: str, req: vehicles.DocumentCreate,
                        user: dict = Depends(require_role("seller", "admin"))) -> dict:
    old = repository.get_row("documents", document_id)
    if old.get("deleted_at"):
        raise HTTPException(status_code=404, detail="Document not found.")
    vehicle = repository.get_row("vehicles", str(old["vehicle_id"]))
    if user.get("role") != "admin" and str(vehicle.get("owner_id")) != str(user["id"]):
        raise HTTPException(status_code=403, detail="You do not own this document.")
    new = repository.create_row("documents", {
        "vehicle_id": old["vehicle_id"], "type": old.get("type") or req.type,
        "file_name": req.file_name, "file_key": req.file_key, "mime": req.mime,
        "size_bytes": req.size_bytes, "sha256": req.sha256.lower(), "status": "pending",
        "version": int(old.get("version") or 1) + 1, "supersedes_id": document_id,
        "uploaded_at": db.now_iso(), "consent": old.get("consent", 1),
    })
    db.update("documents", document_id, {"status": "superseded"})
    repository.audit(str(user["id"]), "document.replaced", "document", document_id,
                     {"new_id": new["id"]})
    return {"document": new, "supersedes": document_id}


# ---- history / mileage / inspections / damage -----------------------------
@router.get("/vehicles/{vehicle_id}/history")
def v1_history(vehicle_id: str, user: dict = Depends(current_user)) -> dict:
    return vehicles.list_history(vehicle_id, user)


@router.delete("/documents/{document_id}", status_code=204, response_class=Response)
def v1_delete_document(document_id: str,
                       user: dict = Depends(current_user)) -> Response:
    doc = repository.get_row("documents", document_id)
    if doc.get("deleted_at"):
        raise HTTPException(status_code=404, detail="Document not found.")
    vehicle = repository.get_row("vehicles", str(doc["vehicle_id"]))
    if user.get("role") != "admin" and str(vehicle.get("owner_id")) != str(user["id"]):
        raise HTTPException(status_code=403, detail="You do not own this document.")
    repository.soft_delete("documents", document_id)
    repository.audit(str(user["id"]), "document.soft_deleted", "document", document_id)
    return Response(status_code=204)


@router.delete("/users/me", status_code=204, response_class=Response)
def v1_delete_me(user: dict = Depends(current_user)) -> Response:
    return users.delete_me(user)


@router.delete("/admin/users/{user_id}", status_code=204, response_class=Response)
def v1_delete_user(user_id: str,
                   admin: dict = Depends(require_role("admin"))) -> Response:
    return users.delete_user(user_id, admin)


@router.post("/vehicles/{vehicle_id}/history-events", status_code=201)
def v1_add_history(vehicle_id: str, req: vehicles.HistoryCreate,
                   user: dict = Depends(require_role("seller", "admin"))) -> dict:
    return vehicles.add_history(vehicle_id, req, user)


@router.get("/vehicles/{vehicle_id}/mileage-records")
def v1_mileage(vehicle_id: str, user: dict = Depends(current_user)) -> dict:
    return vehicles.list_mileage(vehicle_id, user)


@router.post("/vehicles/{vehicle_id}/mileage-records", status_code=201)
def v1_add_mileage(vehicle_id: str, req: vehicles.MileageCreate,
                   user: dict = Depends(require_role("seller", "admin"))) -> dict:
    return vehicles.add_mileage(vehicle_id, req, user)


@router.post("/vehicles/{vehicle_id}/inspections", status_code=201)
def v1_add_inspection(vehicle_id: str, req: vehicles.InspectionCreate,
                      user: dict = Depends(require_role("seller", "admin"))) -> dict:
    return vehicles.add_inspection(vehicle_id, req, user)


@router.post("/vehicles/{vehicle_id}/damage-records", status_code=201)
def v1_add_damage(vehicle_id: str, req: vehicles.DamageCreate,
                  user: dict = Depends(require_role("seller", "admin"))) -> dict:
    return vehicles.add_damage(vehicle_id, req, user)


# ---- verification / investigations ---------------------------------------
@router.post("/vehicles/{vehicle_id}/verification-runs")
def v1_run_verification(vehicle_id: str,
                        user: dict = Depends(require_role("seller", "admin"))) -> dict:
    return vehicles.run_verification(vehicle_id, user)


@router.get("/vehicles/{vehicle_id}/verification-results")
def v1_verification_results(vehicle_id: str, user: dict = Depends(current_user)) -> dict:
    return vehicles.list_verification(vehicle_id, user)


@router.get("/vehicles/{vehicle_id}/investigations")
def v1_list_investigations(vehicle_id: str, user: dict = Depends(current_user)) -> dict:
    vehicle = vehicles._vehicle(vehicle_id)
    if user.get("role") != "admin" and str(vehicle.get("owner_id")) != str(user["id"]):
        raise HTTPException(status_code=403, detail="You do not own this vehicle.")
    rows = db.read("agent_investigations", where="vehicle_id = :v",
                   params={"v": vehicle_id}, limit=100)
    return {"items": rows, "total": len(rows)}


@router.post("/vehicles/{vehicle_id}/investigations", status_code=201)
def v1_create_investigation(vehicle_id: str, req: InvestigationCreate,
                            user: dict = Depends(current_user)) -> dict:
    result = agent.investigate(vehicle_id, req.question)
    return result.model_dump()


@router.get("/investigations/{investigation_id}")
def v1_get_investigation(investigation_id: str,
                         user: dict = Depends(current_user)) -> dict:
    row = repository.get_row("agent_investigations", investigation_id)
    vehicle = repository.get_row("vehicles", str(row["vehicle_id"]))
    if user.get("role") != "admin" and str(vehicle.get("owner_id")) != str(user["id"]):
        raise HTTPException(status_code=403, detail="You do not own this vehicle.")
    return {"investigation": row}


@router.post("/investigations/{investigation_id}/review")
def v1_review_investigation(investigation_id: str, req: InvestigationReview,
                            user: dict = Depends(require_role("admin"))) -> dict:
    if req.decision not in ("approved", "rejected", "corrected"):
        raise HTTPException(status_code=422,
                            detail="decision must be approved | rejected | corrected")
    row = repository.get_row("agent_investigations", investigation_id)
    updated = repository.update_row("agent_investigations", investigation_id, {
        "status": "completed", "finished_at": db.now_iso(),
    })
    repository.audit(str(user["id"]), "investigation.reviewed", "investigation",
                     investigation_id, {"decision": req.decision, "note": req.note})
    return {"investigation": updated, "decision": req.decision,
            "reviewed_by": user["id"]}


@router.get("/vehicles/{vehicle_id}/trust-score")
def v1_trust_score(vehicle_id: str, user: dict = Depends(current_user)) -> dict:
    return vehicles.get_trust(vehicle_id, False, user)


@router.get("/vehicles/{vehicle_id}/evidence")
def v1_evidence(vehicle_id: str, user: dict = Depends(current_user)) -> dict:
    vehicles._vehicle(vehicle_id)
    rows = db.read("verification_evidence", where="vehicle_id = :v",
                   params={"v": vehicle_id}, limit=500)
    return {"items": rows, "total": len(rows)}


# ---- listings / marketplace ----------------------------------------------
@router.post("/vehicles/{vehicle_id}/listings", status_code=201)
def v1_create_listing(vehicle_id: str, req: ListingCreateV1,
                      user: dict = Depends(require_role("seller", "admin"))) -> dict:
    return marketplace.create_listing(marketplace.ListingCreate(
        vehicle_id=vehicle_id, **req.model_dump()), user)


@router.patch("/listings/{listing_id}")
def v1_update_listing(listing_id: str, req: marketplace.ListingUpdate,
                      user: dict = Depends(require_role("seller", "admin"))) -> dict:
    return marketplace.update_listing(listing_id, req, user)


@router.post("/listings/{listing_id}/publish")
def v1_publish(listing_id: str,
               user: dict = Depends(require_role("seller", "admin"))) -> dict:
    return marketplace.transition_listing(listing_id, "publish", user)


@router.post("/listings/{listing_id}/pause")
def v1_pause(listing_id: str,
             user: dict = Depends(require_role("seller", "admin"))) -> dict:
    return marketplace.transition_listing(listing_id, "pause", user)


@router.post("/listings/{listing_id}/mark-sold")
def v1_mark_sold(listing_id: str,
                 user: dict = Depends(require_role("seller", "admin"))) -> dict:
    return marketplace.transition_listing(listing_id, "sold", user)


@router.get("/marketplace/listings")
def v1_marketplace(limit: int = 20, offset: int = 0, brand: str | None = None,
                   price_min: int | None = None, price_max: int | None = None,
                   verified_only: bool = False, sort: str = "newest") -> dict:
    return marketplace.browse(limit, offset, brand, price_min, price_max,
                              verified_only, sort)


@router.get("/marketplace/listings/{listing_id}")
def v1_marketplace_detail(listing_id: str,
                          user: dict | None = Depends(optional_user)) -> dict:
    return marketplace.listing_detail(listing_id, user)


# ---- saved / comparisons --------------------------------------------------
@router.get("/saved-vehicles")
def v1_saved(user: dict = Depends(current_user)) -> dict:
    return marketplace.saved_list(user)


@router.post("/saved-vehicles/{vehicle_id}", status_code=201)
def v1_save_vehicle(vehicle_id: str, user: dict = Depends(current_user)) -> dict:
    listing = db.read("listings", where="vehicle_id = :v AND status = 'published'",
                      params={"v": vehicle_id}, limit=1)
    if not listing:
        raise HTTPException(status_code=409, detail="Vehicle has no published listing.")
    return marketplace.save_listing(marketplace.SavedCreate(listing_id=str(listing[0]["id"])),
                                    user)


@router.delete("/saved-vehicles/{vehicle_id}", status_code=204, response_class=Response)
def v1_unsave_vehicle(vehicle_id: str, user: dict = Depends(current_user)) -> Response:
    listing = db.read("listings", where="vehicle_id = :v", params={"v": vehicle_id}, limit=1)
    if not listing:
        raise HTTPException(status_code=404, detail="Vehicle has no listing.")
    return marketplace.unsave_listing(str(listing[0]["id"]), user)


@router.post("/comparisons")
def v1_comparisons(req: marketplace.CompareRequest,
                   user: dict | None = Depends(optional_user)) -> dict:
    return marketplace.compare(req, user)


# ---- inquiries ------------------------------------------------------------
@router.post("/listings/{listing_id}/inquiries", status_code=201)
def v1_create_inquiry(listing_id: str, req: InquiryCreateV1,
                      user: dict = Depends(require_role("buyer", "admin"))) -> dict:
    return inquiries.create_inquiry(inquiries.InquiryCreate(
        listing_id=listing_id, message=req.message, type=req.type), user)


@router.get("/inquiries")
def v1_list_inquiries(limit: int = 50, offset: int = 0,
                      user: dict = Depends(current_user)) -> dict:
    return inquiries.list_inquiries(limit, offset, user)


@router.get("/inquiries/{inquiry_id}")
def v1_get_inquiry(inquiry_id: str, user: dict = Depends(current_user)) -> dict:
    return inquiries.get_inquiry(inquiry_id, user)


@router.post("/inquiries/{inquiry_id}/messages", status_code=201)
def v1_inquiry_message(inquiry_id: str, req: inquiries.MessageCreate,
                       user: dict = Depends(current_user)) -> dict:
    return inquiries.add_message(inquiry_id, req, user)


@router.patch("/inquiries/{inquiry_id}/status")
def v1_inquiry_status(inquiry_id: str, req: inquiries.StatusUpdate,
                      user: dict = Depends(require_role("seller", "admin"))) -> dict:
    return inquiries.update_status(inquiry_id, req, user)


@router.post("/inquiries/{inquiry_id}/inspection-requests", status_code=201)
def v1_inspection_request(inquiry_id: str, req: InspectionRequest,
                          user: dict = Depends(current_user)) -> dict:
    msg = inquiries.add_message(inquiry_id, inquiries.MessageCreate(
        body=req.message, scheduled_at=req.scheduled_at), user)
    # Only a seller/admin may move the inquiry to 'scheduled'; a buyer request
    # leaves the status for the seller to accept.
    if user.get("role") in ("seller", "admin"):
        inquiries.update_status(inquiry_id, inquiries.StatusUpdate(status="scheduled"), user)
        status = "scheduled"
    else:
        status = "requested"
    return {"message": msg, "status": status}


# ---- reports / QR ---------------------------------------------------------
@router.post("/vehicles/{vehicle_id}/reports", status_code=201)
def v1_create_report(vehicle_id: str, req: ReportCreateV1,
                     user: dict = Depends(current_user)) -> dict:
    return reports.create_report(reports.ReportCreate(vehicle_id=vehicle_id, type=req.type),
                                 user)


@router.get("/reports/{report_id}")
def v1_get_report(report_id: str, user: dict = Depends(current_user)) -> dict:
    return reports.get_report(report_id, user)


@router.get("/reports/{report_id}/download")
def v1_download_report(report_id: str, user: dict | None = Depends(optional_user)):
    return reports.download_report(report_id, user)


@router.post("/vehicles/{vehicle_id}/qr-tokens")
def v1_qr_token(vehicle_id: str,
                user: dict = Depends(require_role("seller", "admin"))) -> dict:
    listing = db.read("listings", where="vehicle_id = :v", params={"v": vehicle_id}, limit=1)
    if not listing:
        raise HTTPException(status_code=409, detail="Create a listing before sharing.")
    return marketplace.share_listing(str(listing[0]["id"]), user)


@router.get("/public/vehicle-verification/{token}")
def v1_public_verify(token: str) -> dict:
    return reports.verify_token(token)


# ---- notifications --------------------------------------------------------
@router.get("/notifications")
def v1_notifications(limit: int = 50, offset: int = 0, unread_only: bool = False,
                     user: dict = Depends(current_user)) -> dict:
    return notifications.list_notifications(limit, offset, unread_only, user)


@router.patch("/notifications/{notification_id}/read")
def v1_read_notification(notification_id: str,
                         user: dict = Depends(current_user)) -> dict:
    return notifications.mark_read(notification_id, user)
