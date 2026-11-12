"""Vehicles, documents, history, mileage, damage, inspections, verification, AI."""
from __future__ import annotations

import json
import re

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .. import categories, db, detectors, explain, repository
from ..config import settings
from ..intelligence.damage import yolo
from ..intelligence import ocr as ocr_module
from ..security import assert_owner, current_user, require_role

router = APIRouter(prefix="/api/backend/vehicles", tags=["vehicles"])

VIN_RE = re.compile(r"^[A-HJ-NPR-Z0-9]{17}$", re.I)
REG_RE = re.compile(r"^[A-Z]{2}[-\s]?\d{1,2}[-\s]?[A-Z]{0,3}[-\s]?\d{1,4}$", re.I)
SHA_RE = re.compile(r"^[a-f0-9]{64}$", re.I)


# ---- models ---------------------------------------------------------------
class VehicleCreate(BaseModel):
    make: str = Field(min_length=1, max_length=40)
    model: str = Field(min_length=1, max_length=60)
    variant: str | None = None
    year: int = Field(ge=1900, le=2100)
    reg_no: str
    vin: str | None = None
    fuel: str | None = None
    transmission: str | None = None
    category: str | None = None
    color: str | None = None
    ownership_count: int = Field(default=1, ge=0, le=20)
    location: str | None = None
    km_claimed: int = Field(default=0, ge=0, le=2_000_000)
    asking_price: int = Field(default=0, ge=0)


class VehicleUpdate(BaseModel):
    make: str | None = None
    model: str | None = None
    variant: str | None = None
    year: int | None = Field(default=None, ge=1900, le=2100)
    fuel: str | None = None
    transmission: str | None = None
    color: str | None = None
    ownership_count: int | None = Field(default=None, ge=0, le=20)
    location: str | None = None
    km_claimed: int | None = Field(default=None, ge=0, le=2_000_000)
    asking_price: int | None = Field(default=None, ge=0)
    description: str | None = None


class DocumentCreate(BaseModel):
    type: str
    file_name: str
    file_key: str | None = None
    mime: str | None = None
    size_bytes: int | None = Field(default=None, ge=0, le=25 * 1024 * 1024)
    sha256: str


class HistoryCreate(BaseModel):
    category: str
    event_date: str
    mileage_km: int | None = Field(default=None, ge=0, le=2_000_000)
    title: str
    description: str = ""
    source: str = "seller_reported"
    evidence_document_id: str | None = None


class CorrectionCreate(BaseModel):
    title: str
    description: str
    reason: str = Field(min_length=3, max_length=400)


class MileageCreate(BaseModel):
    km: int = Field(ge=0, le=2_000_000)
    date: str
    source: str = "seller_claim"
    document_id: str | None = None


class DamageCreate(BaseModel):
    zone_id: str
    description: str
    severity: str = "medium"
    repair_status: str = "unknown"
    repair_details: str | None = None
    inspection_date: str | None = None
    status: str = "reported"
    photo_keys: list[str] = Field(default_factory=list)


class InspectionCreate(BaseModel):
    inspection_date: str
    inspection_type: str = "pre_purchase"
    odometer_km: int | None = None
    structural_damage: bool | None = None
    passed: bool | None = None
    score: float | None = None
    summary: str = ""
    status: str = "pending"


class AccidentCreate(BaseModel):
    event_date: str
    severity: str
    description: str
    repair_status: str = "unknown"
    damage_zones: list[str] = Field(default_factory=list)
    estimated_cost: int | None = None


class PhotoCreate(BaseModel):
    file_key: str
    kind: str = "photo"
    caption: str = ""
    sha256: str | None = None
    bytes: int | None = None
    mime: str | None = None


class DamageReview(BaseModel):
    status: str  # verified | rejected
    component_id: str | None = None
    severity: str | None = None
    repair_status: str | None = None


class OcrCorrection(BaseModel):
    fields: dict


# ---- helpers --------------------------------------------------------------
def _vehicle(vehicle_id: str) -> dict:
    return repository.get_row("vehicles", vehicle_id)


def _owned(vehicle_id: str, user: dict) -> dict:
    v = _vehicle(vehicle_id)
    assert_owner(user, v.get("owner_id"))
    return v


def _trustdrive_id() -> str:
    return "TD-" + db.new_id("v").split("-", 1)[1].upper()


# Categories whose damage CV detector (car_damage.pt, car-only) is applicable.
_CAR_TAXONOMY_IDS = {
    "passenger_car", "electric_car", "hybrid_car", "hatchback", "suv", "muv",
}
_CAR_LEGACY_LABELS = {
    "car", "sedan", "suv", "muv", "hatchback", "hybrid", "electric_car",
    "hybrid_car", "4-wheeler", "four wheeler", "passenger_car",
}


def _is_car_category(vehicle: dict) -> bool:
    """Whether the car-only damage CV detector applies to this vehicle.

    Authoritative signal is the category spec's damage detector (only the "car"
    detector reports ``status: available``); legacy ``category`` labels are a
    fallback so older rows are handled honestly.
    """
    cid = vehicle.get("vehicle_category_id") or vehicle.get("category")
    if cid:
        try:
            det = categories.damage_detector_for(str(cid))
            if det.get("status") == "available" and det.get("engine") in ("ultralytics", "onnxruntime"):
                return True
        except Exception:
            pass
    label = str(vehicle.get("category") or "").strip().lower()
    if label in _CAR_LEGACY_LABELS:
        return True
    if cid and str(cid).lower() in _CAR_LEGACY_LABELS:
        return True
    return False


# ---- vehicles -------------------------------------------------------------
@router.get("")
def list_vehicles(limit: int = 50, offset: int = 0, status: str | None = None,
                  user: dict = Depends(current_user)) -> dict:
    if user.get("role") == "buyer":
        # Buyers only see vehicles with a published listing (no drafts).
        listings = repository.list_rows("listings", filters={"status": "published"},
                                        limit=limit, offset=offset, order_by="created_at")
        ids = [str(r["vehicle_id"]) for r in listings["items"]]
        items = []
        for vid in ids:
            rows = db.read("vehicles", where="id = :id", params={"id": vid}, limit=1)
            if rows:
                items.append(rows[0])
        return {"items": items, "total": listings["total"],
                "limit": listings["limit"], "offset": listings["offset"]}
    filters: dict = {"status": status}
    if user.get("role") == "seller":
        filters["owner_id"] = user["id"]
    return repository.list_rows("vehicles", filters=filters, limit=limit, offset=offset,
                                order_by="created_at", search=None)


@router.post("", status_code=201)
def create_vehicle(req: VehicleCreate, user: dict = Depends(require_role("seller", "admin"))) -> dict:
    reg = req.reg_no.replace(" ", "").upper()
    if not REG_RE.match(reg):
        raise HTTPException(status_code=422, detail="Registration number is not a valid Indian format.")
    if req.vin and not VIN_RE.match(req.vin):
        raise HTTPException(status_code=422, detail="VIN must be 17 characters (no I, O, Q).")
    if db.read("vehicles", where="reg_no = :r", params={"r": reg}, limit=1):
        raise HTTPException(status_code=409, detail="A vehicle with this registration already exists.")
    if req.vin and db.read("vehicles", where="vin = :v", params={"v": req.vin.upper()}, limit=1):
        raise HTTPException(status_code=409, detail="A vehicle with this VIN already exists.")
    now = db.now_iso()
    vid = db.new_id("v")
    ok, reason = db.insert("vehicles", {
        "id": vid, "owner_id": user["id"], "make": req.make, "model": req.model,
        "variant": req.variant, "year": req.year, "reg_no": reg,
        "vin": req.vin.upper() if req.vin else None, "fuel": req.fuel,
        "transmission": req.transmission, "category": req.category, "color": req.color,
        "ownership_count": req.ownership_count, "location": req.location,
        "km_claimed": req.km_claimed, "asking_price": req.asking_price,
        "status": "draft", "trustdrive_id": _trustdrive_id(),
        "condition": "used", "description": "", "created_at": now, "updated_at": now,
    })
    if not ok:
        raise HTTPException(status_code=422, detail=f"Could not create vehicle: {reason}")
    repository.audit(str(user["id"]), "vehicle.created", "vehicle", vid, {"reg_no": reg})
    return {"vehicle": repository.get_row("vehicles", vid)}


@router.get("/{vehicle_id}")
def get_vehicle(vehicle_id: str, user: dict = Depends(current_user)) -> dict:
    v = _vehicle(vehicle_id)
    counts = {
        "documents": db.scalar('SELECT COUNT(*) FROM documents WHERE vehicle_id = :v', {"v": vehicle_id}),
        "mileage_readings": db.scalar('SELECT COUNT(*) FROM mileage_readings WHERE vehicle_id = :v', {"v": vehicle_id}),
        "damage_records": db.scalar('SELECT COUNT(*) FROM damage_records WHERE vehicle_id = :v', {"v": vehicle_id}),
        "findings": db.scalar('SELECT COUNT(*) FROM findings WHERE vehicle_id = :v', {"v": vehicle_id}),
        "chain_records": db.scalar('SELECT COUNT(*) FROM chain_records WHERE vehicle_id = :v', {"v": vehicle_id}),
    }
    return {"vehicle": v, "counts": counts}


@router.patch("/{vehicle_id}")
def update_vehicle(vehicle_id: str, req: VehicleUpdate,
                   user: dict = Depends(require_role("seller", "admin"))) -> dict:
    _owned(vehicle_id, user)
    data = req.model_dump(exclude_none=True)
    updated = repository.update_row("vehicles", vehicle_id, data)
    repository.audit(str(user["id"]), "vehicle.updated", "vehicle", vehicle_id,
                     {"fields": list(data)})
    return {"vehicle": updated}


@router.post("/{vehicle_id}/archive")
def archive_vehicle(vehicle_id: str, user: dict = Depends(require_role("seller", "admin"))) -> dict:
    _owned(vehicle_id, user)
    cols = db.columns("vehicles")
    data = {"status": "archived"}
    if "archived_at" in cols:
        data["archived_at"] = db.now_iso()
    updated = repository.update_row("vehicles", vehicle_id, data)
    repository.audit(str(user["id"]), "vehicle.archived", "vehicle", vehicle_id)
    return {"vehicle": updated}


# ---- documents ------------------------------------------------------------
@router.get("/{vehicle_id}/documents")
def list_documents(vehicle_id: str, user: dict = Depends(current_user)) -> dict:
    _vehicle(vehicle_id)
    rows = db.read("documents", where="vehicle_id = :v", params={"v": vehicle_id}, limit=200)
    rows = [r for r in rows if not r.get("deleted_at")]
    return {"items": rows, "total": len(rows)}


@router.post("/{vehicle_id}/documents", status_code=201)
def register_document(vehicle_id: str, req: DocumentCreate,
                      user: dict = Depends(require_role("seller", "admin"))) -> dict:
    _owned(vehicle_id, user)
    if not SHA_RE.match(req.sha256):
        raise HTTPException(status_code=422, detail="sha256 must be 64 hexadecimal characters.")
    if not req.file_key:
        raise HTTPException(status_code=422,
                            detail="file_key is required: binary upload is handled by the web API; this endpoint registers metadata.")
    doc = repository.create_row("documents", {
        "vehicle_id": vehicle_id, "type": req.type, "file_name": req.file_name,
        "mime": req.mime, "size_bytes": req.size_bytes, "status": "pending",
        "sha256": req.sha256.lower(), "file_key": req.file_key,
        "uploaded_at": db.now_iso(), "consent": 1, "version": 1,
    })
    repository.audit(str(user["id"]), "document.registered", "document", doc["id"],
                     {"type": req.type})
    return {"document": doc}


@router.delete("/{vehicle_id}/documents/{document_id}", status_code=204,
               response_class=Response)
def delete_document(vehicle_id: str, document_id: str,
                    user: dict = Depends(require_role("seller", "admin"))) -> Response:
    """Soft delete: the document row, hash and audit trail are retained."""
    _owned(vehicle_id, user)
    doc = repository.get_row("documents", document_id)
    if str(doc.get("vehicle_id")) != vehicle_id or doc.get("deleted_at"):
        raise HTTPException(status_code=404, detail="Document not found for this vehicle.")
    repository.soft_delete("documents", document_id)
    repository.audit(str(user["id"]), "document.soft_deleted", "document", document_id)
    return Response(status_code=204)


@router.get("/{vehicle_id}/documents/completeness")
def document_completeness(vehicle_id: str, user: dict = Depends(current_user)) -> dict:
    _vehicle(vehicle_id)
    rows = db.read("documents", where="vehicle_id = :v", params={"v": vehicle_id}, limit=200)
    rows = [r for r in rows if not r.get("deleted_at")]
    expected = ["rc", "insurance", "puc", "service"]
    present = {str(r.get("type")): str(r.get("status")) for r in rows}
    return {
        "vehicle_id": vehicle_id,
        "expected": expected,
        "present": present,
        "missing": [t for t in expected if t not in present],
        "verified": [t for t, s in present.items() if s == "verified"],
        "completeness": round(len([t for t in expected if t in present]) / len(expected), 2),
    }


# ---- history --------------------------------------------------------------
@router.get("/{vehicle_id}/history")
def list_history(vehicle_id: str, user: dict = Depends(current_user)) -> dict:
    _vehicle(vehicle_id)
    rows = db.read("history_events", where="vehicle_id = :v", params={"v": vehicle_id}, limit=200)
    return {"items": rows, "total": len(rows)}


@router.post("/{vehicle_id}/history", status_code=201)
def add_history(vehicle_id: str, req: HistoryCreate,
                user: dict = Depends(require_role("seller", "admin"))) -> dict:
    _owned(vehicle_id, user)
    event = repository.create_row("history_events", {
        "vehicle_id": vehicle_id, "category": req.category, "event_date": req.event_date,
        "mileage_km": req.mileage_km, "title": req.title, "description": req.description,
        "source": req.source, "evidence_document_id": req.evidence_document_id,
        "status": "pending", "created_by": user["id"],
    })
    repository.audit(str(user["id"]), "history.added", "history_event", event["id"],
                     {"category": req.category})
    return {"event": event}


@router.post("/{vehicle_id}/history/{event_id}/correction", status_code=201)
def correct_history(vehicle_id: str, event_id: str, req: CorrectionCreate,
                    user: dict = Depends(require_role("seller", "admin"))) -> dict:
    _owned(vehicle_id, user)
    original = repository.get_row("history_events", event_id)
    if str(original.get("vehicle_id")) != vehicle_id:
        raise HTTPException(status_code=404, detail="Event does not belong to this vehicle.")
    # Never overwrite: append a correction that supersedes the original.
    correction = repository.create_row("history_events", {
        "vehicle_id": vehicle_id, "category": original.get("category"),
        "event_date": original.get("event_date"), "mileage_km": original.get("mileage_km"),
        "title": req.title, "description": req.description, "source": "correction",
        "status": "corrected", "supersedes_id": event_id, "created_by": user["id"],
    })
    repository.audit(str(user["id"]), "history.corrected", "history_event", event_id,
                     {"correction_id": correction["id"], "reason": req.reason})
    return {"correction": correction, "supersedes": event_id}


# ---- mileage --------------------------------------------------------------
@router.get("/{vehicle_id}/mileage")
def list_mileage(vehicle_id: str, user: dict = Depends(current_user)) -> dict:
    _vehicle(vehicle_id)
    rows = db.read("mileage_readings", where="vehicle_id = :v", params={"v": vehicle_id}, limit=500)
    rows.sort(key=lambda r: (str(r.get("date") or ""), str(r.get("id"))))
    return {"items": rows, "total": len(rows)}


@router.post("/{vehicle_id}/mileage", status_code=201)
def add_mileage(vehicle_id: str, req: MileageCreate,
                user: dict = Depends(require_role("seller", "admin"))) -> dict:
    _owned(vehicle_id, user)
    existing = db.read("mileage_readings", where="vehicle_id = :v", params={"v": vehicle_id}, limit=500)
    kms = [int(r["km"]) for r in existing if isinstance(r.get("km"), (int, float))]
    flagged = 1 if (kms and req.km < max(kms)) else 0
    reading = repository.create_row("mileage_readings", {
        "vehicle_id": vehicle_id, "km": req.km, "date": req.date, "source": req.source,
        "year": req.date[:4], "flagged": flagged, "verified": 0, "is_seller_claim": 1,
        "document_id": req.document_id,
    })
    if flagged:
        db.insert("findings", {
            "id": db.new_id("find"), "vehicle_id": vehicle_id, "rule_key": "mileage_decrease",
            "code": "mileage_decrease", "severity": "high",
            "title": "Odometer reading lower than an earlier reading",
            "explanation": f"New reading {req.km:,} km on {req.date} is below the previous maximum {max(kms):,} km.",
            "recommendation": "Verify both source documents with an inspector.",
            "evidence": json.dumps([reading["id"]]), "points": 20, "status": "open",
            "created_at": db.now_iso(),
        })
    repository.audit(str(user["id"]), "mileage.added", "mileage_reading", reading["id"],
                     {"km": req.km, "flagged": flagged})
    return {"reading": reading, "flagged": bool(flagged)}


# ---- damage / inspections / accidents / photos ----------------------------
@router.get("/{vehicle_id}/damage")
def list_damage(vehicle_id: str, user: dict = Depends(current_user)) -> dict:
    _vehicle(vehicle_id)
    rows = db.read("damage_records", where="vehicle_id = :v", params={"v": vehicle_id}, limit=200)
    return {"items": rows, "total": len(rows)}


@router.post("/{vehicle_id}/damage", status_code=201)
def add_damage(vehicle_id: str, req: DamageCreate,
               user: dict = Depends(require_role("seller", "admin"))) -> dict:
    _owned(vehicle_id, user)
    record = repository.create_row("damage_records", {
        "vehicle_id": vehicle_id, "zone_id": req.zone_id, "description": req.description,
        "severity": req.severity, "repair_status": req.repair_status,
        "repair_details": req.repair_details, "inspection_date": req.inspection_date,
        "status": req.status, "photo_keys": json.dumps(req.photo_keys),
        "created_by": user["id"],
    })
    repository.audit(str(user["id"]), "damage.added", "damage_record", record["id"],
                     {"zone_id": req.zone_id})
    return {"damage": record}


@router.get("/{vehicle_id}/inspections")
def list_inspections(vehicle_id: str, user: dict = Depends(current_user)) -> dict:
    _vehicle(vehicle_id)
    rows = db.read("vehicle_inspections", where="vehicle_id = :v", params={"v": vehicle_id}, limit=100)
    return {"items": rows, "total": len(rows)}


@router.post("/{vehicle_id}/inspections", status_code=201)
def add_inspection(vehicle_id: str, req: InspectionCreate,
                   user: dict = Depends(require_role("seller", "admin"))) -> dict:
    _owned(vehicle_id, user)
    if req.status not in ("pending", "approved", "rejected", "superseded"):
        raise HTTPException(status_code=422, detail="Invalid inspection status.")
    rec = repository.create_row("vehicle_inspections", {
        "vehicle_id": vehicle_id, "inspection_type": req.inspection_type,
        "inspection_date": req.inspection_date, "odometer_km": req.odometer_km,
        "structural_damage": None if req.structural_damage is None else int(req.structural_damage),
        "passed": None if req.passed is None else int(req.passed), "score": req.score,
        "status": req.status, "summary": req.summary,
    })
    repository.audit(str(user["id"]), "inspection.added", "vehicle_inspection", rec["id"])
    return {"inspection": rec}


@router.get("/{vehicle_id}/accidents")
def list_accidents(vehicle_id: str, user: dict = Depends(current_user)) -> dict:
    _vehicle(vehicle_id)
    rows = db.read("accident_records", where="vehicle_id = :v", params={"v": vehicle_id}, limit=100)
    return {"items": rows, "total": len(rows)}


@router.post("/{vehicle_id}/accidents", status_code=201)
def add_accident(vehicle_id: str, req: AccidentCreate,
                 user: dict = Depends(require_role("seller", "admin"))) -> dict:
    _owned(vehicle_id, user)
    if req.severity not in ("minor", "moderate", "severe", "structural", "unknown"):
        raise HTTPException(status_code=422, detail="Invalid accident severity.")
    if req.repair_status not in ("unknown", "inspected", "repaired", "replaced", "ongoing", "not_repaired"):
        raise HTTPException(status_code=422, detail="Invalid repair status.")
    rec = repository.create_row("accident_records", {
        "vehicle_id": vehicle_id, "event_date": req.event_date, "severity": req.severity,
        "description": req.description, "repair_status": req.repair_status,
        "damage_zones": json.dumps(req.damage_zones), "estimated_cost": req.estimated_cost,
        "created_by": user["id"],
    })
    repository.audit(str(user["id"]), "accident.added", "accident_record", rec["id"])
    return {"accident": rec}


@router.get("/{vehicle_id}/photos")
def list_photos(vehicle_id: str, user: dict = Depends(current_user)) -> dict:
    _vehicle(vehicle_id)
    rows = db.read("vehicle_images", where="vehicle_id = :v", params={"v": vehicle_id}, limit=200)
    return {"items": [r for r in rows if not r.get("deleted_at")], "total": len(rows)}


@router.post("/{vehicle_id}/photos", status_code=201)
def add_photo(vehicle_id: str, req: PhotoCreate,
              user: dict = Depends(require_role("seller", "admin"))) -> dict:
    _owned(vehicle_id, user)
    if req.sha256 and not SHA_RE.match(req.sha256):
        raise HTTPException(status_code=422, detail="sha256 must be 64 hexadecimal characters.")
    rec = repository.create_row("vehicle_images", {
        "vehicle_id": vehicle_id, "file_key": req.file_key, "kind": req.kind,
        "caption": req.caption, "sha256": req.sha256, "bytes": req.bytes,
        "mime": req.mime, "uploaded_by": user["id"],
    })
    return {"photo": rec}


# ---- damage CV detection + human review ------------------------------------
@router.post("/{vehicle_id}/photos/{photo_id}/detect")
def detect_damage_on_photo(vehicle_id: str, photo_id: str,
                           user: dict = Depends(require_role("seller", "admin"))) -> dict:
    """Run the car-only damage CV detector on one photo.

    Authoritative only for car categories; non-car categories return 409 with
    ``available: false``. When the YOLO weights are absent the endpoint reports
    the adapter's own unavailable reason rather than fabricating detections.
    """
    from sqlalchemy import text as _sa_text
    from .. import db as _db

    _owned(vehicle_id, user)
    photo: dict | None = None
    vrows = _db.read("vehicle_images", "id = :id AND vehicle_id = :vid", {"id": photo_id, "vid": vehicle_id}, limit=1)
    if vrows and not vrows[0].get("deleted_at"):
        photo = vrows[0]
    elif _db.has_table("listing_images") and _db.has_table("listings"):
        has_l_del = "deleted_at" in _db.columns("listings")
        sel_del = ", l.deleted_at AS listing_deleted_at" if has_l_del else ""
        with _db.engine().connect() as conn:
            lrows = conn.execute(
                _sa_text(
                    f"SELECT li.*, l.vehicle_id AS vehicle_id{sel_del} "
                    "FROM listing_images li "
                    "JOIN listings l ON l.id = li.listing_id "
                    "WHERE li.id = :id AND l.vehicle_id = :vid LIMIT 1"
                ),
                {"id": photo_id, "vid": vehicle_id},
            ).mappings().all()
        if lrows:
            candidate = dict(lrows[0])
            if not candidate.get("deleted_at") and not candidate.get("listing_deleted_at"):
                photo = candidate
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found for this vehicle.")
    vehicle = _vehicle(vehicle_id)

    if not _is_car_category(vehicle):
        # Two-wheelers / three-wheelers / commercial have no licensed damage model.
        return {"available": False,
                "reason": "Damage CV detector is only available for car categories."}

    key = photo.get("file_key")
    norm_key = str(key or "").lstrip("/")
    if norm_key.startswith("api/v1/files/"):
        norm_key = norm_key[len("api/v1/files/"):]
    upload_root = settings.upload_dir.resolve()
    path = (settings.upload_dir / norm_key).resolve() if norm_key else None
    if not path or not path.is_relative_to(upload_root) or not path.is_file():
        raise HTTPException(status_code=409,
                            detail="Source photo file is not available for detection.")

    ystatus = yolo.status()
    if not ystatus.get("available"):
        return {"available": False, "reason": ystatus.get("reason"),
                "engine": ystatus.get("engine")}

    result = yolo.detect(path)
    detections = result.get("detections", [])
    today = _db.now_iso()[:10]
    candidate_ids: list[str] = []
    for det in detections:
        label = str(det.get("label") or "damage")
        conf = float(det.get("confidence") or 0.0)
        record = repository.create_row("damage_records", {
            "vehicle_id": vehicle_id,
            "zone_id": label,
            "status": "detected_candidate",
            "provenance": "detected_visible_damage",
            "position_source": "detected_visible_damage",
            "damage_type": label,
            "description": f"Auto-detected: {label} (confidence {conf})",
            "severity": "unassessed",
            "repair_status": "Not repaired",
            "inspection_date": today,
            "photo_keys": json.dumps([key]),
            "detection_confidence": conf,
            "detection_box": json.dumps(det.get("box")),
            "created_by": user["id"],
        })
        candidate_ids.append(str(record["id"]))

    return {
        "available": True,
        "detections": detections,
        "candidateDamageIds": candidate_ids,
        "modelVersion": result.get("version") or ystatus.get("version"),
        "limitations": result.get("limitations"),
    }


@router.patch("/{vehicle_id}/damage/{damage_id}/review")
def review_damage(vehicle_id: str, damage_id: str, req: DamageReview,
                  user: dict = Depends(require_role("seller", "admin"))) -> dict:
    """Human confirmation/rejection of a detected damage candidate.

    Status must be ``verified`` or ``rejected``; the row is updated accordingly.
    """
    if req.status not in ("verified", "rejected"):
        raise HTTPException(status_code=422,
                            detail="status must be 'verified' or 'rejected'")
    _owned(vehicle_id, user)
    damage = repository.get_row("damage_records", damage_id)
    if str(damage.get("vehicle_id")) != vehicle_id:
        raise HTTPException(status_code=404, detail="Damage record not found for this vehicle.")
    data = {"status": req.status}
    if req.component_id is not None:
        data["component_id"] = req.component_id
    if req.severity is not None:
        data["severity"] = req.severity
    if req.repair_status is not None:
        data["repair_status"] = req.repair_status
    if req.status == "verified" and damage.get("provenance") == "detected_visible_damage" and not damage.get("position_source"):
        data["position_source"] = "detected_visible_damage"
    updated = repository.update_row("damage_records", damage_id, data)
    repository.audit(str(user["id"]), "damage.reviewed", "damage_record", damage_id,
                     {"status": req.status})
    return {"damage": updated, "status": req.status}


# ---- document OCR ----------------------------------------------------------
def _sync_document_extractions(doc_id: str, vehicle_id: str, fields: dict,
                               confidence: float | None, method: str) -> None:
    from sqlalchemy import text as _sa_text
    from .. import db as _db

    if not _db.has_table("document_extractions"):
        return
    cols = set(_db.columns("document_extractions"))
    now = _db.now_iso()
    if {"field", "value"}.issubset(cols):
        with _db.engine().begin() as conn:
            conn.execute(
                _sa_text("DELETE FROM document_extractions WHERE document_id = :doc_id"),
                {"doc_id": doc_id},
            )
            count = 0
            for field_name, val in fields.items():
                if field_name == "confidence" or val is None or isinstance(val, (dict, list)):
                    continue
                if count >= 50:
                    break
                conn.execute(
                    _sa_text(
                        "INSERT INTO document_extractions "
                        "(id, document_id, vehicle_id, field, value, confidence, page, method, created_at) "
                        "VALUES (:id, :doc_id, :vid, :field, :value, :conf, :page, :method, :created_at)"
                    ),
                    {
                        "id": _db.new_id("dx"),
                        "doc_id": doc_id,
                        "vid": vehicle_id,
                        "field": str(field_name),
                        "value": str(val)[:500],
                        "conf": float(confidence) if isinstance(confidence, (int, float)) else None,
                        "page": None,
                        "method": method or "ocr",
                        "created_at": now,
                    },
                )
                count += 1
    elif "payload" in cols:
        clean = {k: v for k, v in fields.items() if k != "confidence"}
        with _db.engine().begin() as conn:
            conn.execute(
                _sa_text("DELETE FROM document_extractions WHERE document_id = :doc_id"),
                {"doc_id": doc_id},
            )
            conn.execute(
                _sa_text(
                    "INSERT INTO document_extractions (id, vehicle_id, document_id, payload, created_at) "
                    "VALUES (:id, :vid, :doc_id, :payload, :created_at)"
                ),
                {
                    "id": _db.new_id("dx"),
                    "vid": vehicle_id,
                    "doc_id": doc_id,
                    "payload": json.dumps({"fields": clean, "confidence": confidence, "method": method}),
                    "created_at": now,
                },
            )


def _parse_doc_extracted(raw: object) -> dict:
    if isinstance(raw, dict):
        return dict(raw)
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass
    return {}


@router.post("/{vehicle_id}/documents/{doc_id}/ocr")
def run_document_ocr(vehicle_id: str, doc_id: str,
                     user: dict = Depends(require_role("seller", "admin"))) -> dict:
    """Run OCR on a registered document and persist the extracted fields."""
    _owned(vehicle_id, user)
    doc = repository.get_row("documents", doc_id)
    if str(doc.get("vehicle_id")) != vehicle_id or doc.get("deleted_at"):
        raise HTTPException(status_code=404, detail="Document not found for this vehicle.")
    key = doc.get("file_key")
    norm_key = str(key or "").lstrip("/")
    if norm_key.startswith("api/v1/files/"):
        norm_key = norm_key[len("api/v1/files/"):]
    upload_root = settings.upload_dir.resolve()
    path = (settings.upload_dir / norm_key).resolve() if norm_key else None
    if not path or not path.is_relative_to(upload_root) or not path.is_file():
        raise HTTPException(status_code=409,
                            detail="Source document file is not available for OCR.")

    ocr_status = ocr_module.status()
    if not ocr_status.get("available"):
        return JSONResponse(status_code=409,
                            content={"available": False, "reason": ocr_status.get("reason")})

    result = ocr_module.ocr_image(path)
    if not result.get("available"):
        return JSONResponse(status_code=409,
                            content={"available": False, "reason": result.get("reason")})

    fields = ocr_module.extract_fields(result.get("text", ""))
    lines = result.get("lines", [])
    line_conf = (sum(l.get("confidence", 0.0) for l in lines) / len(lines)
                 if lines else None)
    confidence = (round(line_conf, 4) if line_conf is not None
                  else fields.get("confidence"))
    clean_fields = {k: v for k, v in fields.items() if k != "confidence"}
    prev_extracted = _parse_doc_extracted(doc.get("extracted"))
    extracted_payload = {
        **prev_extracted,
        "source": "python-intelligence",
        "engine": result.get("engine"),
        "method": result.get("method"),
        "version": result.get("version"),
        "is_ocr": bool(result.get("is_ocr")),
        "confidence": confidence,
        "warnings": result.get("warnings", []),
        "ocr_status": "processed",
        "fields": clean_fields,
    }
    repository.update_row("documents", doc_id, {
        "ocr_text": result.get("text", ""),
        "ocr_extracted": json.dumps(clean_fields),
        "ocr_confidence": confidence,
        "ocr_status": "processed",
        "extracted": json.dumps(extracted_payload),
    })
    _sync_document_extractions(
        doc_id,
        vehicle_id,
        clean_fields,
        confidence if isinstance(confidence, (int, float)) else None,
        str(result.get("method") or result.get("engine") or "ocr"),
    )
    # Name the engine that actually produced the text. A PDF text layer must
    # never be presented as OCR, and a fallback is never the primary engine.
    return {"text": result.get("text", ""), "fields": clean_fields, "confidence": confidence,
            "engine": result.get("engine"), "method": result.get("method"),
            "version": result.get("version"), "is_ocr": bool(result.get("is_ocr")),
            "warnings": result.get("warnings", [])}


@router.patch("/{vehicle_id}/documents/{doc_id}/ocr")
def correct_document_ocr(vehicle_id: str, doc_id: str, req: OcrCorrection,
                         user: dict = Depends(require_role("seller", "admin"))) -> dict:
    """Store manually-corrected OCR fields and mark the document reviewed."""
    from .. import db as _db

    _owned(vehicle_id, user)
    doc = repository.get_row("documents", doc_id)
    if str(doc.get("vehicle_id")) != vehicle_id or doc.get("deleted_at"):
        raise HTTPException(status_code=404, detail="Document not found for this vehicle.")
    clean_fields = {k: v for k, v in req.fields.items() if k != "confidence"}
    prev_extracted = _parse_doc_extracted(doc.get("extracted"))
    extracted_payload = {
        **prev_extracted,
        "source": prev_extracted.get("source") or "manual-ocr-review",
        "review_source": "manual-ocr-review",
        "ocr_status": "reviewed",
        "reviewed_by": str(user["id"]),
        "reviewed_at": _db.now_iso(),
        "fields": clean_fields,
    }
    updated = repository.update_row("documents", doc_id, {
        "ocr_extracted": json.dumps(clean_fields),
        "ocr_status": "reviewed",
        "extracted": json.dumps(extracted_payload),
    })
    _sync_document_extractions(
        doc_id,
        vehicle_id,
        clean_fields,
        prev_extracted.get("confidence") if isinstance(prev_extracted.get("confidence"), (int, float)) else None,
        str(prev_extracted.get("method") or "manual-ocr-review"),
    )
    return {"document": updated, "ocr_status": "reviewed"}


# ---- verification / trust / AI -------------------------------------------
@router.get("/{vehicle_id}/verification")
def list_verification(vehicle_id: str, user: dict = Depends(current_user)) -> dict:
    _vehicle(vehicle_id)
    runs = db.read("verification_runs", where="vehicle_id = :v", params={"v": vehicle_id}, limit=50)
    results = db.read("verification_results", where="vehicle_id = :v", params={"v": vehicle_id}, limit=500)
    return {"runs": runs, "results": results}


@router.post("/{vehicle_id}/verify")
def run_verification(vehicle_id: str, user: dict = Depends(require_role("seller", "admin"))) -> dict:
    _vehicle(vehicle_id)
    if user.get("role") == "seller":
        _owned(vehicle_id, user)
    run_id = db.new_id("run")
    started = db.now_iso()
    mileage = detectors.mileage_findings(vehicle_id)
    documents = detectors.document_findings(vehicle_id)
    trust = explain.compute(vehicle_id)
    findings = [f.model_dump() for r in (mileage, documents) for f in r.findings]
    checks = [
        ("documents", "verified" if documents.sample_count else "unverified"),
        ("mileage", "flagged" if mileage.findings else ("verified" if mileage.sample_count else "unverified")),
        ("identity", "verified" if not any(f.anomaly_type == "identity_mismatch" for f in documents.findings) else "flagged"),
        ("inspections", "verified" if db.read("vehicle_inspections", where="vehicle_id = :v", params={"v": vehicle_id}, limit=1) else "unverified"),
        ("chain", "verified" if db.read("chain_records", where="vehicle_id = :v", params={"v": vehicle_id}, limit=1) else "unverified"),
    ]
    db.insert("verification_runs", {
        "id": run_id, "vehicle_id": vehicle_id, "status": "completed",
        "started_at": started, "finished_at": db.now_iso(),
        "summary": json.dumps({"findings": len(findings), "trust_score": trust.score}),
    })
    for key, status in checks:
        db.insert("verification_results", {
            "id": db.new_id("res"), "run_id": run_id, "vehicle_id": vehicle_id,
            "check_key": key, "status": status,
            "details": json.dumps({"method": "deterministic"}), "evidence_ids": "[]",
        })
    for f in findings:
        db.insert("verification_evidence", {
            "id": db.new_id("ev"), "vehicle_id": vehicle_id, "run_id": run_id,
            "kind": "finding", "label": f["anomaly_type"], "source": "detector",
            "reliability": "medium", "payload": json.dumps(f),
            "disclosed_to_buyer": 0, "created_at": db.now_iso(),
        })
    explain.persist(trust)
    repository.audit(str(user["id"]), "verification.run", "vehicle", vehicle_id,
                     {"run_id": run_id, "score": trust.score})
    return {"run_id": run_id, "checks": checks, "findings": findings,
            "trust": trust.model_dump()}


@router.get("/{vehicle_id}/trust")
def get_trust(vehicle_id: str, persist: bool = False,
              user: dict = Depends(current_user)) -> dict:
    _vehicle(vehicle_id)
    result = explain.compute(vehicle_id)
    data = result.model_dump()
    data["persisted"] = explain.persist(result) if persist else False
    return data


@router.get("/{vehicle_id}/ai")
def list_ai(vehicle_id: str, user: dict = Depends(current_user)) -> dict:
    _vehicle(vehicle_id)
    rows = db.read("ai_analysis", where="vehicle_id = :v", params={"v": vehicle_id}, limit=200)
    return {"items": rows, "total": len(rows)}


@router.get("/{vehicle_id}/theft")
def theft_status(vehicle_id: str, user: dict = Depends(current_user)) -> dict:
    _vehicle(vehicle_id)
    rows = db.read("theft_checks", where="vehicle_id = :v", params={"v": vehicle_id}, limit=1)
    return {"theft": rows[0] if rows else None,
            "note": "Local database check only; no external registry is queried."}


@router.get("/{vehicle_id}/chain")
def chain(vehicle_id: str, user: dict = Depends(current_user)) -> dict:
    _vehicle(vehicle_id)
    rows = db.read("chain_records", where="vehicle_id = :v", params={"v": vehicle_id}, limit=1000)
    return {"records": rows, "count": len(rows),
            "note": "SHA-256 hash chain. Integrity, not document authenticity."}


@router.get("/{vehicle_id}/findings")
def findings(vehicle_id: str, user: dict = Depends(current_user)) -> dict:
    _vehicle(vehicle_id)
    rows = db.read("findings", where="vehicle_id = :v", params={"v": vehicle_id}, limit=200)
    return {"items": rows, "total": len(rows)}
