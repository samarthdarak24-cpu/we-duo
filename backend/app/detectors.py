"""Deterministic-first fraud detection with optional ML detectors.

Every finding carries the checklist's required payload: anomaly type, readings
involved, severity, evidence, explanation, detection method, model/rule
version, confidence and recommended review action. No LLM decides anything.
"""
from __future__ import annotations

import hashlib
import re
from datetime import datetime
from pathlib import Path
from statistics import median
from typing import Any

from pydantic import BaseModel, Field

from . import db
from .logging import emit

RULES_VERSION = "fraud-rules-1.1.0"
ML_VERSION = "sklearn-iforest-lof-1.0.0"


class Finding(BaseModel):
    anomaly_type: str
    severity: str  # low | medium | high
    explanation: str
    evidence: list[str] = Field(default_factory=list)
    readings: list[dict] = Field(default_factory=list)
    method: str
    model_version: str
    confidence: float
    recommended_review_action: str


class DetectorReport(BaseModel):
    vehicle_id: str
    detector: str
    findings: list[Finding]
    active_backends: list[str]
    sample_count: int
    limitations: list[str] = Field(default_factory=list)
    generated_at: str


def _rows(table: str, vehicle_id: str, limit: int = 200) -> list[dict]:
    if not db.has_table(table):
        return []
    cols = db.columns(table)
    if "vehicle_id" not in cols:
        return []
    return db.read(table, where="vehicle_id = :v", params={"v": vehicle_id}, limit=limit)


def _km(r: dict) -> int | None:
    for key in ("km", "odometer_km", "reading_km", "value"):
        if isinstance(r.get(key), (int, float)):
            return int(r[key])
    return None


def _date(r: dict) -> str:
    for key in ("date", "recorded_at", "reading_date", "created_at"):
        if r.get(key):
            return str(r[key])[:10]
    return ""


def _year(r: dict) -> int | None:
    d = _date(r)
    m = re.match(r"(\d{4})", d)
    return int(m.group(1)) if m else None


def mileage_findings(vehicle_id: str) -> DetectorReport:
    readings = _rows("mileage_readings", vehicle_id)
    ordered = sorted(
        [r for r in readings if _km(r) is not None],
        key=lambda r: (_date(r), str(r.get("id", ""))),
    )
    findings: list[Finding] = []
    backends = ["deterministic-rules"]

    # A. Mileage decrease (rollback)
    for prev, cur in zip(ordered, ordered[1:]):
        km_prev, km_cur = _km(prev), _km(cur)
        if km_prev is None or km_cur is None:
            continue
        if km_cur < km_prev:
            findings.append(Finding(
                anomaly_type="mileage_decrease",
                severity="high",
                explanation=f"Odometer fell from {km_prev:,} km ({_date(prev)}) to {km_cur:,} km ({_date(cur)}). A mechanical odometer cannot go backwards.",
                evidence=[str(prev.get("id")), str(cur.get("id"))],
                readings=[{"id": prev.get("id"), "date": _date(prev), "km": _km(prev)},
                          {"id": cur.get("id"), "date": _date(cur), "km": _km(cur)}],
                method="monotonicity-check", model_version=RULES_VERSION, confidence=0.98,
                recommended_review_action="Verify both source documents with an inspector; request clarification from the seller.",
            ))

    # B. Unusual jumps / implausible annual usage
    deltas: list[int] = []
    for prev, cur in zip(ordered, ordered[1:]):
        y1, y2 = _year(prev), _year(cur)
        km_prev, km_cur = _km(prev), _km(cur)
        dy = (y2 - y1) if (y1 and y2) else 1
        if dy > 0 and km_prev is not None and km_cur is not None:
            deltas.append(max(0, (km_cur - km_prev) // dy))
    if len(deltas) >= 2:
        med = median(deltas) or 1
        for prev, cur, per_year in zip(ordered, ordered[1:], deltas):
            if per_year > max(50_000, med * 4):
                findings.append(Finding(
                    anomaly_type="implausible_usage", severity="medium",
                    explanation=f"{per_year:,} km/year between {_date(prev)} and {_date(cur)} is far above this vehicle's median ({int(med):,} km/year).",
                    evidence=[str(prev.get("id")), str(cur.get("id"))],
                    readings=[{"date": _date(prev), "km": _km(prev)}, {"date": _date(cur), "km": _km(cur)}],
                    method="annual-usage-threshold", model_version=RULES_VERSION, confidence=0.72,
                    recommended_review_action="Cross-check service invoices for the intervening period.",
                ))

    # C. Conflicting readings on the same date
    by_date: dict[str, list[int]] = {}
    for r in ordered:
        km_r = _km(r)
        if km_r is not None:
            by_date.setdefault(_date(r), []).append(km_r)
    for d, vals in by_date.items():
        if len(set(vals)) > 1:
            findings.append(Finding(
                anomaly_type="conflicting_readings", severity="high",
                explanation=f"Two different odometer values ({', '.join(f'{v:,}' for v in sorted(set(vals)))} km) are recorded on {d}.",
                evidence=[d], readings=[{"date": d, "km": v} for v in sorted(set(vals))],
                method="same-date-conflict", model_version=RULES_VERSION, confidence=0.95,
                recommended_review_action="Inspector must decide which source is authoritative.",
            ))

    # D. Duplicate readings with conflicting dates
    seen: dict[int, set[str]] = {}
    for r in ordered:
        k = _km(r)
        if k is None:
            continue
        seen.setdefault(k, set()).add(_date(r))
    for k, dates in seen.items():
        if len(dates) > 1 and k > 0:
            findings.append(Finding(
                anomaly_type="duplicate_reading_different_dates", severity="low",
                explanation=f"{k:,} km appears on {len(dates)} different dates — possibly a duplicated record.",
                evidence=sorted(dates), readings=[{"km": k, "date": d} for d in sorted(dates)],
                method="duplicate-value-check", model_version=RULES_VERSION, confidence=0.6,
                recommended_review_action="Confirm whether these are genuine repeat readings.",
            ))

    # E. Optional ML: Isolation Forest + Local Outlier Factor.
    ml_note = "ML not run: scikit-learn unavailable or fewer than 8 readings."
    try:
        import numpy as np  # type: ignore
        from sklearn.ensemble import IsolationForest  # type: ignore
        from sklearn.neighbors import LocalOutlierFactor  # type: ignore
        if len(ordered) >= 8:
            years = np.array([_year(r) or 0 for r in ordered], dtype=float)
            kms = np.array([_km(r) or 0 for r in ordered], dtype=float)
            idx = np.arange(len(ordered), dtype=float)
            X = np.column_stack([years, kms, np.gradient(kms) if len(kms) > 1 else idx])
            iso = IsolationForest(contamination=0.15, random_state=42).fit(X)
            lof = LocalOutlierFactor(n_neighbors=min(5, len(ordered) - 1)).fit_predict(X)
            flagged = [i for i in range(len(ordered)) if iso.predict([X[i]])[0] == -1 or lof[i] == -1]
            if flagged:
                findings.append(Finding(
                    anomaly_type="statistical_outlier", severity="medium",
                    explanation=f"{len(flagged)} of {len(ordered)} readings are outliers under Isolation Forest / LOF on (year, km, delta).",
                    evidence=[str(ordered[i].get("id")) for i in flagged],
                    readings=[{"id": ordered[i].get("id"), "date": _date(ordered[i]), "km": _km(ordered[i])} for i in flagged],
                    method="isolation-forest+lof", model_version=ML_VERSION, confidence=0.65,
                    recommended_review_action="Treat as a lead for human review, never as proof of fraud.",
                ))
            backends.append("isolation-forest")
            backends.append("local-outlier-factor")
            ml_note = f"ML evaluated {len(ordered)} readings; {len(flagged)} outliers."
    except Exception as exc:
        emit("detector.ml_unavailable", detector="mileage", error=str(exc))

    return DetectorReport(
        vehicle_id=vehicle_id, detector="mileage", findings=findings,
        active_backends=backends, sample_count=len(ordered),
        limitations=[
            "Deterministic rules and statistical outliers are leads, not proof of tampering.",
            ml_note,
            "No labelled fraud corpus is present, so XGBoost is deliberately not fitted.",
        ],
        generated_at=db.now_iso(),
    )


def document_findings(vehicle_id: str) -> DetectorReport:
    docs = _rows("documents", vehicle_id)
    hash_col = next((c for c in ("sha256", "hash", "file_hash", "content_hash")
                     if c in db.columns("documents")), None)
    num_col = next((c for c in ("invoice_no", "doc_number", "policy_number", "number")
                    if c in db.columns("documents")), None)
    findings: list[Finding] = []

    if hash_col:
        groups: dict[str, list[str]] = {}
        for d in docs:
            groups.setdefault(str(d.get(hash_col) or ""), []).append(str(d.get("id")))
        for h, ids in groups.items():
            if h and len(ids) > 1:
                findings.append(Finding(
                    anomaly_type="duplicate_document", severity="high",
                    explanation=f"{len(ids)} documents share the identical SHA-256 hash ({h[:16]}…).",
                    evidence=ids, method="sha256-equality", model_version=RULES_VERSION,
                    confidence=0.99, recommended_review_action="Inspector must confirm whether these are distinct originals.",
                ))
    if num_col:
        groups = {}
        for d in docs:
            n = str(d.get(num_col) or "").strip()
            if n:
                groups.setdefault(n, []).append(str(d.get("id")))
        for n, ids in groups.items():
            if len(ids) > 1:
                findings.append(Finding(
                    anomaly_type="repeated_invoice_number", severity="medium",
                    explanation=f"Invoice/policy number {n} appears on {len(ids)} documents.",
                    evidence=ids, method="identifier-uniqueness", model_version=RULES_VERSION,
                    confidence=0.85, recommended_review_action="Request the original invoices from the seller.",
                ))

    # VIN / registration mismatch from persisted findings and extraction records.
    for f in _rows("findings", vehicle_id):
        title = str(f.get("title") or "") + str(f.get("type") or "")
        if re.search(r"vin|registration|mismatch", title, re.I):
            findings.append(Finding(
                anomaly_type="identity_mismatch", severity="high",
                explanation=f"Persisted finding: {f.get('title') or f.get('type')}. {f.get('explanation') or ''}",
                evidence=[str(f.get("id"))], method="persisted-finding", model_version=RULES_VERSION,
                confidence=0.8, recommended_review_action="Inspector must reconcile identity documents.",
            ))
    for a in _rows("ai_analysis", vehicle_id):
        if "mismatch" in str(a.get("result") or ""):
            findings.append(Finding(
                anomaly_type="extraction_mismatch", severity="medium",
                explanation=f"Document extraction flagged: {a.get('result')}",
                evidence=[str(a.get("id"))], method="extraction-flag", model_version=str(a.get("version") or "unknown"),
                confidence=0.7, recommended_review_action="Re-read the source document with an inspector.",
            ))

    missing = [str(d.get("id")) for d in docs if not d.get("status") or str(d.get("status")) == "pending"]
    if missing:
        findings.append(Finding(
            anomaly_type="missing_expected_fields", severity="low",
            explanation=f"{len(missing)} document(s) still have no verification status.",
            evidence=missing, method="completeness-check", model_version=RULES_VERSION,
            confidence=1.0, recommended_review_action="Complete document verification before publishing.",
        ))

    return DetectorReport(
        vehicle_id=vehicle_id, detector="document", findings=findings,
        active_backends=["deterministic-matching", "sha256-hashing"], sample_count=len(docs),
        limitations=[
            "Document matching is deterministic; no authenticity claim is made.",
            "Metadata checks are indicative only and cannot prove forgery.",
        ],
        generated_at=db.now_iso(),
    )


def damage_signals(image_path: Path) -> dict:
    """Validated OpenCV signals only. Requires human inspector confirmation."""
    result: dict[str, Any] = {
        "engine": "unavailable", "method": "none", "sha256": "",
        "signals": {}, "limitations": [
            "A single photograph cannot establish accident severity or hidden structural damage.",
            "No trained damage weights are present; YOLO is an adapter slot, not an active detector.",
            "All findings require human inspector validation.",
        ],
    }
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore
        img = cv2.imread(str(image_path))
        if img is None:
            result["warnings"] = ["Could not decode image."]
            return result
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(gray, 80, 180)
        laplacian = cv2.Laplacian(gray, cv2.CV_64F).var()
        h = hashlib.sha256(image_path.read_bytes()).hexdigest()
        result.update({
            "engine": "opencv", "method": "edge-gradient-anomaly", "sha256": h,
            "signals": {
                "edge_density": round(float(edges.mean() / 255), 4),
                "focus_measure": round(float(laplacian), 2),
                "dimensions": [int(img.shape[1]), int(img.shape[0])],
            },
            "confidence": 0.4,
            "recommended_review_action": "Human inspector must confirm any damage claim.",
        })
    except Exception as exc:
        result["warnings"] = [f"OpenCV unavailable: {type(exc).__name__}: {exc}"]

    # Optional YOLO/ONNX damage adapter. Inactive without licensed weights, and
    # never upgrades a detection into a severity verdict.
    try:
        from .intelligence.damage import yolo
        detection = yolo.detect(image_path)
        result["object_detection"] = detection
        if detection.get("available") and detection.get("detections"):
            result["engine"] = f"{result.get('engine', 'opencv')}+{detection.get('engine')}"
            result["signals"]["detections"] = detection["detections"]
    except Exception as exc:
        result["object_detection"] = {
            "available": False, "engine": "none",
            "reason": f"{type(exc).__name__}: {exc}",
        }
    return result


def detect_all(vehicle_id: str) -> dict:
    mileage = mileage_findings(vehicle_id)
    documents = document_findings(vehicle_id)
    return {
        "vehicle_id": vehicle_id,
        "generated_at": db.now_iso(),
        "reports": [mileage.model_dump(), documents.model_dump()],
        "finding_count": len(mileage.findings) + len(documents.findings),
        "high_severity_count": sum(
            1 for f in mileage.findings + documents.findings if f.severity == "high"
        ),
        "disclaimer": "Detector outputs are leads for human review, never proof of fraud or authenticity.",
    }
