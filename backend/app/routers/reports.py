"""Reports (real PDF), QR verification and vehicle lookup."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .. import db, explain, repository
from ..config import settings
from ..security import current_user, optional_user, require_role

router = APIRouter(prefix="/api/backend", tags=["reports"])


class ReportCreate(BaseModel):
    vehicle_id: str
    type: str = "Vehicle verification"


class LookupRequest(BaseModel):
    type: str  # trustdrive_id | reg_no | vin
    value: str = Field(min_length=3, max_length=40)


def _pdf_path(report_id: str) -> Path:
    folder = settings.upload_dir / "reports"
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"{report_id}.pdf"


def _render_pdf(vehicle: dict, trust, findings: list[dict], report_id: str) -> tuple[Path, str]:
    import fitz  # PyMuPDF
    lines = [
        "TrustDrive - Vehicle Verification Report",
        f"Report ID: {report_id}",
        f"Generated: {db.now_iso()}",
        "",
        f"Vehicle: {vehicle.get('make')} {vehicle.get('model')} {vehicle.get('variant') or ''}".strip(),
        f"Year: {vehicle.get('year')}   Registration: {vehicle.get('reg_no')}",
        f"VIN: {vehicle.get('vin') or 'not recorded'}",
        f"TrustDrive ID: {vehicle.get('trustdrive_id')}",
        f"Claimed mileage: {vehicle.get('km_claimed')} km",
        "",
        f"Trust score: {trust.score}/100 ({trust.band_label}) — version {trust.version}",
        f"Evidence coverage: {round(100 * sum(c.ratio for c in trust.contributions) / len(trust.contributions))}%",
        "",
        "Positive evidence:",
        *([f"  - {p}" for p in trust.positive_evidence] or ["  - none recorded"]),
        "",
        "Negative findings:",
        *([f"  - {n}" for n in trust.negative_findings] or ["  - none recorded"]),
        "",
        "Unverified areas:",
        *([f"  - {u}" for u in trust.unverified_areas] or ["  - none"]),
        "",
        "Detector findings:",
        *([f"  - [{f.get('severity')}] {f.get('anomaly_type')}: {f.get('explanation')}"
           for f in findings] or ["  - none"]),
        "",
        "Method: deterministic rules + optional ML; additive trust score.",
        "Limitations:",
        "  - A matching hash proves the stored file is unchanged, not that the original was genuine.",
        "  - Missing data is unverified coverage, not proof of fraud.",
        "  - Detector findings are leads for human review, never proof.",
    ]
    doc = fitz.open()
    page = doc.new_page()
    y = 60
    for line in lines:
        if y > 780:
            page = doc.new_page()
            y = 60
        safe = str(line).encode("latin-1", "replace").decode("latin-1")[:110]
        page.insert_text((48, y), safe, fontsize=9)
        y += 12
    path = _pdf_path(report_id)
    doc.save(str(path))
    doc.close()
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return path, digest


@router.get("/reports")
def list_reports(limit: int = 50, offset: int = 0,
                 user: dict = Depends(current_user)) -> dict:
    if user.get("role") == "admin":
        return repository.list_rows("reports", limit=limit, offset=offset, order_by="created_at")
    rows = db.read("reports", where="requested_by = :u", params={"u": user["id"]}, limit=500)
    rows.sort(key=lambda r: str(r.get("created_at") or ""), reverse=True)
    return {"items": rows[offset:offset + limit], "total": len(rows),
            "limit": limit, "offset": offset}


@router.post("/reports", status_code=201)
def create_report(req: ReportCreate, user: dict = Depends(current_user)) -> dict:
    vehicle = repository.get_row("vehicles", req.vehicle_id)
    if user.get("role") == "seller" and str(vehicle.get("owner_id")) != str(user["id"]):
        raise HTTPException(status_code=403, detail="You can only report on your own vehicles.")
    trust = explain.compute(req.vehicle_id)
    findings = db.read("ai_analysis", where="vehicle_id = :v",
                       params={"v": req.vehicle_id}, limit=50)
    report_id = "TD-RPT-" + db.new_id("r").split("-", 1)[1].upper()
    path, digest = _render_pdf(vehicle, trust, findings, report_id)
    rel = str(path.relative_to(settings.upload_dir)).replace("\\", "/")
    snapshot = {
        "vehicle": {k: vehicle.get(k) for k in
                    ("id", "make", "model", "year", "reg_no", "vin", "trustdrive_id", "km_claimed")},
        "trust": trust.model_dump(),
        "findings": [{k: f.get(k) for k in ("id", "anomaly_type", "severity", "explanation")}
                     for f in findings],
    }
    row = repository.create_row("reports", {
        "vehicle_id": req.vehicle_id, "requested_by": user["id"], "type": req.type,
        "status": "ready", "file_key": rel, "report_id": report_id,
        "generated_at": db.now_iso(), "pdf_hash": digest,
        "snapshot": json.dumps(snapshot, default=str)[:60000], "version": trust.version,
    })
    repository.audit(str(user["id"]), "report.generated", "report", row["id"],
                     {"report_id": report_id})
    return {"report": row, "download": f"/api/backend/reports/{row['id']}/download"}


@router.get("/reports/{report_id}")
def get_report(report_id: str, user: dict = Depends(current_user)) -> dict:
    row = repository.get_row("reports", report_id)
    if user.get("role") not in ("admin",) and str(row.get("requested_by")) != str(user["id"]):
        raise HTTPException(status_code=403, detail="You cannot read this report.")
    return {"report": row}


@router.get("/reports/{report_id}/download")
def download_report(report_id: str, user: dict | None = Depends(optional_user)) -> FileResponse:
    row = repository.get_row("reports", report_id)
    key = row.get("file_key")
    if not key:
        raise HTTPException(status_code=404, detail="This report has no generated PDF.")
    path = settings.upload_dir / str(key)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Report PDF is missing from storage.")
    # Re-verify the stored hash before serving.
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if row.get("pdf_hash") and actual != row["pdf_hash"]:
        raise HTTPException(status_code=409, detail="Report integrity check failed (hash drift).")
    return FileResponse(str(path), media_type="application/pdf",
                        filename=f"{row.get('report_id', report_id)}.pdf")


@router.get("/verify/{token}")
def verify_token(token: str) -> dict:
    rows = db.read("qr_tokens", where="token = :t", params={"t": token}, limit=1)
    if not rows:
        raise HTTPException(status_code=404, detail="Verification token not found.")
    qr = rows[0]
    if qr.get("revoked_at"):
        raise HTTPException(status_code=410, detail="This verification link has been revoked.")
    vehicle = repository.get_row("vehicles", str(qr["vehicle_id"]))
    trust = db.read("trust_scores", where="vehicle_id = :v",
                    params={"v": qr["vehicle_id"]}, limit=1)
    return {
        "status": "valid",
        "vehicle": {k: vehicle.get(k) for k in
                    ("id", "make", "model", "variant", "year", "reg_no", "trustdrive_id")},
        "trust_score": trust[0].get("score") if trust else None,
        "trust_band": trust[0].get("band") if trust else None,
        "issued_at": qr.get("created_at"),
        "disclosure": "Public summary only. Private seller documents are never exposed.",
    }


@router.post("/verification/lookup")
def lookup(req: LookupRequest) -> dict:
    column = {"trustdrive_id": "trustdrive_id", "reg_no": "reg_no", "vin": "vin"}.get(req.type)
    if not column:
        raise HTTPException(status_code=422,
                            detail="type must be trustdrive_id | reg_no | vin")
    rows = db.read("vehicles", where=f"{column} = :v", params={"v": req.value}, limit=1)
    if not rows:
        raise HTTPException(status_code=404, detail="No vehicle matched that identifier.")
    vehicle = rows[0]
    trust = db.read("trust_scores", where="vehicle_id = :v",
                    params={"v": vehicle["id"]}, limit=1)
    return {
        "vehicle": {k: vehicle.get(k) for k in
                    ("id", "make", "model", "year", "reg_no", "trustdrive_id")},
        "trust": trust[0] if trust else None,
        "note": "Local database lookup only; no external registry is queried.",
    }
