"""Marketplace, listings, search, saved vehicles, comparisons and sharing."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import urllib.parse

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import text

from .. import db, repository
from ..config import settings
from ..security import SECRET, assert_owner, current_user, optional_user, require_role

router = APIRouter(prefix="/api/backend", tags=["marketplace"])

LISTING_TRANSITIONS = {
    "publish": {"draft", "paused", "unpublished"},
    "pause": {"published"},
    "resume": {"paused"},
    "sold": {"published", "paused"},
}


class ListingCreate(BaseModel):
    vehicle_id: str
    headline: str = Field(min_length=4, max_length=140)
    description: str = ""
    condition: str = "used"
    location: str | None = None
    cover_image: str | None = None


class ListingUpdate(BaseModel):
    headline: str | None = None
    description: str | None = None
    condition: str | None = None
    location: str | None = None
    cover_image: str | None = None


class SearchRequest(BaseModel):
    brand: str | None = None
    price_min: int | None = Field(default=None, ge=0)
    price_max: int | None = Field(default=None, ge=0)
    year_min: int | None = Field(default=None, ge=1900, le=2100)
    year_max: int | None = Field(default=None, ge=1900, le=2100)
    km_max: int | None = Field(default=None, ge=0)
    location: str | None = None
    fuel: str | None = None
    transmission: str | None = None
    verified_only: bool = False
    sort: str = "newest"
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class SavedCreate(BaseModel):
    listing_id: str
    list_name: str = "default"


class CompareRequest(BaseModel):
    vehicle_ids: list[str] = Field(min_length=2, max_length=4)


class SuspiciousReport(BaseModel):
    reason: str = Field(min_length=5, max_length=500)


def _signed_share(jti: str, vehicle_id: str) -> str:
    raw = f"{jti}.{vehicle_id}"
    secret = os.getenv("TD_SHARE_SECRET") or SECRET
    sig = hmac.new(secret.encode(), raw.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{raw}.{sig}"


def _search(req: SearchRequest) -> dict:
    where = ["l.status = 'published'"]
    params: dict = {}
    if req.brand:
        where.append("LOWER(v.make) LIKE :brand")
        params["brand"] = f"%{req.brand.lower()}%"
    if req.price_min is not None:
        where.append("v.asking_price >= :pmin")
        params["pmin"] = req.price_min
    if req.price_max is not None:
        where.append("v.asking_price <= :pmax")
        params["pmax"] = req.price_max
    if req.year_min is not None:
        where.append("v.year >= :ymin")
        params["ymin"] = req.year_min
    if req.year_max is not None:
        where.append("v.year <= :ymax")
        params["ymax"] = req.year_max
    if req.km_max is not None:
        where.append("v.km_claimed <= :kmmax")
        params["kmmax"] = req.km_max
    if req.location:
        where.append("LOWER(v.location) LIKE :loc")
        params["loc"] = f"%{req.location.lower()}%"
    if req.fuel:
        where.append("v.fuel = :fuel")
        params["fuel"] = req.fuel
    if req.transmission:
        where.append("v.transmission = :trans")
        params["trans"] = req.transmission
    if req.verified_only:
        where.append("EXISTS (SELECT 1 FROM trust_scores t WHERE t.vehicle_id = v.id AND t.score >= 70)")
    order = {
        "price_asc": "v.asking_price ASC", "price_desc": "v.asking_price DESC",
        "year_desc": "v.year DESC", "km_asc": "v.km_claimed ASC",
    }.get(req.sort, "l.created_at DESC")
    where_sql = " AND ".join(where)
    base = f"""FROM listings l JOIN vehicles v ON v.id = l.vehicle_id
               WHERE {where_sql}"""
    params.update({"_limit": req.limit, "_offset": req.offset})
    with db.engine().connect() as conn:
        rows = [dict(r) for r in conn.execute(text(
            f"""SELECT l.id AS listing_id, l.status AS listing_status, l.headline, l.views, l.saves,
                       l.inquiries, l.cover_image, l.created_at AS listed_at,
                       v.id AS vehicle_id, v.make, v.model, v.variant, v.year, v.reg_no,
                       v.fuel, v.transmission, v.km_claimed, v.asking_price, v.location, v.color
                {base} ORDER BY {order} LIMIT :_limit OFFSET :_offset"""), params).mappings().all()]
        total = conn.execute(text(f"SELECT COUNT(*) {base}"),
                             {k: v for k, v in params.items() if not k.startswith("_")}).scalar()
    return {"items": rows, "total": int(total or 0), "limit": req.limit, "offset": req.offset}


@router.get("/marketplace/listings")
def browse(limit: int = 20, offset: int = 0, brand: str | None = None,
           price_min: int | None = None, price_max: int | None = None,
           verified_only: bool = False, sort: str = "newest") -> dict:
    return _search(SearchRequest(limit=limit, offset=offset, brand=brand,
                                 price_min=price_min, price_max=price_max,
                                 verified_only=verified_only, sort=sort))


@router.get("/marketplace/listings/{listing_id}")
def listing_detail(listing_id: str, user: dict | None = Depends(optional_user)) -> dict:
    listing = repository.get_row("listings", listing_id)
    vehicle = repository.get_row("vehicles", str(listing["vehicle_id"]))
    trust = db.read("trust_scores", where="vehicle_id = :v", params={"v": vehicle["id"]},
                    limit=1)
    return {"listing": listing, "vehicle": vehicle,
            "trust": trust[0] if trust else None}


@router.post("/marketplace/search")
def search(req: SearchRequest) -> dict:
    return _search(req)


# ---- seller listings ------------------------------------------------------
@router.get("/seller/listings")
def my_listings(limit: int = 50, offset: int = 0,
                user: dict = Depends(require_role("seller", "admin"))) -> dict:
    if user.get("role") == "admin":
        return repository.list_rows("listings", limit=limit, offset=offset, order_by="created_at")
    vehicles = db.read("vehicles", where="owner_id = :o", params={"o": user["id"]}, limit=500)
    vids = {str(v["id"]) for v in vehicles}
    rows = db.read("listings", limit=500)
    mine = [r for r in rows if str(r.get("vehicle_id")) in vids]
    mine.sort(key=lambda r: str(r.get("created_at") or ""), reverse=True)
    return {"items": mine[offset:offset + limit], "total": len(mine),
            "limit": limit, "offset": offset}


@router.post("/seller/listings", status_code=201)
def create_listing(req: ListingCreate,
                   user: dict = Depends(require_role("seller", "admin"))) -> dict:
    vehicle = repository.get_row("vehicles", req.vehicle_id)
    assert_owner(user, vehicle.get("owner_id"))
    existing = db.read("listings", where="vehicle_id = :v", params={"v": req.vehicle_id}, limit=1)
    if existing:
        raise HTTPException(status_code=409, detail="This vehicle already has a listing.")
    listing = repository.create_row("listings", {
        "vehicle_id": req.vehicle_id, "status": "draft", "headline": req.headline,
        "description": req.description, "condition": req.condition,
        "location": req.location or vehicle.get("location"),
        "cover_image": req.cover_image, "views": 0, "saves": 0, "inquiries": 0,
    })
    repository.audit(str(user["id"]), "listing.created", "listing", listing["id"])
    return {"listing": listing}


@router.patch("/seller/listings/{listing_id}")
def update_listing(listing_id: str, req: ListingUpdate,
                   user: dict = Depends(require_role("seller", "admin"))) -> dict:
    listing = repository.get_row("listings", listing_id)
    vehicle = repository.get_row("vehicles", str(listing["vehicle_id"]))
    assert_owner(user, vehicle.get("owner_id"))
    updated = repository.update_row("listings", listing_id, req.model_dump(exclude_none=True))
    return {"listing": updated}


# Seller-prefixed share aliases (registered before the {action} route so they win).
@router.post("/seller/listings/{listing_id}/share")
def share_listing_seller(listing_id: str,
                         user: dict = Depends(require_role("seller", "admin"))) -> dict:
    return share_listing(listing_id, user)


@router.delete("/seller/listings/{listing_id}/share", status_code=204, response_class=Response)
def revoke_share_seller(listing_id: str,
                        user: dict = Depends(require_role("seller", "admin"))) -> Response:
    return revoke_share(listing_id, user)


@router.post("/seller/listings/{listing_id}/{action}")
def transition_listing(listing_id: str, action: str,
                       user: dict = Depends(require_role("seller", "admin"))) -> dict:
    if action not in LISTING_TRANSITIONS:
        raise HTTPException(status_code=422, detail=f"action must be one of {list(LISTING_TRANSITIONS)}")
    listing = repository.get_row("listings", listing_id)
    vehicle = repository.get_row("vehicles", str(listing["vehicle_id"]))
    assert_owner(user, vehicle.get("owner_id"))
    current = str(listing.get("status") or "draft")
    if current not in LISTING_TRANSITIONS[action]:
        raise HTTPException(status_code=409,
                            detail=f"Cannot '{action}' a listing in status '{current}'.")
    data = {"status": "published" if action in ("publish", "resume") else
            ("paused" if action == "pause" else "sold")}
    if action == "publish" and not listing.get("published_at"):
        data["published_at"] = db.now_iso()
    updated = repository.update_row("listings", listing_id, data)
    repository.audit(str(user["id"]), f"listing.{action}", "listing", listing_id,
                     {"from": current, "to": data["status"]})
    return {"listing": updated}


@router.get("/listings/{listing_id}/stats")
def listing_stats(listing_id: str, user: dict = Depends(current_user)) -> dict:
    listing = repository.get_row("listings", listing_id)
    inquiries = db.scalar("SELECT COUNT(*) FROM inquiries WHERE listing_id = :l", {"l": listing_id})
    return {"views": listing.get("views", 0), "saves": listing.get("saves", 0),
            "inquiries": int(inquiries or 0)}


@router.post("/listings/{listing_id}/share")
def share_listing(listing_id: str,
                  user: dict = Depends(require_role("seller", "admin"))) -> dict:
    listing = repository.get_row("listings", listing_id)
    vehicle = repository.get_row("vehicles", str(listing["vehicle_id"]))
    assert_owner(user, vehicle.get("owner_id"))
    jti = db.new_id("qr")
    token = _signed_share(jti, str(vehicle["id"]))
    db.insert("qr_tokens", {
        "jti": jti, "vehicle_id": str(vehicle["id"]), "token": token,
        "created_by": str(user["id"]), "created_at": db.now_iso(),
    })
    base = "http://localhost:3000"
    return {
        "token": token, "jti": jti,
        "verify_url": f"{base}/verify/{urllib.parse.quote(token)}",
        "listing_url": f"{base}/vehicle/{vehicle['id']}",
        "note": "Signed, revocable token. Buyers see a consent-filtered summary only.",
    }


@router.delete("/listings/{listing_id}/share", status_code=204, response_class=Response)
def revoke_share(listing_id: str,
                 user: dict = Depends(require_role("seller", "admin"))) -> Response:
    listing = repository.get_row("listings", listing_id)
    vehicle = repository.get_row("vehicles", str(listing["vehicle_id"]))
    assert_owner(user, vehicle.get("owner_id"))
    with db.engine().begin() as conn:
        conn.execute(text('UPDATE "qr_tokens" SET revoked_at = :t WHERE vehicle_id = :v AND revoked_at IS NULL'),
                     {"t": db.now_iso(), "v": vehicle["id"]})
    repository.audit(str(user["id"]), "listing.share_revoked", "vehicle", str(vehicle["id"]))
    return Response(status_code=204)


@router.post("/listings/{listing_id}/report-suspicious", status_code=201)
def report_suspicious(listing_id: str, req: SuspiciousReport,
                      user: dict = Depends(current_user)) -> dict:
    listing = repository.get_row("listings", listing_id)
    vehicle_id = str(listing["vehicle_id"])
    finding = repository.create_row("findings", {
        "vehicle_id": vehicle_id, "rule_key": "buyer_report", "code": "suspicious_listing",
        "severity": "medium", "title": "Buyer reported a suspicious listing",
        "explanation": req.reason, "recommendation": "Moderator review required.",
        "evidence": json.dumps({"listing_id": listing_id, "reporter_id": user["id"]}),
        "points": 0, "status": "open",
    })
    repository.audit(str(user["id"]), "listing.reported", "finding", finding["id"],
                     {"listing_id": listing_id})
    return {"finding": finding}


# ---- saved ----------------------------------------------------------------
@router.get("/saved")
def saved_list(user: dict = Depends(current_user)) -> dict:
    rows = db.read("saved_vehicles", where="buyer_id = :b", params={"b": user["id"]}, limit=200)
    return {"items": rows, "total": len(rows)}


@router.post("/saved", status_code=201)
def save_listing(req: SavedCreate, user: dict = Depends(current_user)) -> dict:
    listing = repository.get_row("listings", req.listing_id)
    existing = db.read("saved_vehicles",
                       where="buyer_id = :b AND listing_id = :l",
                       params={"b": user["id"], "l": req.listing_id}, limit=1)
    if existing:
        return {"saved": existing[0], "created": False}
    vehicle = db.read("vehicles", where="id = :id", params={"id": listing["vehicle_id"]}, limit=1)
    row = repository.create_row("saved_vehicles", {
        "buyer_id": user["id"], "listing_id": req.listing_id,
        "price_at_save": vehicle[0].get("asking_price") if vehicle else None,
        "list_name": req.list_name,
    })
    return {"saved": row, "created": True}


@router.delete("/saved/{listing_id}", status_code=204, response_class=Response)
def unsave_listing(listing_id: str, user: dict = Depends(current_user)) -> Response:
    rows = db.read("saved_vehicles", where="buyer_id = :b AND listing_id = :l",
                   params={"b": user["id"], "l": listing_id}, limit=1)
    if not rows:
        raise HTTPException(status_code=404, detail="Saved vehicle not found.")
    repository.hard_delete("saved_vehicles", str(rows[0]["id"]))
    return Response(status_code=204)


@router.get("/saved-searches")
def saved_searches(user: dict = Depends(current_user)) -> dict:
    rows = db.read("saved_searches", where="buyer_id = :b", params={"b": user["id"]}, limit=100)
    return {"items": rows, "total": len(rows)}


@router.post("/saved-searches", status_code=201)
def create_saved_search(req: SearchRequest, user: dict = Depends(current_user)) -> dict:
    row = repository.create_row("saved_searches", {
        "buyer_id": user["id"], "name": f"Search {req.brand or 'all'}",
        "filters": json.dumps(req.model_dump()), "alerts_enabled": 0,
    })
    return {"saved_search": row}


# ---- compare --------------------------------------------------------------
@router.post("/compare")
def compare(req: CompareRequest, user: dict | None = Depends(optional_user)) -> dict:
    if len(set(req.vehicle_ids)) != len(req.vehicle_ids):
        raise HTTPException(status_code=422, detail="Duplicate vehicle ids in comparison.")
    items = []
    for vid in req.vehicle_ids:
        vehicle = repository.get_row("vehicles", vid)
        trust = db.read("trust_scores", where="vehicle_id = :v", params={"v": vid}, limit=1)
        mileage = db.read("mileage_readings", where="vehicle_id = :v", params={"v": vid}, limit=500)
        items.append({
            "vehicle": vehicle,
            "trust": trust[0] if trust else None,
            "mileage_readings": len(mileage),
            "latest_km": max([int(m["km"]) for m in mileage if isinstance(m.get("km"), (int, float))],
                             default=None),
        })
    return {"items": items, "count": len(items),
            "note": "Comparison uses persisted records only; missing data is shown as unverified."}
