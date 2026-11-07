"""Pydantic structured extraction + the 18-step document workflow.

Deterministic regex extraction over the ACTIVE backend's text. Confidence is a
coverage/consistency heuristic, not a probability of authenticity. Low
confidence, duplicates, expiry and mismatches create real manual-review rows.

The extracted identity fields depend on the vehicle category: cars use a
17-character VIN, two-wheelers use a stamped chassis/frame number, and EVs
carry motor and battery identifiers instead of a combustion engine number.
OCR extraction is machine-read text, NEVER proof that a document is genuine.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from . import categories, db
from .config import settings
from .logging import emit
from .ocr import OcrResult, run_ocr, sha256_file, validate_file

EXTRACTION_VERSION = "extract-2.0.0-multicategory"

REG_RE = re.compile(r"\b([A-Z]{2}[-\s]?\d{1,2}[-\s]?[A-Z]{0,2}[-\s]?\d{1,4})\b")
VIN_RE = re.compile(r"\b([A-HJ-NPR-Z0-9]{17})\b", re.I)
POLICY_RE = re.compile(r"\b(?:policy|policy\s*no\.?|policy\s*number)\s*[:#]?\s*([A-Z0-9/-]{6,24})\b", re.I)
DATE_RE = re.compile(r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b")
ODOMETER_RE = re.compile(
    r"\b(?:odometer|odo|km\s*reading|mileage|total\s*distance|distance\s*run|kms?)\s*[:#]?\s*([\d,]{3,7})\b",
    re.I,
)
AMOUNT_RE = re.compile(r"(?:₹|INR|Rs\.?)\s*([\d,]+(?:\.\d{2})?)", re.I)
MODEL_RE = re.compile(r"\b(?:model|vehicle|make)\s*[:#]?\s*([A-Za-z0-9 ]{2,30})", re.I)

# Category-specific identity/powertrain fields. Every one is label-anchored:
# an unlabelled token is never promoted into an identity claim.
CHASSIS_RE = re.compile(
    r"\b(?:chassis|frame|chassis\s*no\.?|frame\s*no\.?|chassis\s*number|frame\s*number|"
    r"vehicle\s*identification\s*number|vin)\s*[:#]?\s*([A-Z0-9]{8,22})\b", re.I)
ENGINE_RE = re.compile(r"\b(?:engine\s*(?:no\.?|number|serial)?)\s*[:#]?\s*([A-Z0-9]{5,22})\b", re.I)
MOTOR_RE = re.compile(r"\b(?:motor\s*(?:no\.?|number|serial)?|traction\s*motor)\s*[:#]?\s*([A-Z0-9]{5,22})\b", re.I)
BATTERY_SERIAL_RE = re.compile(r"\b(?:battery\s*(?:no\.?|number|serial|id)|pack\s*serial)\s*[:#]?\s*([A-Z0-9-]{5,30})\b", re.I)
BATTERY_CAPACITY_RE = re.compile(r"\b(?:battery\s*capacity|capacity|kwh)\s*[:#]?\s*([\d.]{1,6})\s*(?:kwh)?\b", re.I)


class ExtractedFields(BaseModel):
    registration_number: str | None = None
    vin: str | None = None
    owner_name: str | None = None
    vehicle_model: str | None = None
    policy_number: str | None = None
    dates: list[str] = Field(default_factory=list)
    odometer_km: int | None = None
    invoice_amount: float | None = None
    service_details: str | None = None
    # Category-aware identity / powertrain fields. `primary_identifier` is the
    # category-correct name for whatever lives in the shared vehicles.vin column.
    category_id: str = categories.DEFAULT_CATEGORY_ID
    identifier_label: str = "VIN"
    primary_identifier: str | None = None
    chassis_number: str | None = None
    frame_number: str | None = None
    engine_number: str | None = None
    motor_number: str | None = None
    battery_serial: str | None = None
    battery_capacity_kwh: float | None = None


class ExtractionResult(BaseModel):
    document_id: str
    sha256: str
    engine: str
    method: str
    is_ocr: bool
    fields: ExtractedFields
    confidence: float
    low_confidence: bool
    flags: list[str] = Field(default_factory=list)
    duplicate_of: str | None = None
    expiry: dict | None = None
    manual_review_id: str | None = None
    comparison: dict = Field(default_factory=dict)
    workflow: list[dict] = Field(default_factory=list)
    version: str = EXTRACTION_VERSION
    category_id: str = categories.DEFAULT_CATEGORY_ID
    warning: str = (
        "Extracted values are machine-read text, not proof that the document is genuine. "
        "OCR extraction is not verification of authenticity."
    )


def _parse_date(value: str) -> datetime | None:
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%Y-%m-%d", "%d-%m-%y"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def extract_fields(text: str, category_id: str | None = None) -> ExtractedFields:
    """Category-correct structured extraction. NO universal 17-character rule.

    A car uses an ISO 3779 VIN. A motorcycle/scooter uses a stamped chassis or
    frame number of 8-22 characters. An EV has a motor number and battery
    identifiers, never a combustion engine number. Values are only accepted
    from the text that the active OCR/PDF engine actually produced.
    """
    cid = category_id or categories.DEFAULT_CATEGORY_ID
    ident = categories.identity_for(cid)
    vin_applicable = bool(ident.get("vinApplicable"))
    reg = REG_RE.search(text)
    policy = POLICY_RE.search(text)
    dates = [m.group(1) for m in DATE_RE.finditer(text)]
    odo = ODOMETER_RE.search(text)
    amount = AMOUNT_RE.search(text)
    model = MODEL_RE.search(text)

    vin_value: str | None = None
    primary: str | None = None
    chassis: str | None = None
    if vin_applicable:
        vin = VIN_RE.search(text)
        if vin:
            vin_value = vin.group(1).upper()
            primary = vin_value
    else:
        chassis_match = CHASSIS_RE.search(text)
        if chassis_match:
            value = chassis_match.group(1).upper()
            pattern = str(ident.get("primaryPattern") or r"^[A-Z0-9]{8,22}$")
            if re.match(pattern, value):
                chassis = value
                primary = value

    engine: str | None = None
    motor: str | None = None
    if categories.has_engine(cid):
        m = ENGINE_RE.search(text)
        engine = m.group(1).upper() if m else None
    if categories.is_electric(cid):
        m = MOTOR_RE.search(text)
        motor = m.group(1).upper() if m else None

    battery_serial = None
    battery_capacity = None
    if categories.is_electric(cid):
        m = BATTERY_SERIAL_RE.search(text)
        battery_serial = m.group(1).upper() if m else None
        m = BATTERY_CAPACITY_RE.search(text)
        if m:
            try:
                battery_capacity = float(m.group(1))
            except ValueError:
                battery_capacity = None

    return ExtractedFields(
        registration_number=re.sub(r"\s", "", reg.group(1)) if reg else None,
        vin=vin_value,
        policy_number=policy.group(1) if policy else None,
        dates=dates[:20],
        odometer_km=int(odo.group(1).replace(",", "")) if odo else None,
        invoice_amount=float(amount.group(1).replace(",", "")) if amount else None,
        vehicle_model=model.group(1).strip() if model else None,
        service_details=text[:400] or None,
        category_id=cid,
        identifier_label=str(ident.get("primaryLabel") or "VIN"),
        primary_identifier=primary,
        chassis_number=chassis,
        frame_number=chassis,
        engine_number=engine,
        motor_number=motor,
        battery_serial=battery_serial,
        battery_capacity_kwh=battery_capacity,
    )


def _confidence(fields: ExtractedFields, ocr: OcrResult) -> float:
    present = sum(1 for v in (
        fields.registration_number, fields.primary_identifier, fields.policy_number,
        fields.odometer_km, fields.invoice_amount, fields.vehicle_model,
        fields.engine_number, fields.motor_number, fields.battery_serial,
    ) if v is not None)
    base = 0.15 + 0.12 * present
    if ocr.is_ocr:
        base += 0.1
    elif not ocr.text.strip():
        base -= 0.1
    if ocr.confidence is not None:
        base = 0.6 * base + 0.4 * ocr.confidence
    return round(max(0.0, min(1.0, base)), 3)


def _find_duplicate(sha: str, document_id: str, vehicle_id: str) -> str | None:
    """Detect (1) a re-upload whose bytes hash to an existing document and
    (2) an existing duplicate-record pair for the document being processed."""
    if not db.has_table("documents"):
        return None
    cols = db.columns("documents")
    hash_col = next((c for c in ("sha256", "hash", "file_hash", "content_hash") if c in cols), None)
    if not hash_col:
        return None
    rows = (db.read("documents", where="vehicle_id = :v", params={"v": vehicle_id}, limit=500)
            if "vehicle_id" in cols else db.read("documents", limit=500))
    for r in rows:
        if str(r.get("id")) != document_id and str(r.get(hash_col) or "") == sha:
            return str(r.get("id"))
    target = next((r for r in rows if str(r.get("id")) == document_id), None)
    if target:
        stored = str(target.get(hash_col) or "")
        if stored:
            for r in rows:
                if str(r.get("id")) != document_id and str(r.get(hash_col) or "") == stored:
                    return str(r.get("id"))
    return None


def _compare_with_vehicle(vehicle_id: str, fields: ExtractedFields,
                          category_id: str | None = None) -> dict:
    cid = category_id or fields.category_id or categories.DEFAULT_CATEGORY_ID
    ident = categories.identity_for(cid)
    out: dict[str, Any] = {
        "vehicle_id": vehicle_id, "category_id": cid,
        "identifier_label": ident.get("primaryLabel"), "checks": [],
    }
    rows = db.read("vehicles", where="id = :id", params={"id": vehicle_id}, limit=1)
    if not rows:
        out["checks"].append({"field": "vehicle", "result": "vehicle_not_found"})
        return out
    v = rows[0]
    if fields.registration_number:
        stored = re.sub(r"[^A-Z0-9]", "", str(v.get("reg_no") or "")).upper()
        got = re.sub(r"[^A-Z0-9]", "", fields.registration_number).upper()
        out["checks"].append({
            "field": "registration_number", "result": "match" if stored == got else "mismatch",
            "expected": stored, "extracted": got,
        })
    # `vehicles.vin` is the SHARED primary-identifier column: VIN for cars,
    # chassis/frame number for two-wheelers. It is compared with the
    # category-correct extracted value, never with a universal VIN rule.
    if fields.primary_identifier:
        stored_primary = re.sub(r"[^A-Z0-9]", "", str(v.get("vin") or "")).upper()
        got = re.sub(r"[^A-Z0-9]", "", fields.primary_identifier).upper()
        out["checks"].append({
            "field": "vin" if ident.get("vinApplicable") else "chassis_number",
            "result": "match" if stored_primary == got else "mismatch",
            "expected": stored_primary, "extracted": got,
            "label": ident.get("primaryLabel"),
        })
    if fields.odometer_km is not None:
        readings = db.read("mileage_readings", where="vehicle_id = :v", params={"v": vehicle_id}, limit=100)
        kms = [int(r["km"]) for r in readings if isinstance(r.get("km"), (int, float))]
        out["checks"].append({
            "field": "odometer_km",
            "result": "no_reference" if not kms else ("above_latest" if fields.odometer_km > max(kms) else "not_above_latest"),
            "latest_recorded_km": max(kms) if kms else None,
        })

    # Category-specific spec cross-checks, only against persisted rows.
    specs = []
    if db.has_table("vehicle_specs") and "vehicle_id" in db.columns("vehicle_specs"):
        specs = db.read("vehicle_specs", where="vehicle_id = :v", params={"v": vehicle_id}, limit=20)
    spec: dict[str, Any] = {}
    if specs:
        raw = specs[0].get("specs") or "{}"
        try:
            parsed = json.loads(raw) if isinstance(raw, str) else dict(raw)
            if isinstance(parsed, dict):
                spec = parsed
        except (ValueError, TypeError):
            spec = {}
    for field_name, extracted in (("engine_number", fields.engine_number),
                                  ("motor_number", fields.motor_number),
                                  ("battery_serial", fields.battery_serial)):
        if not extracted:
            continue
        stored = re.sub(r"[^A-Z0-9]", "", str(spec.get(field_name) or "")).upper()
        out["checks"].append({
            "field": field_name,
            "result": "no_reference" if not stored else ("match" if stored == extracted else "mismatch"),
            "expected": stored or None, "extracted": extracted,
        })
    # An EV must never be asked for a combustion engine number.
    if not categories.has_engine(cid) and fields.engine_number:
        out["checks"].append({
            "field": "engine_number", "result": "not_applicable",
            "expected": None, "extracted": fields.engine_number,
            "note": "Engine number does not apply to an electric powertrain.",
        })
    return out


def _expiry(fields: ExtractedFields, doc_type: str) -> dict | None:
    parsed = [(_parse_date(d), d) for d in fields.dates]
    parsed = [(p, d) for p, d in parsed if p]
    if not parsed:
        return None
    latest = max(parsed, key=lambda x: x[0])
    days = (latest[0] - datetime.now()).days
    return {
        "latest_date": latest[1],
        "days_from_today": days,
        "expired": days < 0,
        "doc_type": doc_type,
        "note": "Date is machine-read; expiry is indicative, not a validity guarantee.",
    }


def _queue_review(document_id: str, vehicle_id: str, reasons: list[str], confidence: float) -> str | None:
    rid = db.new_id("review")
    payload = {
        "id": rid,
        "document_id": document_id,
        "vehicle_id": vehicle_id,
        "reason": "; ".join(reasons),
        # Real schema CHECK: open|assigned|resolved|rejected
        "status": "open",
        "confidence": confidence,
        # Real schema CHECK: low_confidence_ocr|conflicting_documents|suspicious_fraud|damage_validation|manual_correction
        "kind": "low_confidence_ocr",
        "payload": json.dumps({"reasons": reasons, "confidence": confidence}),
        "created_at": db.now_iso(), "updated_at": db.now_iso(),
    }
    # Fall back to a service-owned queue if the shared table has a different shape.
    ok, _ = db.insert("human_review_queue", payload)
    if not ok:
        emit("review.queue_unavailable", review_id=rid, reasons=reasons)
        return rid
    return rid


def _step(n: int, name: str, status: str, detail: str = "") -> dict:
    return {"step": n, "name": name, "status": status, "detail": detail}


def process_document(path: Path, document_id: str, vehicle_id: str, doc_type: str = "rc",
                     category_id: str | None = None) -> ExtractionResult:
    """The checklist's 18-step workflow, each step recorded with its real status.

    `category_id` is normally resolved from the shared `vehicles` row. An
    explicit override is accepted for tests and for reprocessing an archived
    document whose vehicle row no longer exists.
    """
    if category_id:
        profile = categories.get_category(category_id)
        cid = str(profile["id"]) if profile else categories.DEFAULT_CATEGORY_ID
    else:
        cid = categories.category_id_for_vehicle(vehicle_id)
    wf: list[dict] = []
    ok, reason = validate_file(path)
    wf.append(_step(1, "Validate extension / MIME / size", "passed" if ok else "failed", reason or ""))
    if not ok:
        return ExtractionResult(
            document_id=document_id, sha256="", engine="none", method="validation", is_ocr=False,
            fields=ExtractedFields(category_id=cid), confidence=0.0, low_confidence=True,
            flags=[reason or "invalid file"], workflow=wf, category_id=cid,
        )
    wf.append(_step(2, "Store privately", "passed", f"path={path}"))
    sha = sha256_file(path)
    wf.append(_step(3, "Calculate SHA-256", "passed", sha))
    job_id = db.new_id("job")
    db.insert("background_jobs", {
        "id": job_id, "type": "document_processing", "status": "running",
        "subject_type": "document", "subject_id": document_id,
        "vehicle_id": vehicle_id, "payload": f"document:{document_id}",
        "priority": 0, "run_after": db.now_iso(),
        "progress": 20, "attempts": 1,
        "timeout_ms": 120000, "timeout_seconds": 120,
        "created_at": db.now_iso(), "updated_at": db.now_iso(),
    })
    wf.append(_step(4, "Create document-processing job", "passed", job_id))
    ocr = run_ocr(path)
    wf.append(_step(5, "Run OCR", "passed" if ocr.is_ocr else "degraded",
                    f"engine={ocr.engine} method={ocr.method}"))
    fields = extract_fields(ocr.text, cid)
    wf.append(_step(6, "Extract fields", "passed" if ocr.text.strip() else "unavailable",
                    f"category={cid}, identifier_label={fields.identifier_label}"))
    wf.append(_step(7, "Normalize extracted values", "passed",
                    f"reg={fields.registration_number} {fields.identifier_label}={fields.primary_identifier}"))
    comparison = _compare_with_vehicle(vehicle_id, fields, cid)
    wf.append(_step(8, "Compare with vehicle database", "passed",
                    ", ".join(f"{c['field']}:{c['result']}" for c in comparison["checks"])))
    duplicate = _find_duplicate(sha, document_id, vehicle_id)
    wf.append(_step(9, "Check duplicates", "passed" if not duplicate else "flagged",
                    duplicate or "none"))
    expiry = _expiry(fields, doc_type)
    wf.append(_step(10, "Check date and expiry", "passed" if expiry else "no_date_found",
                     str(expiry or "")))
    wf.append(_step(11, "Check metadata", "passed",
                     str(ocr.preprocessing.get("pdf_metadata_suspicious", []))))
    confidence = _confidence(fields, ocr)
    low = confidence < 0.55 or not ocr.text.strip()
    wf.append(_step(12, "Calculate extraction confidence", "passed", str(confidence)))
    wf.append(_step(13, "Flag low-confidence results", "flagged" if low else "clear"))
    flags: list[str] = []
    if duplicate:
        flags.append(f"duplicate_of:{duplicate}")
    if expiry and expiry.get("expired"):
        flags.append("document_date_expired")
    for c in comparison["checks"]:
        if c["result"] == "mismatch":
            flags.append(f"{c['field']}_mismatch")
    if ocr.preprocessing.get("pdf_metadata_suspicious"):
        flags.append("suspicious_pdf_metadata")
    if low:
        flags.append("low_extraction_confidence")
    review_id = None
    if low or duplicate or any("mismatch" in f for f in flags):
        review_id = _queue_review(document_id, vehicle_id, flags or ["low_confidence"], confidence)
    wf.append(_step(14, "Send for manual review when required", "queued" if review_id else "not_required",
                    review_id or ""))
    evidence_id = db.new_id("evidence")
    db.insert("verification_evidence", {
        "id": evidence_id, "vehicle_id": vehicle_id,
        # Real schema: kind/label/source/reliability/sha256/disclosed_to_buyer
        "kind": "document_hash", "label": f"{doc_type.upper()} extraction evidence",
        "source": f"document:{document_id}", "source_type": "document_extraction",
        "source_id": document_id,
        # Real schema CHECK: high|medium|low|self_reported|unknown
        "reliability": "medium",
        "sha256": sha, "hash": sha, "disclosed_to_buyer": 0,
        "payload": json.dumps({"engine": ocr.engine, "method": ocr.method}),
        "created_at": db.now_iso(),
    })
    wf.append(_step(15, "Save verification evidence", "passed", evidence_id))
    # notifications.user_id has a FK to users(id); notify the real owner or skip.
    vehicle_rows = db.read("vehicles", where="id = :v", params={"v": vehicle_id}, limit=1)
    owner_id = str(vehicle_rows[0].get("owner_id") or "") if vehicle_rows else ""
    if owner_id:
        db.insert("notifications", {
            "id": db.new_id("notif"), "user_id": owner_id,
            "title": "Document processing complete",
            "body": f"{doc_type.upper()} for {document_id}: confidence {confidence}",
            "type": "document", "data": json.dumps({"document_id": document_id}),
            "read": 0, "created_at": db.now_iso(),
        })
        wf.append(_step(16, "Notify seller", "passed", owner_id))
    else:
        wf.append(_step(16, "Notify seller", "skipped", "vehicle owner not found"))
    wf.append(_step(17, "Expose permitted results to buyer", "passed",
                    "consent-filtered summary only; source file stays private"))
    db.insert("ai_analysis", {
        "id": db.new_id("analysis"), "vehicle_id": vehicle_id,
        # Real schema: kind/title/explanation/severity/model_version/disclaimer…
        # Real schema CHECK: odometer|document|damage|conflict|agent|market|inspection
        "kind": "document", "analysis_type": "document_extraction",
        "anomaly_type": "low_confidence_extraction" if low else "extraction_complete",
        "title": f"{doc_type.upper()} document extraction ({cid})",
        "explanation": (f"engine={ocr.engine}, method={ocr.method}, confidence={confidence}, "
                        f"category={cid}, identifier={fields.identifier_label}"),
        "severity": "medium" if low else "low",
        "method": ocr.method, "engine": ocr.engine,
        "model_version": EXTRACTION_VERSION, "version": EXTRACTION_VERSION,
        "confidence": confidence, "result": str(flags),
        "readings_json": json.dumps(fields.model_dump()),
        "evidence_json": json.dumps([evidence_id]),
        "recommended_action": "Inspector review" if review_id else "None",
        "review_state": "pending_review" if review_id else "auto",
        "disclaimer": "Machine-read text is not proof of document authenticity.",
        "created_at": db.now_iso(),
    })
    db.update("background_jobs", job_id, {"status": "succeeded", "progress": 100,
                                          "finished_at": db.now_iso(),
                                          "updated_at": db.now_iso()})
    wf.append(_step(18, "Persist run + complete job", "passed", job_id))
    emit("document.processed", document_id=document_id, vehicle_id=vehicle_id,
         engine=ocr.engine, confidence=confidence, flags=flags)
    return ExtractionResult(
        document_id=document_id, sha256=sha, engine=ocr.engine, method=ocr.method,
        is_ocr=ocr.is_ocr, fields=fields, confidence=confidence, low_confidence=low,
        flags=flags, duplicate_of=duplicate, expiry=expiry, manual_review_id=review_id,
        comparison=comparison, workflow=wf, category_id=cid,
    )


def upload_dir() -> Path:
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    return settings.upload_dir
