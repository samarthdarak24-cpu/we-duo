"""Buyer ↔ seller inquiries and messages."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import db, repository
from ..security import current_user, require_role

router = APIRouter(prefix="/api/backend/inquiries", tags=["inquiries"])

STATUSES = ("open", "replied", "scheduled", "accepted", "rejected", "closed")


class InquiryCreate(BaseModel):
    listing_id: str
    message: str = Field(min_length=2, max_length=1000)
    type: str = "general"


class MessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    offer_amount: int | None = Field(default=None, ge=0)
    scheduled_at: str | None = None


class StatusUpdate(BaseModel):
    status: str


def _inquiry(inquiry_id: str, user: dict) -> dict:
    row = repository.get_row("inquiries", inquiry_id)
    if user.get("role") != "admin" and str(user["id"]) not in (
        str(row.get("buyer_id")), str(row.get("seller_id"))
    ):
        raise HTTPException(status_code=403, detail="You are not part of this inquiry.")
    return row


@router.get("")
def list_inquiries(limit: int = 50, offset: int = 0,
                   user: dict = Depends(current_user)) -> dict:
    if user.get("role") == "buyer":
        rows = db.read("inquiries", where="buyer_id = :b", params={"b": user["id"]}, limit=500)
    elif user.get("role") == "seller":
        rows = db.read("inquiries", where="seller_id = :s", params={"s": user["id"]}, limit=500)
    else:
        rows = db.read("inquiries", limit=500)
    rows.sort(key=lambda r: str(r.get("last_activity_at") or r.get("created_at") or ""), reverse=True)
    return {"items": rows[offset:offset + limit], "total": len(rows),
            "limit": limit, "offset": offset}


@router.post("", status_code=201)
def create_inquiry(req: InquiryCreate, user: dict = Depends(require_role("buyer", "admin"))) -> dict:
    listing = repository.get_row("listings", req.listing_id)
    vehicle = repository.get_row("vehicles", str(listing["vehicle_id"]))
    seller_id = vehicle.get("owner_id")
    if str(seller_id) == str(user["id"]):
        raise HTTPException(status_code=409, detail="You cannot inquire about your own listing.")
    now = db.now_iso()
    inquiry = repository.create_row("inquiries", {
        "listing_id": req.listing_id, "buyer_id": user["id"], "seller_id": seller_id,
        "buyer_name": user.get("name"), "initials": user.get("initials"),
        "message": req.message, "type": req.type, "status": "open",
        "created_at": now, "last_activity_at": now,
    })
    repository.create_row("inquiry_messages", {
        "inquiry_id": inquiry["id"], "sender_id": user["id"],
        "sender_name": user.get("name"), "body": req.message,
        "attachments": "[]",
    })
    db.insert("notifications", {
        "id": db.new_id("notif"), "user_id": str(seller_id),
        "type": "inquiry", "title": "New buyer inquiry",
        "body": req.message[:200], "read": 0, "created_at": now,
    })
    repository.audit(str(user["id"]), "inquiry.created", "inquiry", inquiry["id"])
    return {"inquiry": inquiry}


@router.get("/{inquiry_id}")
def get_inquiry(inquiry_id: str, user: dict = Depends(current_user)) -> dict:
    inquiry = _inquiry(inquiry_id, user)
    messages = db.read("inquiry_messages", where="inquiry_id = :i",
                       params={"i": inquiry_id}, limit=500)
    messages.sort(key=lambda m: str(m.get("created_at") or ""))
    return {"inquiry": inquiry, "messages": messages}


@router.post("/{inquiry_id}/messages", status_code=201)
def add_message(inquiry_id: str, req: MessageCreate,
                user: dict = Depends(current_user)) -> dict:
    inquiry = _inquiry(inquiry_id, user)
    message = repository.create_row("inquiry_messages", {
        "inquiry_id": inquiry_id, "sender_id": user["id"],
        "sender_name": user.get("name"), "body": req.body,
        "offer_amount": req.offer_amount, "scheduled_at": req.scheduled_at,
        "attachments": "[]",
    })
    new_status = "replied" if str(user["id"]) == str(inquiry.get("seller_id")) else "open"
    repository.update_row("inquiries", inquiry_id, {
        "last_activity_at": db.now_iso(), "status": new_status,
    })
    other = inquiry.get("buyer_id") if str(user["id"]) == str(inquiry.get("seller_id")) else inquiry.get("seller_id")
    if other:
        db.insert("notifications", {
            "id": db.new_id("notif"), "user_id": str(other), "type": "inquiry",
            "title": "New message on your inquiry", "body": req.body[:200],
            "read": 0, "created_at": db.now_iso(),
        })
    return {"message": message}


@router.patch("/{inquiry_id}/status")
def update_status(inquiry_id: str, req: StatusUpdate,
                  user: dict = Depends(require_role("seller", "admin"))) -> dict:
    if req.status not in STATUSES:
        raise HTTPException(status_code=422, detail=f"status must be one of {STATUSES}")
    inquiry = _inquiry(inquiry_id, user)
    if user.get("role") == "seller" and str(inquiry.get("seller_id")) != str(user["id"]):
        raise HTTPException(status_code=403, detail="Only the listing seller can change this status.")
    updated = repository.update_row("inquiries", inquiry_id, {"status": req.status})
    repository.audit(str(user["id"]), "inquiry.status", "inquiry", inquiry_id,
                     {"status": req.status})
    return {"inquiry": updated}
