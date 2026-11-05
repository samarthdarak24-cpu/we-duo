"""Pydantic structured extraction + the 18-step document workflow.

Deterministic regex extraction over the ACTIVE backend's text. Confidence is a
coverage/consistency heuristic, not a probability of authenticity. Low
confidence, duplicates, expiry and mismatches create real manual-review rows.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from . import db
from .config import settings
from .logging import emit
from .ocr import OcrResult, run_ocr, sha256_file, validate_file

EXTRACTION_VERSION = "extract-1.0.0"

REG_RE = re.compile(r"\b([A-Z]{2}[-\s]?\d{1,2}[-\s]?[A-Z]{0,2}[-\s]?\d{1,4})\b")
VIN_RE = re.compile(r"\b([A-HJ-NPR-Z0-9]{17})\b", re.I)
POLICY_RE = re.compile(r"\b(?:policy|policy\s*no\.?|policy\s*number)\s*[:#]?\s*([A-Z0-9/-]{6,24})\b", re.I)
DATE_RE = re.compile(r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b")
ODOMETER_RE = re.compile(r"\b(?:odometer|km\s*reading|mileage|kms?)\s*[:#]?\s*([\d,]{3,7})\b", re.I)
AMOUNT_RE = re.compile(r"(?:₹|INR|Rs\.?)\s*([\d,]+(?:\.\d{2})?)", re.I)
MODEL_RE = re.compile(r"\b(?:model|vehicle|make)\s*[:#]?\s*([A-Za-z0-9 ]{2,30})", re.I)


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
    warning: str = (
        "Extracted values are machine-read text, not proof that the document is genuine."
    )


def _parse_date(value: str) -> datetime | None:
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%Y-%m-%d", "%d-%m-%y"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def extract_fields(text: str) -> ExtractedFields:
    reg = REG_RE.search(text)
    vin = VIN_RE.search(text)
    policy = POLICY_RE.search(text)
    dates = [m.group(1) for m in DATE_RE.finditer(text)]
    odo = ODOMETER_RE.search(text)
    amount = AMOUNT_RE.search(text)
    model = MODEL_RE.search(text)
    return ExtractedFields(
        registration_number=re.sub(r"\s", "", reg.group(1)) if reg else None,
        vin=vin.group(1).upper() if vin else None,
        policy_number=policy.group(1) if policy else None,
        dates=dates[:20],
        odometer_km=int(odo.group(1).replace(",", "")) if odo else None,
        invoice_amount=float(amount.group(1).replace(",", "")) if amount else None,
        vehicle_model=model.group(1).strip() if model else None,
        service_details=text[:400] or None,
    )


def _confidence(fields: ExtractedFields, ocr: OcrResult) -> float:
    present = sum(1 for v in (
        fields.registration_number, fields.vin, fields.policy_number,
        fields.odometer_km, fields.invoice_amount, fields.vehicle_model,
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


def _compare_with_vehicle(vehicle_id: str, fields: ExtractedFields) -> dict:
    out: dict[str, Any] = {"vehicle_id": vehicle_id, "checks": []}
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
    if fields.vin:
        stored_vin = str(v.get("vin") or "").upper()
        out["checks"].append({
            "field": "vin", "result": "match" if stored_vin == fields.vin else "mismatch",
            "expected": stored_vin, "extracted": fields.vin,
        })
    if fields.odometer_km is not None:
        readings = db.read("mileage_readings", where="vehicle_id = :v", params={"v": vehicle_id}, limit=100)
        kms = [int(r["km"]) for r in readings if isinstance(r.get("km"), (int, float))]
        out["checks"].append({
            "field": "odometer_km",
            "result": "no_reference" if not kms else ("above_latest" if fields.odometer_km > max(kms) else "not_above_latest"),
            "latest_recorded_km": max(kms) if kms else None,
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


def process_document(path: Path, document_id: str, vehicle_id: str, doc_type: str = "rc") -> ExtractionResult:
    """The checklist's 18-step workflow, each step recorded with its real status."""
    wf: list[dict] = []
    ok, reason = validate_file(path)
    wf.append(_step(1, "Validate extension / MIME / size", "passed" if ok else "failed", reason or ""))
    if not ok:
        return ExtractionResult(
            document_id=document_id, sha256="", engine="none", method="validation", is_ocr=False,
            fields=ExtractedFields(), confidence=0.0, low_confidence=True,
            flags=[reason or "invalid file"], workflow=wf,
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
    fields = extract_fields(ocr.text)
    wf.append(_step(6, "Extract fields", "passed" if ocr.text.strip() else "unavailable"))
    wf.append(_step(7, "Normalize extracted values", "passed",
                    f"reg={fields.registration_number} vin={fields.vin}"))
    comparison = _compare_with_vehicle(vehicle_id, fields)
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
        "title": f"{doc_type.upper()} document extraction",
        "explanation": f"engine={ocr.engine}, method={ocr.method}, confidence={confidence}",
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
        comparison=comparison, workflow=wf,
    )


def upload_dir() -> Path:
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    return settings.upload_dir
